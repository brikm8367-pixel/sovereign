import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Loader2, Bell, CheckCheck, Filter, Briefcase, Users, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type MessageCategory = 'work' | 'audience' | 'direct';

interface Notification {
  id: string;
  sender_id: string;
  receiver_id: string;
  sender_profile: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
  subject: string | null;
  content: string;
  is_read: boolean;
  created_at: string;
  category: MessageCategory;
}

interface Profile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const { role, managedCelebrityId } = useRole();
  const { isRTL } = useLanguage();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<MessageCategory | 'all'>('all');

  useEffect(() => {
    if (!loading && !user) navigate('/');
  }, [user, loading, navigate]);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!user) return;
      setIsLoading(true);

      let query;
      if (role === 'manager' && managedCelebrityId) {
        // Manager viewing managed celebrity's work notifications (received only)
        query = supabase
          .from('messages')
          .select('*')
          .eq('receiver_id', managedCelebrityId)
          .eq('category', 'work')
          .order('created_at', { ascending: false });
      } else {
        // Current user logic: all received messages (with category filter for managers? but role is not manager here)
        const targetId = user.id;
        query = supabase
          .from('messages')
          .select('*')
          .eq('receiver_id', targetId)
          .order('created_at', { ascending: false });
      }

      const { data: notificationsData, error: notificationsError } = await query;

      if (notificationsError) {
        console.error('Error fetching notifications:', notificationsError);
        setIsLoading(false);
        return;
      }

      const notifications = (notificationsData as unknown as Notification[]) || [];

      // Extract unique sender_ids
      const senderIds = Array.from(new Set(notifications.map(n => n.sender_id).filter(Boolean)));

      // Fetch profiles for those sender_ids
      let profilesMap: Record<string, Profile> = {};
      if (senderIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_url')
          .in('id', senderIds);

        if (profilesData) {
          profilesMap = profilesData.reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
          }, {} as Record<string, Profile>);
        }
      }

      // Merge profile data into notifications
      const notificationsWithProfiles = notifications.map(notification => ({
        ...notification,
        sender_profile: profilesMap[notification.sender_id] || {
          id: notification.sender_id,
          display_name: null,
          username: null,
          avatar_url: null,
        },
      }));

      setNotifications(notificationsWithProfiles);
      setIsLoading(false);
    };

    if (user) {
      fetchNotifications();
    }
  }, [user, role, managedCelebrityId]);

  const handleMarkAllRead = async () => {
    if (!user) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .in('id', unreadIds);

    if (error) {
      toast.error(isRTL ? 'فشل تحديث الإشعارات' : 'Failed to update notifications');
    } else {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success(isRTL ? 'تم تحديد الكل كمقروء' : 'All marked as read');
    }
  };

  const filteredNotifications = filter === 'all' 
    ? notifications 
    : notifications.filter(n => n.category === filter);

  const categoryConfig = {
    work: { icon: Briefcase, label: isRTL ? 'العمل' : 'Work', color: 'text-[hsl(var(--work))]' },
    audience: { icon: Users, label: isRTL ? 'الجمهور' : 'Audience', color: 'text-[hsl(var(--audience))]' },
    direct: { icon: Lock, label: isRTL ? 'خاص' : 'Direct', color: 'text-[hsl(var(--others))]' },
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="fixed top-0 right-0 left-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
        <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
          <h1 className="font-bold text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {isRTL ? 'الإشعارات' : 'Notifications'}
          </h1>
          <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="rounded-xl">
            <CheckCheck className="h-4 w-4 me-2" />
            {isRTL ? 'تحديد الكل كمقروء' : 'Mark all read'}
          </Button>
        </div>
      </header>

      <main className="max-w-lg mx-auto pt-16 pb-20 px-4">
        {/* Filters - only show work tab for managers */}
        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
          {role === 'manager' ? (
            <button
              onClick={() => setFilter('work')}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-colors shrink-0',
                'bg-primary text-primary-foreground'
              )}
            >
              <Briefcase className="h-4 w-4 me-2" />
              {isRTL ? 'العمل' : 'Work'}
            </button>
          ) : (
            <>
              <button
                onClick={() => setFilter('all')}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-colors shrink-0',
                  filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                {isRTL ? 'الكل' : 'All'}
              </button>
              {(Object.keys(categoryConfig) as MessageCategory[]).map(cat => {
                const config = categoryConfig[cat];
                const Icon = config.icon;
                return (
                  <button
                    key={cat}
                    onClick={() => setFilter(cat)}
                    className={cn(
                      'px-4 py-2 rounded-full text-sm font-medium transition-colors shrink-0 flex items-center gap-2',
                      filter === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {config.label}
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Notifications List */}
        <div className="space-y-2">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">
                {isRTL ? 'لا توجد إشعارات' : 'No notifications'}
              </p>
            </div>
          ) : (
            filteredNotifications.map(notification => (
              <div
                key={notification.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-2xl bg-card border border-border touch-feedback cursor-pointer',
                  !notification.is_read && 'bg-primary/5 border-primary/20'
                )}
                onClick={async () => {
                  if (!notification.is_read) {
                    await supabase.from('messages').update({ is_read: true }).eq('id', notification.id);
                    setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n));
                  }
                  navigate('/dashboard');
                }}
              >
                <Avatar className="h-10 w-10 ring-2 ring-primary/10">
                  <AvatarImage src={notification.sender_profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {notification.sender_profile?.display_name?.[0] || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm truncate">
                      {notification.sender_profile?.display_name || notification.sender_profile?.username || 'Unknown'}
                    </p>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {new Date(notification.created_at).toLocaleTimeString(isRTL ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {notification.subject || notification.content}
                  </p>
                </div>
                {!notification.is_read && (
                  <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                )}
              </div>
            ))
          )}
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
}
