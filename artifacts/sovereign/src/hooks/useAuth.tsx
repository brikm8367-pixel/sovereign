import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { initE2EKeys, ensureUserE2EReady } from '@/utils/e2eManager';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null; userId?: string }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
  deleteAccount: () => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function transliterateArabicToEnglish(text: string): string {
  const arabicToEnglishMap: Record<string, string> = {
    'Ø§': 'a', 'Ø¨': 'b', 'Øª': 't', 'Ø«': 'th', 'Ø¬': 'j', 'Ø­': 'h', 'Ø®': 'kh',
    'Ø¯': 'd', 'Ø°': 'dh', 'Ø±': 'r', 'Ø²': 'z', 'Ø³': 's', 'Ø´': 'sh', 'Øµ': 's',
    'Ø¶': 'd', 'Ø·': 't', 'Ø¸': 'z', 'Ø¹': 'a', 'Øº': 'gh', 'Ù': 'f', 'Ù‚': 'q',
    'Ùƒ': 'k', 'Ù„': 'l', 'Ù…': 'm', 'Ù†': 'n', 'Ù‡': 'h', 'Ùˆ': 'w', 'ÙŠ': 'y',
    'Ø¡': '', 'Ø¢': 'a', 'Ø£': 'a', 'Ø¥': 'i', 'Ø¤': 'u', 'Ø¦': 'i', 'Ø©': 'h',
    'Ù‰': 'a',
  };
  let result = '';
  for (const char of text) {
    result += arabicToEnglishMap[char] || char;
  }
  return result;
}

function normalizeName(name: string): string {
  let normalized = transliterateArabicToEnglish(name);
  normalized = normalized.toLowerCase();
  normalized = normalized.replace(/\s+/g, '_');
  normalized = normalized.replace(/[^a-z0-9_]/g, '');
  return normalized;
}

