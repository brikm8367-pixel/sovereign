import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { DealCardInline } from '@/components/deals/DealCardInline';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Loader2 } from 'lucide-react';

export default function OffersPage() {
  const { user, loading } = useAuth();
  const { role } = useRole();
  const { isRTL } = useLanguage();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});

  // Redirect managers to home
  useEffect(() => {
    if (!loading && role === 'manager') {
      navigate('/home', { replace: true });
    }
  }, [loading, role, navigate]);

  // Fetch deals for sender (company)
  useEffect(() => {
    if (!user || role !== 'sender') return;
    
    const fetchDeals = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('deal_cards')
          .select('*')
          .eq('sender_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setDeals(data || []);
      } catch (error) {
        console.error('Error fetching deals:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDeals();

    // Realtime subscription for deal updates
    const channel = supabase
      .channel('offers-realtime-' + user.id)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'deal_cards', filter: `sender_id=eq.${user.id}` },
        () => {
          fetchDeals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, role]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role === 'manager') {
    return null;
  }

  const t = (ar: string, en: string) => (isRTL ? ar : en);

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="fixed top-0 right-0 left-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
        <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
          <h1 className="font-bold text-lg">
            {t('عروضي', 'My Offers')}
            {deals.length > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary ml-2">
                {deals.length}
              </span>
            )}
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto pt-16 pb-20 px-4 space-y-6">
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : deals.length === 0 ? (
            <div className="p-6 bg-card rounded-2xl border border-border text-center">
              <p className="text-sm text-muted-foreground">
                {t('لا توجد عروض بعد', 'No offers yet')}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {t('ابدأ بإنشاء عرض جديد', 'Start by creating a new offer')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {deals.map((deal) => (
                <div key={deal.id} className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                  <DealCardInline 
                    dealId={deal.id} 
                    isRTL={isRTL} 
                    onToggleDetails={() => setShowDetails(prev => ({ ...prev, [deal.id]: !prev[deal.id] }))}
                    showDetails={showDetails[deal.id] || false}
                    showStatusBadge={true}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
}
