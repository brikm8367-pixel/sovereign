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
  const roleRef = useRef(role);
  const accountTypeRef = useRef(accountType);
  
  managedCelebrityIdRef.current = managedCelebrityId;
  userRef.current = user;
  roleRef.current = role;
  accountTypeRef.current = accountType;

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
      // 1. FIRST: Check manager_links where manager_id = user.id and status = 'active'
      // This must come BEFORE checking profile account_type to preserve manager role on reload
      const { data: managerLinks, error: managerLinksError } = await supabase
        .from('manager_links')
        .select('celebrity_id')
        .eq('manager_id', currentUser.id)
        .eq('status', 'active');

      if (managerLinksError) {
        console.error('Error fetching manager links:', managerLinksError);
      }

      const isManager = !!managerLinks && managerLinks.length > 0;

      // 2. If active manager links exist → role = 'manager', accountType = 'sender'
      if (isManager) {
        const celebrityIds = managerLinks.map(l => l.celebrity_id);
        
        // Fetch managed celebrity profiles
        let managed: ManagedCelebrity[] = [];
        if (celebrityIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', celebrityIds);
          
          if (profilesError) {
            console.error('Error fetching managed celebrity profiles:', profilesError);
          } else {
            managed = (profiles as ManagedCelebrity[]) || [];
          }
        } else {
          // Manager links exist but no celebrity IDs - clear managedCelebrityId
          managedCelebrityIdRef.current = null;
          setManagedCelebrityId(null);
        }

        setAccountType('sender');
        setRole('manager');
        setManagedCelebrities(managed);
        
        // Validate managedCelebrityId against fetched managed list
        // If current managedCelebrityId is not in the managed list, reset to first managed celebrity
        // If managedCelebrityId is null but managed list is not empty, set to first managed celebrity
        if (managedCelebrityIdRef.current && !managed.some(c => c.id === managedCelebrityIdRef.current)) {
          const newId = managed[0]?.id || null;
          managedCelebrityIdRef.current = newId;
          setManagedCelebrityId(newId);
        } else if (!managedCelebrityIdRef.current && managed.length > 0) {
          // Set managedCelebrityId to first managed celebrity if not already set
          managedCelebrityIdRef.current = managed[0].id;
          setManagedCelebrityId(managed[0].id);
        }
        // If managedCelebrityIdRef.current is valid and exists in managed list, keep it (do not clear)
        
        setLoading(false);
        return;
      }

      // 3. Only if no active manager links exist, check profile account_type
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
      }

      const profileAccountType = (profile?.account_type as AccountType) || 'sender';

      // 4. Check if user is a celebrity with active manager
      const { data: activeManagerLink, error: activeManagerError } = await supabase
        .from('manager_links')
        .select('id')
        .eq('celebrity_id', currentUser.id)
        .eq('status', 'active')
        .limit(1);

      if (activeManagerError) {
        console.error('Error checking active manager link:', activeManagerError);
      }

      const isCelebrity = !!activeManagerLink && activeManagerLink.length > 0;

      let determinedAccountType: AccountType = 'sender';
      let determinedRole: UserRole = 'sender';
      let celebrityIds: string[] = [];

      if (isCelebrity) {
        // User is a celebrity with an active manager
        determinedAccountType = 'celebrity';
        determinedRole = 'celebrity';
        // Fetch managed celebrities (where user is manager) - celebrities can also manage others
        const { data: celebrityManagerLinks, error: celebManagerError } = await supabase
          .from('manager_links')
          .select('celebrity_id')
          .eq('manager_id', currentUser.id)
          .eq('status', 'active');
        
        if (celebManagerError) {
          console.error('Error fetching celebrity manager links:', celebManagerError);
        }
        
        if (celebrityManagerLinks?.length) {
          celebrityIds = celebrityManagerLinks.map(l => l.celebrity_id);
        }
      } else {
        // Use profile account_type
        determinedAccountType = profileAccountType;
        if (determinedAccountType === 'celebrity') {
          determinedRole = 'celebrity';
          // Fetch managed celebrities for this celebrity
          const { data: celebrityManagerLinks, error: celebManagerError } = await supabase
            .from('manager_links')
            .select('celebrity_id')
            .eq('manager_id', currentUser.id)
            .eq('status', 'active');
          
          if (celebManagerError) {
            console.error('Error fetching celebrity manager links:', celebManagerError);
          }
          
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
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_url')
          .in('id', celebrityIds);
        
        if (profilesError) {
          console.error('Error fetching managed celebrity profiles:', profilesError);
        }
        
        const managed = (profiles as ManagedCelebrity[]) || [];
        setManagedCelebrities(managed);
        
        // Validate managedCelebrityId against fetched managed list
        if (managedCelebrityIdRef.current && !managed.some(c => c.id === managedCelebrityIdRef.current)) {
          const newId = managed[0]?.id || null;
          managedCelebrityIdRef.current = newId;
          setManagedCelebrityId(newId);
        } else if (!managedCelebrityIdRef.current && managed.length > 0) {
          // Set active celebrity if not set
          managedCelebrityIdRef.current = managed[0].id;
          setManagedCelebrityId(managed[0].id);
        }
        // If managedCelebrityIdRef.current is valid and exists in managed list, keep it (do not clear)
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
    const { data: link, error } = await supabase
      .from('manager_links')
      .select('id')
      .eq('manager_id', currentUser.id)
      .eq('celebrity_id', celebrityId)
      .eq('status', 'active')
      .maybeSingle();
    
    if (error) {
      console.error('Error verifying celebrity link:', error);
      return;
    }
    
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
  }, [refresh, user]);

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
