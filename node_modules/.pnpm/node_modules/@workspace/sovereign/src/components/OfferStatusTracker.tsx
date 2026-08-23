import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Inbox, Globe, Calendar, FileText, DollarSign, Building2, Briefcase, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

interface CelebrityProfile {
  display_name: string | null;
  username: string | null;
}

interface DealCard {
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
  created_at: string;
  celebrity_profile: CelebrityProfile | null;
  message_id: string | null;
  viewed_at: string | null;
  conversation_partner_id?: string | null;
}

type FilterType = 'all' | 'sent' | 'seen' | 'interested' | 'declined';

export default function OfferStatusTracker() {
  const { user } = useAuth();
  const { isRTL } = useLanguage();
  const navigate = useNavigate();

  const [offers, setOffers] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);

  const t = useCallback((ar: string, en: string) => (isRTL ? ar : en), [isRTL]);

  const fetchOffers = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Fetch deal cards without celebrity profile join
      const { data, error } = await supabase
        .from('deal_cards')
        .select(`
          id,
          deal_type,
          company_name,
          budget_range,
          budget_cycle,
          timeline,
          details,
          website_url,
          exclusivity,
          deliverables,
          why_them,
          status,
          created_at,
          message_id,
          viewed_at,
          celebrity_id
        `)
        .eq('sender_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching offers:', error);
        setOffers([]);
        setLoading(false);
        return;
      }

      const fetchedOffers = (data as unknown as (DealCard & { celebrity_id: string })[]) || [];

      // Extract unique celebrity_ids
      const celebrityIds = Array.from(new Set(fetchedOffers.map(o => o.celebrity_id).filter(Boolean)));

      // Fetch profiles for those celebrity_ids
      let profilesMap: Record<string, CelebrityProfile> = {};
      if (celebrityIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_url')
          .in('id', celebrityIds);

        if (profilesData) {
          profilesMap = profilesData.reduce((acc, p) => {
            acc[p.id] = { display_name: p.display_name, username: p.username };
            return acc;
          }, {} as Record<string, CelebrityProfile>);
        }
      }

      // Merge profiles into offers
      const offersWithProfiles = fetchedOffers.map(offer => ({
        ...offer,
        celebrity_profile: profilesMap[offer.celebrity_id] || null,
      }));

      // For offers with message_id, fetch the conversation partner (message sender)
      const offersWithPartner = await Promise.all(offersWithProfiles.map(async (offer) => {
        if (offer.message_id) {
          const { data: messageData } = await supabase
            .from('messages')
            .select('sender_id')
            .eq('id', offer.message_id)
            .single();
          
          if (messageData) {
            return { ...offer, conversation_partner_id: messageData.sender_id };
          }
        }
        return offer;
      }));

      setOffers(offersWithPartner);
    } catch (error) {
      console.error('Error fetching offers:', error);
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Refetch offers on window focus (e.g., returning from chat)
  useEffect(() => {
    const handleFocus = () => {
      fetchOffers();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchOffers]);

  const getDisplayStatus = (offer: DealCard): { label: string; color: string; icon: React.ReactNode } => {
    const status = offer.status?.toLowerCase() || '';
    const hasViewedAt = !!offer.viewed_at;

    if (status === 'accepted') {
      return {
        label: t('مهتم', 'Interested'),
        color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-800',
        icon: <Briefcase className="h-3.5 w-3.5" />
      };
    }
    if (status === 'declined') {
      return {
        label: t('مرفوض', 'Declined'),
        color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-200 dark:border-red-800',
        icon: <ExternalLink className="h-3.5 w-3.5" />
      };
    }
    if (status === 'pending') {
      if (hasViewedAt) {
        return {
          label: t('مشاهدة', 'Seen'),
          color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800',
          icon: <Building2 className="h-3.5 w-3.5" />
        };
      }
      return {
        label: t('مرسلة', 'Sent'),
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-800',
        icon: <Globe className="h-3.5 w-3.5" />
      };
    }
    return {
      label: t('قيد الانتظار', 'Pending'),
      color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800',
      icon: <Calendar className="h-3.5 w-3.5" />
    };
  };

  const matchesFilter = (offer: DealCard): boolean => {
    if (activeFilter === 'all') return true;
    const displayStatus = getDisplayStatus(offer).label;
    switch (activeFilter) {
      case 'sent':
        return displayStatus === t('مرسلة', 'Sent');
      case 'seen':
        return displayStatus === t('مشاهدة', 'Seen');
      case 'interested':
        return displayStatus === t('مهتم', 'Interested');
      case 'declined':
        return displayStatus === t('مرفوض', 'Declined');
      default:
        return true;
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('الآن', 'Just now');
    if (diffMins < 60) return t(`${diffMins} دقيقة`, `${diffMins}m`);
    if (diffHours < 24) return t(`${diffHours} ساعة`, `${diffHours}h`);
    if (diffDays < 7) return t(`${diffDays} يوم`, `${diffDays}d`);
    return new Intl.DateTimeFormat(isRTL ? 'ar' : 'en', { dateStyle: 'medium' }).format(date);
  };

  const handleOpenConversation = (partnerId: string, dealId: string) => {
    navigate(`/chat/${partnerId}?dealId=${dealId}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filteredOffers = offers.filter(matchesFilter);

  if (filteredOffers.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-40 text-muted-foreground">
        <Inbox className="h-8 w-8 mb-2" />
        <p>{offers.length === 0 ? t('لا توجد عروض مرسلة بعد', 'No offers sent yet.') : t('لا توجد عروض تطابق هذا الفلتر', 'No offers match this filter.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-hide" role="tablist">
        {[
          { value: 'all' as FilterType, label: t('الكل', 'All') },
          { value: 'sent' as FilterType, label: t('مرسلة', 'Sent') },
          { value: 'seen' as FilterType, label: t('مشاهدة', 'Seen') },
          { value: 'interested' as FilterType, label: t('مهتم', 'Interested') },
          { value: 'declined' as FilterType, label: t('مرفوض', 'Declined') },
        ].map((filter) => (
          <button
            key={filter.value}
            role="tab"
            aria-selected={activeFilter === filter.value}
            onClick={() => setActiveFilter(filter.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              activeFilter === filter.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Offers List */}
      <div className="space-y-3">
        {filteredOffers.map((offer) => {
          const displayStatus = getDisplayStatus(offer);
          const isExpanded = expandedOfferId === offer.id;
          const celebrityName = offer.celebrity_profile?.display_name || offer.celebrity_profile?.username || t('مجهول', 'Unknown');

          return (
            <div
              key={offer.id}
              className="border border-border rounded-2xl bg-card hover:shadow-md transition-shadow duration-200"
              onClick={() => setExpandedOfferId(isExpanded ? null : offer.id)}
            >
              {/* Compact Card Header */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-2 bg-primary/10 rounded-full shrink-0">
                        <Briefcase className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold text-base text-foreground truncate">
                        {offer.deal_type || t('عرض غير محدد', 'Untitled Offer')}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Building2 className="h-4 w-4 shrink-0" />
                      <span className="font-medium truncate">{celebrityName}</span>
                      {offer.celebrity_profile?.username && (
                        <span className="text-muted-foreground/70">@{offer.celebrity_profile.username}</span>
                      )}
                      {offer.company_name && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="truncate max-w-[120px]">{offer.company_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${displayStatus.color}`}>
                      {displayStatus.icon}
                      {displayStatus.label}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {formatRelativeTime(offer.created_at)}
                    </span>
                    <div className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                      {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </div>
                </div>

                {/* Budget Range Preview */}
                {offer.budget_range && (
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-full">
                      <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="font-medium text-foreground">{offer.budget_range}</span>
                  </div>
                )}
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-2 border-t border-border/50 animate-in slide-in-from-top-2 duration-200">
                  <div className="space-y-3">
                    {offer.website_url && (
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                        <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-full">
                          <Globe className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">
                            {t('الموقع الإلكتروني', 'Website')}
                          </p>
                          <a href={offer.website_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary truncate hover:underline block">
                            {offer.website_url}
                          </a>
                        </div>
                      </div>
                    )}

                    {offer.budget_cycle && (
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                        <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                          <Calendar className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">
                            {t('دورة الميزانية', 'Budget Cycle')}
                          </p>
                          <p className="font-medium text-foreground truncate">{offer.budget_cycle}</p>
                        </div>
                      </div>
                    )}

                    {offer.timeline && (
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                          <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">
                            {t('الجدول الزمني', 'Timeline')}
                          </p>
                          <p className="font-medium text-foreground truncate">{offer.timeline}</p>
                        </div>
                      </div>
                    )}

                    {offer.exclusivity && (
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                        <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-full">
                          <Briefcase className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">
                            {t('الحصرية', 'Exclusivity')}
                          </p>
                          <p className="font-medium text-foreground truncate">{offer.exclusivity}</p>
                        </div>
                      </div>
                    )}

                    {offer.deliverables && (
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                        <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-full">
                          <FileText className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">
                            {t('المخرجات', 'Deliverables')}
                          </p>
                          <p className="font-medium text-foreground truncate">{offer.deliverables}</p>
                        </div>
                      </div>
                    )}

                    {offer.why_them && (
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                        <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-full">
                          <Building2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">
                            {t('لماذا هم', 'Why Them')}
                          </p>
                          <p className="font-medium text-foreground truncate">{offer.why_them}</p>
                        </div>
                      </div>
                    )}

                    {offer.details && (
                      <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-xl">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full mt-0.5 shrink-0">
                          <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                            {t('التفاصيل', 'Details')}
                          </p>
                          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{offer.details}</p>
                        </div>
                      </div>
                    )}

                    {/* Open Conversation Button for Accepted Deals */}
                    {offer.status?.toLowerCase() === 'accepted' && offer.conversation_partner_id && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenConversation(offer.conversation_partner_id!, offer.id);
                        }}
                        className="w-full mt-2 h-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Globe className="h-4 w-4" />
                          <span>{t('فتح المحادثة', 'Open Conversation')}</span>
                        </div>
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
