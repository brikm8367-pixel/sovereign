import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Loader2, Building2, DollarSign, Calendar, Globe, FileText, Shield, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Deal {
  id: string;
  deal_type: string | null;
  company_name: string | null;
  budget_range: string | null;
  budget_cycle: string | null;
  timeline: string | null;
  details: string | null;
  website_url: string | null;
  exclusivity: string | null;
  deliverables: string | null;
  why_them: string | null;
  status: string;
  celebrity_id: string | null;
  sender_id: string | null;
  budget_currency: string | null;
}

export default function OffersPage() {
  const { user, loading } = useAuth();
  const { role } = useRole();
  const { isRTL } = useLanguage();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'all' | 'sent' | 'seen' | 'accepted' | 'declined'>('all');

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

  const CURRENCY_FLAGS: Record<string, string> = {
    USD: '🇺🇸',
    EUR: '🇪🇺',
    GBP: '🇬🇧',
    AED: '🇦🇪',
    SAR: '🇸🇦',
    KWD: '🇰🇼',
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'accepted':
        return {
          label: t('تم القبول', 'Accepted'),
          bg: 'bg-green-100 dark:bg-green-900/30',
          text: 'text-green-700 dark:text-green-400',
          border: 'border-green-200 dark:border-green-800',
        };
      case 'declined':
        return {
          label: t('تم الرفض', 'Declined'),
          bg: 'bg-red-100 dark:bg-red-900/30',
          text: 'text-red-700 dark:text-red-400',
          border: 'border-red-200 dark:border-red-800',
        };
      case 'seen':
        return {
          label: t('شوهدت', 'Seen'),
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          text: 'text-blue-700 dark:text-blue-400',
          border: 'border-blue-200 dark:border-blue-800',
        };
      case 'pending':
      default:
        return {
          label: t('قيد المراجعة', 'Pending'),
          bg: 'bg-amber-100 dark:bg-amber-900/30',
          text: 'text-amber-700 dark:text-amber-400',
          border: 'border-amber-200 dark:border-amber-800',
        };
    }
  };

  const getDealTypeConfig = (type: string | null) => {
    const types: Record<string, { label: string; color: string }> = {
      sponsorship: { 
        label: t('رعاية', 'Sponsorship'), 
        color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' 
      },
      appearance: { 
        label: t('ظهور إعلاني', 'Brand Appearance'), 
        color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' 
      },
      event: { 
        label: t('حضور فعالية', 'Event Attendance'), 
        color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' 
      },
      collab: { 
        label: t('تعاون محتوى', 'Content Collab'), 
        color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-800' 
      },
      endorsement: { 
        label: t('ترويج منتج', 'Product Endorsement'), 
        color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800' 
      },
      other: { 
        label: t('أخرى', 'Other'), 
        color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-700' 
      },
    };
    return types[type || 'other'] || types.other;
  };

  function FieldRow({ 
    label, 
    children, 
    icon: Icon,
    className = '' 
  }: { 
    label: string; 
    children: React.ReactNode; 
    icon?: React.ComponentType<{ className?: string }>;
    className?: string 
  }) {
    return (
      <div className={cn('space-y-1', className)}>
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        </div>
        <div className="text-sm font-medium text-foreground whitespace-pre-wrap break-words pl-5">{children}</div>
      </div>
    );
  }

  function SectionDivider() {
    return <div className="border-t border-border/50 my-3" />;
  }

  // Filter deals based on selected tab
  const filteredDeals = deals.filter(deal => {
    switch (selectedTab) {
      case 'sent':
        return true; // all sent deals
      case 'seen':
        return deal.status === 'seen';
      case 'accepted':
        return deal.status === 'accepted';
      case 'declined':
        return deal.status === 'declined';
      case 'all':
      default:
        return true;
    }
  });

  const tabs = [
    { id: 'all', label: { ar: 'الكل', en: 'All' } },
    { id: 'sent', label: { ar: 'مرسلة', en: 'Sent' } },
    { id: 'seen', label: { ar: 'شوهدت', en: 'Seen' } },
    { id: 'accepted', label: { ar: 'مقبولة', en: 'Accepted' } },
    { id: 'declined', label: { ar: 'مرفوضة', en: 'Declined' } },
  ];

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
        {/* Status Tabs */}
        <div className="overflow-x-auto pb-2 -mx-4 px-4">
          <div className="flex gap-2 min-w-max">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id as typeof selectedTab)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all touch-feedback',
                  selectedTab === tab.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {isRTL ? tab.label.ar : tab.label.en}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDeals.length === 0 ? (
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
              {filteredDeals.map((deal) => {
                const statusConfig = getStatusConfig(deal.status);
                const dealTypeConfig = getDealTypeConfig(deal.deal_type);

                return (
                  <div 
                    key={deal.id} 
                    className="rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow p-5"
                  >
                    {/* Header Section */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                          <h3 className="font-semibold text-lg text-foreground truncate">
                            {deal.company_name || t('غير محدد', 'Not specified')}
                          </h3>
                          <Badge 
                            variant="outline" 
                            className={cn('rounded-full px-2.5 py-1 text-xs font-medium h-5', dealTypeConfig.color)}
                          >
                            {dealTypeConfig.label}
                          </Badge>
                        </div>
                      </div>
                      
                      {/* Prominent Status Badge */}
                      <Badge 
                        variant="outline" 
                        className={cn('rounded-full px-3 py-1.5 text-xs font-semibold h-7 shrink-0', statusConfig.bg, statusConfig.text, statusConfig.border)}
                      >
                        {statusConfig.label}
                      </Badge>
                    </div>

                    {/* Main Details Section */}
                    <div className="space-y-4">
                      {/* Budget Range */}
                      {deal.budget_range && (
                        <FieldRow 
                          label={t('الميزانية', 'Budget')} 
                          icon={DollarSign}
                        >
                          <span className="font-semibold text-primary">{deal.budget_range}</span>
                        </FieldRow>
                      )}

                      {/* Budget Currency */}
                      {deal.budget_currency && (
                        <FieldRow 
                          label={t('العملة', 'Currency')} 
                          icon={DollarSign}
                        >
                          <span className="flex items-center gap-1.5">
                            {CURRENCY_FLAGS[deal.budget_currency] || ''}
                            {deal.budget_currency}
                          </span>
                        </FieldRow>
                      )}

                      {/* Budget Cycle */}
                      {deal.budget_cycle && (
                        <FieldRow 
                          label={t('دورة الميزانية', 'Budget Cycle')} 
                          icon={Calendar}
                        >
                          {deal.budget_cycle}
                        </FieldRow>
                      )}

                      {/* Timeline */}
                      {deal.timeline && (
                        <FieldRow 
                          label={t('الجدول الزمني', 'Timeline')} 
                          icon={Calendar}
                        >
                          {deal.timeline}
                        </FieldRow>
                      )}

                      <SectionDivider />

                      {/* Website URL */}
                      {deal.website_url && (
                        <FieldRow 
                          label={t('الموقع الإلكتروني', 'Website')} 
                          icon={Globe}
                        >
                          <a href={deal.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                            {deal.website_url}
                          </a>
                        </FieldRow>
                      )}

                      {/* Exclusivity */}
                      {deal.exclusivity && (
                        <FieldRow 
                          label={t('الحصرية', 'Exclusivity')} 
                          icon={Shield}
                        >
                          {deal.exclusivity}
                        </FieldRow>
                      )}

                      {/* Deliverables */}
                      {deal.deliverables && (
                        <FieldRow 
                          label={t('المخرجات', 'Deliverables')} 
                          icon={FileText}
                        >
                          {deal.deliverables}
                        </FieldRow>
                      )}

                      {/* Why Them */}
                      {deal.why_them && (
                        <FieldRow 
                          label={t('لماذا هم', 'Why Them')} 
                          icon={UserCheck}
                        >
                          {deal.why_them}
                        </FieldRow>
                      )}

                      {/* Description / Pitch */}
                      {deal.details && (
                        <>
                          <SectionDivider />
                          <FieldRow 
                            label={t('الوصف', 'Description')} 
                            icon={FileText}
                          >
                            {deal.details}
                          </FieldRow>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
}
