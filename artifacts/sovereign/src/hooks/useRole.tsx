import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type UserRole = 'celebrity' | 'sender' | 'manager';
export type AccountType = 'celebrity' | 'sender';

export type ManagedCelebrity = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

interface RoleContextType {
  accountType: AccountType;
  role: UserRole;
  managedCelebrityId: string | null;
  managedCelebrities: ManagedCelebrity[];
  loading: boolean;
  refresh: () => Promise<void>;
  switchCelebrity: (celebrityId: string) => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [accountType, setAccountType] = useState<AccountType>('sender');
  const [role, setRole] = useState<UserRole>('sender');
  const [managedCelebrityId, setManagedCelebrityId] = useState<string | null>(null);
  const [managedCelebrities, setManagedCelebrities] = useState<ManagedCelebrity[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Use refs to store latest values for use in callbacks without triggering re-renders
  const managedCelebrityIdRef = useRef(managedCelebrityId);
  const userRef = useRef(user);
  
  managedCelebrityIdRef.current = managedCelebrityId;
  userRef.current = user;

  const refresh = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser) {
      setAccountType('sender');
      setRole('sender');
      setManagedCelebrityId(null);
      setManagedCelebrities([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch profile to get account_type
      const { data: profile } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('id', currentUser.id)
        .maybeSingle();

      // Check if user has an active manager link (is a celebrity with an agent)
      const { data: activeManagerLink } = await supabase
        .from('manager_links')
        .select('id')
        .eq('celebrity_id', currentUser.id)
        .eq('status', 'active')
        .limit(1);

      // If user has an active manager, they are a celebrity regardless of profile.account_type
      const hasActiveManager = !!activeManagerLink && activeManagerLink.length > 0;
      const type = hasActiveManager ? 'celebrity' : ((profile?.account_type as AccountType) || 'sender');
      setAccountType(type);

      if (type === 'celebrity') {
        setRole('celebrity');
        // Fetch managed celebrities (where user is manager)
        const { data: links } = await supabase
          .from('manager_links')
          .select('celebrity_id')
          .eq('manager_id', currentUser.id)
          .eq('status', 'active');

        if (links?.length) {
          const celebrityIds = links.map(l => l.celebrity_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', celebrityIds);
          setManagedCelebrities(profiles as ManagedCelebrity[] || []);
          // Set active celebrity if not set
          if (!managedCelebrityIdRef.current && profiles?.length) {
            setManagedCelebrityId(profiles[0].id);
          }
        }
      } else if (type === 'sender') {
        // Check if user is a manager for any celebrity
        const { data: links } = await supabase
          .from('manager_links')
          .select('celebrity_id')
          .eq('manager_id', currentUser.id)
          .eq('status', 'active');

        if (links?.length) {
          setRole('manager');
          const celebrityIds = links.map(l => l.celebrity_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', celebrityIds);
          setManagedCelebrities(profiles as ManagedCelebrity[] || []);
          if (!managedCelebrityIdRef.current && profiles?.length) {
            setManagedCelebrityId(profiles[0].id);
          }
        } else {
          setRole('sender');
          setManagedCelebrityId(null);
          setManagedCelebrities([]);
        }
      }
    } catch (error) {
      console.error('Error refreshing role:', error);
    } finally {
      setLoading(false);
    }
  }, []); // Empty deps - uses refs for current values

  const switchCelebrity = useCallback(async (celebrityId: string) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    
    // Verify the celebrity is in the managed list
    const { data: link } = await supabase
      .from('manager_links')
      .select('id')
      .eq('manager_id', currentUser.id)
      .eq('celebrity_id', celebrityId)
      .eq('status', 'active')
      .maybeSingle();
    
    if (link) {
      setManagedCelebrityId(celebrityId);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <RoleContext.Provider value={{
      accountType,
      role,
      managedCelebrityId,
      managedCelebrities,
      loading,
      refresh,
      switchCelebrity,
    }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
