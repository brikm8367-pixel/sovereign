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
      // 1. First, check if user is a MANAGER (has active manager_links where manager_id = user.id)
      const { data: managerLinks } = await supabase
        .from('manager_links')
        .select('celebrity_id')
        .eq('manager_id', currentUser.id)
        .eq('status', 'active');

      const isManager = !!managerLinks && managerLinks.length > 0;

      // 2. Check if user is a CELEBRITY (has active manager link where celebrity_id = user.id)
      const { data: activeManagerLink } = await supabase
        .from('manager_links')
        .select('id')
        .eq('celebrity_id', currentUser.id)
        .eq('status', 'active')
        .limit(1);

      const isCelebrity = !!activeManagerLink && activeManagerLink.length > 0;

      // 3. Fetch profile for account_type (used as fallback)
      const { data: profile } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('id', currentUser.id)
        .maybeSingle();

      // 4. Determine role and accountType based on priority:
      //    - If manager_links exist as manager → role = 'manager'
      //    - Else if active manager link as celebrity → accountType = 'celebrity', role = 'celebrity'
      //    - Else use profile.account_type (sender or celebrity)
      let determinedAccountType: AccountType = 'sender';
      let determinedRole: UserRole = 'sender';
      let celebrityIds: string[] = [];

      if (isManager) {
        // User is a manager - highest priority for role determination
        determinedRole = 'manager';
        determinedAccountType = 'sender'; // Managers are senders by account type
        celebrityIds = managerLinks.map(l => l.celebrity_id);
      } else if (isCelebrity) {
        // User is a celebrity with an active manager
        determinedAccountType = 'celebrity';
        determinedRole = 'celebrity';
        // Fetch managed celebrities (where user is manager) - celebrities can also manage others
        const { data: celebrityManagerLinks } = await supabase
          .from('manager_links')
          .select('celebrity_id')
          .eq('manager_id', currentUser.id)
          .eq('status', 'active');
        if (celebrityManagerLinks?.length) {
          celebrityIds = celebrityManagerLinks.map(l => l.celebrity_id);
        }
      } else {
        // Neither manager nor celebrity with agent - use profile account_type
        determinedAccountType = (profile?.account_type as AccountType) || 'sender';
        if (determinedAccountType === 'celebrity') {
          determinedRole = 'celebrity';
          // Fetch managed celebrities for this celebrity
          const { data: celebrityManagerLinks } = await supabase
            .from('manager_links')
            .select('celebrity_id')
            .eq('manager_id', currentUser.id)
            .eq('status', 'active');
          if (celebrityManagerLinks?.length) {
            celebrityIds = celebrityManagerLinks.map(l => l.celebrity_id);
          }
        } else {
          determinedRole = 'sender';
        }
      }

      setAccountType(determinedAccountType);
      setRole(determinedRole);

      // 5. Fetch managed celebrity profiles if any
      if (celebrityIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_url')
          .in('id', celebrityIds);
        const managed = (profiles as ManagedCelebrity[]) || [];
        setManagedCelebrities(managed);
        // Set active celebrity if not set
        if (!managedCelebrityIdRef.current && managed.length > 0) {
          setManagedCelebrityId(managed[0].id);
        }
      } else {
        setManagedCelebrities([]);
        if (!managedCelebrityIdRef.current) {
          setManagedCelebrityId(null);
        }
      }
    } catch (error) {
      console.error('Error refreshing role:', error);
      // On error, reset to safe defaults
      setAccountType('sender');
      setRole('sender');
      setManagedCelebrities([]);
      setManagedCelebrityId(null);
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
      // Update ref immediately so refresh() knows a celebrity is selected
      managedCelebrityIdRef.current = celebrityId;
      setManagedCelebrityId(celebrityId);
      // Refresh to sync managedCelebrities list and ensure context is up to date
      await refresh();
    }
  }, [refresh]);

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
