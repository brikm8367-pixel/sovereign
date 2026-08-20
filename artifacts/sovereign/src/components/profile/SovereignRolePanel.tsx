import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole, ManagedCelebrity } from '@/hooks/useRole.tsx';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Crown, UserCog, KeyRound, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { InviteManagerDialog } from './InviteManagerDialog';
import { KillSwitch } from './KillSwitch';
import { ManagerActivityLog } from './ManagerActivityLog';

interface ManagerRow {
  id: string;
  manager_id: string;
  status: string;
  display_name: string | null;
  username: string | null;
}

export function SovereignRolePanel() {
  const { user } = useAuth();
  const { accountType, role, managedCelebrityId, managedCelebrities, loading, refresh, switchCelebrity } = useRole();
  const { isRTL } = useLanguage();
  const [updating, setUpdating] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [celebName, setCelebName] = useState<string | null>(null);

  const loadManagers = async () => {
    if (!user || accountType !== 'celebrity') return;
    const { data } = await supabase
      .from('manager_links')
      .select('id, manager_id, status')
      .eq('celebrity_id', user.id);
    if (!data) return;
    const ids = data.map((d: any) => d.manager_id);
    let profiles: any[] = [];
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('id, display_name, username').in('id', ids);
      profiles = p || [];
    }
    setManagers(
      data.map((d: any) => {
        const prof = profiles.find((p) => p.id === d.manager_id);
        return { ...d, display_name: prof?.display_name ?? null, username: prof?.username ?? null };
      })
    );
  };

  useEffect(() => { loadManagers(); }, [user, accountType]);

  useEffect(() => {
    if (role === 'manager' && managedCelebrityId) {
      supabase.from('profiles').select('display_name, username').eq('id', managedCelebrityId).maybeSingle()
        .then(({ data }) => setCelebName((data as any)?.display_name || (data as any)?.username || null));
    }
  }, [role, managedCelebrityId]);

  const revoke = async (id: string) => {
    const { error } = await supabase.from('manager_links').update({ status: 'revoked' } as any).eq('id', id);
    if (error) { toast.error(isRTL ? 'فشل الإلغاء' : 'Failed'); return; }
    toast.success(isRTL ? 'تم سحب صلاحية الوكيل' : 'Manager access revoked');
    loadManagers();
  };

  if (loading) return null;

  return (
    <div className="mt-6 space-y-4">
    <div className="p-4 rounded-2xl bg-card border border-border space-y-4">
      <div className="flex items-center gap-2">
        <Crown className="h-4 w-4 text-amber-500" />
        <p className="font-semibold text-sm">{isRTL ? 'الدور في Sovereign' : 'Sovereign Role'}</p>
      </div>

      {role === 'manager' && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <p className="text-sm font-medium flex items-center gap-2">
              <UserCog className="h-4 w-4 text-blue-500" />
              {isRTL ? 'أنت وكيل لـ' : 'You manage'} {celebName ? `@${celebName}` : ''}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">{isRTL ? 'ترى صندوق العمل فقط' : 'You only see the Business box'}</p>
          </div>

          {/* Managed celebrities list for switching */}
          {managedCelebrities.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{isRTL ? 'المشاهير الذين تديرهم' : 'Managed Celebrities'}</p>
              {managedCelebrities.map((c: ManagedCelebrity) => {
                const isActive = c.id === managedCelebrityId;
                const initials = (c.display_name || c.username || '?')[0].toUpperCase();
                return (
                  <button
                    key={c.id}
                    onClick={() => switchCelebrity(c.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-start transition-colors ${
                      isActive
                        ? 'bg-primary/10 border border-primary/30'
                        : 'bg-muted/40 border border-transparent hover:bg-muted/60'
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {c.avatar_url ? (
                        <img src={c.avatar_url} alt="" className="h-8 w-8 rounded-full" />
                      ) : (
                        <span className="text-sm font-bold">{initials}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-primary' : ''}`}>
                        {c.display_name || c.username || '—'}
                      </p>
                      {c.username && (
                        <p className="text-[11px] text-muted-foreground truncate">@{c.username}</p>
                      )}
                    </div>
                    {isActive && (
                      <span className="text-xs font-medium text-primary px-2 py-1 rounded-full bg-primary/10">
                        {isRTL ? 'نشط' : 'Active'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Celebrity: invite + manage managers */}
      {accountType === 'celebrity' && (
        <div className="space-y-3">
          <Button onClick={() => setInviteOpen(true)} variant="outline" className="w-full rounded-xl">
            <KeyRound className="h-4 w-4 me-2" />
            {isRTL ? 'دعوة وكيل' : 'Invite Manager'}
          </Button>
          <InviteManagerDialog open={inviteOpen} onOpenChange={setInviteOpen} />

          {managers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{isRTL ? 'الوكلاء' : 'Managers'}</p>
              {managers.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.display_name || m.username || '—'}</p>
                    <p className={`text-[11px] ${m.status === 'active' ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      {m.status === 'active' ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'مُلغى' : 'Revoked')}
                    </p>
                  </div>
                  {m.status === 'active' && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(m.id)} className="text-destructive h-8">
                      <ShieldOff className="h-4 w-4 me-1" />
                      {isRTL ? 'سحب' : 'Revoke'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {managers.some((m) => m.status === 'active') && (
            <KillSwitch onDone={loadManagers} />
          )}

          <ManagerActivityLog />
        </div>
      )}
    </div>
    </div>
  );
}
