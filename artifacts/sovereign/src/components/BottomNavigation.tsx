import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { Home, Briefcase, Bell, User, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: { ar: string; en: string; fr: string; es: string };
  path: string;
}

const leftNavItems: NavItem[] = [
  { id: 'home', icon: Home, label: { ar: 'الرئيسية', en: 'Home', fr: 'Accueil', es: 'Inicio' }, path: '/home' },
  { id: 'offers', icon: Briefcase, label: { ar: 'العروض', en: 'Offers', fr: 'Offres', es: 'Ofertas' }, path: '/offers' },
];

const rightNavItems: NavItem[] = [
  { id: 'notifications', icon: Bell, label: { ar: 'إشعارات', en: 'Alerts', fr: 'Alertes', es: 'Alertas' }, path: '/notifications' },
  { id: 'profile', icon: User, label: { ar: 'حسابي', en: 'Profile', fr: 'Profil', es: 'Perfil' }, path: '/profile' },
];

export function BottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { role } = useRole();
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch unread message count for badge
  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false);
      setUnreadCount(count || 0);
    };
    fetchUnread();

    // Listen for new messages
    const channel = supabase
      .channel('nav-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, () => {
        fetchUnread();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const isActive = (path: string) => {
    if (path.includes('?')) {
      return location.pathname + location.search === path;
    }
    return location.pathname === path;
  };

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.path);
    const Icon = item.icon;
    const showBadge = item.id === 'notifications' && unreadCount > 0;

    return (
      <button
        key={item.id}
        onClick={() => navigate(item.path)}
        className={cn(
          'flex flex-col items-center justify-center flex-1 h-full px-1 transition-all touch-feedback',
          active && 'text-primary'
        )}
        style={{ minWidth: 0 }}
      >
        <div className={cn(
          'relative flex items-center justify-center w-10 h-10 rounded-xl transition-all mx-auto',
          active && 'bg-primary/10'
        )}>
          <Icon className={cn(
            'h-5 w-5 transition-all',
            active ? 'text-primary' : 'text-muted-foreground'
          )} />
          {showBadge && (
            <span className="absolute -top-0.5 -end-0.5 w-2 h-2 rounded-full bg-primary shrink-0" />
          )}
        </div>
        <span className={cn(
          'text-[10px] mt-1 font-medium transition-all truncate max-w-[60px]',
          active ? 'text-foreground font-semibold' : 'text-muted-foreground'
        )}>
          {item.label[language] || item.label.en}
        </span>
      </button>
    );
  };

  // For managers: only show Home, Notifications, Profile
  const managerLeftItems = leftNavItems.filter(item => item.id === 'home');
  const managerRightItems = rightNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-area-inset-bottom" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-background/80 backdrop-blur-xl border-t border-border/30">
        <div className="max-w-lg mx-auto flex items-center justify-between h-16 px-3 relative">
          {/* Left Group */}
          <div className="flex items-center justify-center gap-1 w-1/2">
            {(role === 'manager' ? managerLeftItems : leftNavItems).map(renderNavItem)}
          </div>

          {/* Center Create Offer Button - hidden for managers */}
          {role !== 'manager' && (
            <button
              onClick={() => navigate('/search?type=deal')}
              className={cn(
                'flex flex-col items-center justify-center gap-1 transition-all touch-feedback z-10',
                'relative'
              )}
              style={{ transform: 'translateY(-6px)' }}
            >
              <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-primary shadow-[0_8px_24px_rgba(0,0,0,0.12)] ring-1 ring-primary/20">
                <Plus className="h-7 w-7 text-primary-foreground" />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                {isRTL ? 'إنشاء عرض' : 'Create Offer'}
              </span>
            </button>
          )}

          {/* Right Group */}
          <div className="flex items-center justify-center gap-1 w-1/2">
            {(role === 'manager' ? managerRightItems : rightNavItems).map(renderNavItem)}
          </div>
        </div>
      </div>
    </nav>
  );
}