async function generateUniqueUsername(firstName: string, lastName: string): Promise<string> {
  const normalizedFirst = normalizeName(firstName);
  const normalizedLast = normalizeName(lastName);
  let baseUsername = `${normalizedFirst}_${normalizedLast}`.replace(/_+/g, '_').replace(/^_|_$/g, '');
  
  if (!baseUsername) {
    baseUsername = 'user';
  }

  let username = baseUsername;
  let counter = 0;
  while (true) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (!data) break;
    counter++;
    username = `${baseUsername}_${counter}`;
  }
  return username;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // STEP 1A: Add ref to track if initial session has been handled
  const initialSessionHandledRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    // Safety timeout: force loading to false after 10 seconds to prevent stuck loading screen
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        const hasSession = !!Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (!hasSession) {
          console.warn('[Auth] Safety timeout reached, forcing loading=false');
          setLoading(false);
        }
      }
    }, 10000);

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        // STEP 1B: Mark initial session as handled
        initialSessionHandledRef.current = true;
        // Set loading false IMMEDIATELY after session/user are set
        if (mounted) setLoading(false);
        
        // Initialize E2E keys for existing session in background (non-awaited)
        if (session?.user) {
          ensureUserE2EReady(session.user.id).then(hasKeys => {
            if (!hasKeys) return initE2EKeys(session.user.id);
          }).catch(err => console.warn('[Auth] Background E2E init failed', err));
        }
      } catch (e) {
        console.error('[Auth] Initialization error', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      
      // STEP 1C: Skip duplicate INITIAL_SESSION event that fires right after initializeAuth
      if (!initialSessionHandledRef.current && _event === 'INITIAL_SESSION') {
        initialSessionHandledRef.current = true;
      }
      
      setSession(session);
      setUser(session?.user ?? null);
      
      // Set loading false IMMEDIATELY after session/user are set
      if (mounted) setLoading(false);
      
      // STEP 1D: Clean E2E initialization block - no outer try/catch, promise owns its errors
      if (session?.user) {
        const backupPassword = sessionStorage.getItem('login_password_for_backup');
        console.log('[AUTH-DIAG] onAuthStateChange event:', _event, 'hasPassword:', !!backupPassword);
        if (backupPassword && _event === 'SIGNED_IN') {
          console.log('[AUTH-DIAG] Backup sync block entered');
          (async () => {
            try {
              const { downloadKeyBackup, uploadKeyBackup } = await import('@/utils/e2eBackup');
              const { getStoredKeysSecure } = await import('@/utils/encryption');
              const localKeys = await getStoredKeysSecure();
              console.log('[AUTH-DIAG] localKeys present:', !!localKeys);
              if (!localKeys) {
                const dl = await downloadKeyBackup(backupPassword, session.user.id);
                if (!dl.success && dl.error === 'no_backup_found') {
                  try {
                    await initE2EKeys(session.user.id);
                  } catch (e) {
                    if (e && e.message === 'e2e_key_pair_corrupted' && backupPassword) {
                      const { autoRecoverKeys } = await import('../utils/e2eManager');
                      const result = await autoRecoverKeys(session.user.id, backupPassword);
                      console.log('[Auth] autoRecoverKeys result:', result);
                    } else {
                      console.error('[Auth] E2E key initialization failed during backup sync', e);
                    }
                  }
                  if (backupPassword) {
                    const { autoRecoverKeys } = await import('../utils/e2eManager');
                    const result = await autoRecoverKeys(session.user.id, backupPassword);
                    console.log('[Auth] autoRecoverKeys result:', result);
                  }
                  await uploadKeyBackup(backupPassword, session.user.id);
                }
              } else {
                await uploadKeyBackup(backupPassword, session.user.id);
                console.log('[AUTH-DIAG] Upload complete - should be in DB now');
                if (backupPassword) {
                  const { autoRecoverKeys } = await import('../utils/e2eManager');
                  const result = await autoRecoverKeys(session.user.id, backupPassword);
                  console.log('[Auth] autoRecoverKeys result:', result);
                }
              }
            } catch (e) {
              console.log('[AUTH-DIAG] Backup sync catch triggered:', e);
              console.warn('[Auth] key backup sync failed', e);
            } finally {
              sessionStorage.removeItem('login_password_for_backup');
            }
          })();
        } else {
          ensureUserE2EReady(session.user.id).then(async (hasKeys) => {
            if (!hasKeys) {
              try {
                await initE2EKeys(session.user.id);
              } catch (e) {
                if (e && e.message === 'e2e_key_pair_corrupted' && backupPassword) {
                  const { autoRecoverKeys } = await import('../utils/e2eManager');
                  const result = await autoRecoverKeys(session.user.id, backupPassword);
                  console.log('[Auth] autoRecoverKeys result:', result);
                } else {
                  console.error('[Auth] E2E key initialization failed on auth state change', e);
                }
              }
              if (backupPassword) {
                const { autoRecoverKeys } = await import('../utils/e2eManager');
                const result = await autoRecoverKeys(session.user.id, backupPassword);
                console.log('[Auth] autoRecoverKeys result:', result);
              }
            }
          }).catch(err => console.error('[Auth] E2E key initialization failed on auth state change', err));
        }
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };
    if (!data.user) return { error: new Error('Signup failed') };

    const nameParts = displayName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const username = await generateUniqueUsername(firstName, lastName);

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: data.user.id,
      username,
      display_name: displayName,
      account_type: 'sender',
    }, { onConflict: 'id' });
    if (profileError) return { error: profileError };

    // Initialize E2E keys for the new user immediately (even before email confirmation)
    try {
      await initE2EKeys(data.user.id);
    } catch (e) {
      console.error('[Auth] E2E key initialization failed during signup', e);
      // Don't fail signup if E2E init fails - will retry on first login
    }

    return { error: null, userId: data.user.id };
  };

  const signIn = async (email: string, password: string) => {
    sessionStorage.setItem('login_password_for_backup', password);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      sessionStorage.removeItem('login_password_for_backup');
    } else {
      setTimeout(() => sessionStorage.removeItem('login_password_for_backup'), 60000);
    }
    return { error };
  };

  const signOut = async () => {
    sessionStorage.removeItem('login_password_for_backup');
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const deleteAccount = async () => {
    if (!user) return { error: new Error('No user') };
    const { error } = await supabase.functions.invoke('delete-account', {
      body: { password: '' },
    });
    return { error };
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signUp, signIn, signOut, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
