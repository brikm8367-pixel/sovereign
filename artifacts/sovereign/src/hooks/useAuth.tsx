import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { initE2EKeys, ensureUserE2EReady } from '@/utils/e2eManager';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
  deleteAccount: () => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function transliterateArabicToEnglish(text: string): string {
  const arabicToEnglishMap: Record<string, string> = {
    'ا': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
    'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's',
    'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
    'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y',
    'ء': '', 'آ': 'a', 'أ': 'a', 'إ': 'i', 'ؤ': 'u', 'ئ': 'i', 'ة': 'h',
    'ى': 'a',
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Ensure E2E keys are initialized whenever a user session is established
      if (session?.user) {
        const hasKeys = await ensureUserE2EReady(session.user.id);
        if (!hasKeys) {
          await initE2EKeys(session.user.id);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };
    if (!data.user) return { error: new Error('Signup failed') };

    const nameParts = displayName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const username = await generateUniqueUsername(firstName, lastName);

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      username,
      display_name: displayName,
      account_type: 'sender',
    });
    if (profileError) return { error: profileError };

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
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
