import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { Loader2, Inbox, Globe, Calendar, FileText, DollarSign, Building2, ExternalLink, Briefcase } from 'lucide-react';

interface DealCard {
  id: string;
  deal_type: string | null;
  budget_range: string | null;
  timeline: string | null;
  details: string | null;
  status: string;
  celebrity_profile?: {
    display_name: string | null;
    username: string | null;
  } | null;
  company_name: string | null;
  website_url: string | null;
  budget_cycle: string | null;
  deliverables: string | null;
  exclusivity: string | null;
  why_them: string | null;
}

export default function OfferStatusTracker() {
  const { user } = useAuth();
  const { isRTL } = useLanguage();
  const [offers, setOffers] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOffers = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      setLoading(true);
      
      // Always query by sender_id (user's own sent offers)
      const { data, error } = await supabase
        .from('deal_cards')
        .select(`
          id, 
          deal_type, 
          budget_range, 
          timeline,
          details,
          status,
          company_name,
          website_url,
          budget_cycle,
          deliverables,
          exclusivity,
          why_them,
          celebrity_profile:profiles!deal_cards_celebrity_id_fkey(display_name, username)
        `)
        .eq('sender_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching offers:', error);
        setOffers([]);
      } else {
        setOffers(data as unknown as DealCard[]);
      }
      setLoading(false);
    };

    fetchOffers();
  }, [user]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'sent':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-800';
      case 'viewed':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800';
      case 'declined':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-200 dark:border-red-800';
      case 'accepted':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-800';
      case 'pending':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'sent':
        return <Globe className="h-3.5 w-3.5" />;
      case 'viewed':
        return <Building2 className="h-3.5 w-3.5" />;
      case 'declined':
        return <ExternalLink className="h-3.5 w-3.5" />;
      case 'accepted':
        return <Briefcase className="h-3.5 w-3.5" />;
      case 'pending':
        return <Calendar className="h-3.5 w-3.5" />;
      default:
        return <FileText className="h-3.5 w-3.5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-40 text-muted-foreground">
        <Inbox className="h-8 w-8 mb-2" />
        <p>{isRTL ? 'لا توجد عروض مرسلة بعد' : 'No offers sent yet.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {offers.map((offer) => {
        const displayName = offer.deal_type || 'Unknown Deal';
        return (
          <div 
            key={offer.id} 
            className="border border-border rounded-2xl p-5 bg-card hover:shadow-md transition-shadow duration-200"
          >
            {/* Header with Deal Type and Status */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-2 bg-primary/10 rounded-full">
                    <Briefcase className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg text-foreground truncate">
                    {displayName}
                  </h3>
                </div>
                {offer.celebrity_profile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground ml-7">
                    <Building2 className="h-4 w-4 shrink-0" />
                    <span className="font-medium truncate">
                      {offer.celebrity_profile.display_name || 'Unknown'}
                    </span>
                    {offer.celebrity_profile.username && (
                      <span className="text-muted-foreground/70">@{offer.celebrity_profile.username}</span>
                    )}
                  </div>
                )}
              </div>
              <span className={`px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 shrink-0 ${getStatusColor(offer.status)}`}>
                {getStatusIcon(offer.status)}
                {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
              </span>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {offer.budget_range && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                    <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {isRTL ? 'الميزانية' : 'Budget'}
                    </p>
                    <p className="font-medium text-foreground truncate">
                      {offer.budget_range}
                    </p>
                  </div>
                </div>
              )}

              {offer.budget_cycle && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                    <Calendar className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {isRTL ? 'دورة الميزانية' : 'Budget Cycle'}
                    </p>
                    <p className="font-medium text-foreground truncate">
                      {offer.budget_cycle}
                    </p>
                  </div>
                </div>
              )}

              {offer.deal_type && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                    <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {isRTL ? 'نوع العرض' : 'Deal Type'}
                    </p>
                    <p className="font-medium text-foreground truncate">
                      {offer.deal_type}
                    </p>
                  </div>
                </div>
              )}

              {offer.timeline && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                    <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {isRTL ? 'الجدول الزمني' : 'Timeline'}
                    </p>
                    <p className="font-medium text-foreground truncate">
                      {offer.timeline}
                    </p>
                  </div>
                </div>
              )}

              {offer.company_name && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-full">
                    <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {isRTL ? 'الشركة' : 'Company'}
                    </p>
                    <p className="font-medium text-foreground truncate">
                      {offer.company_name}
                    </p>
                  </div>
                </div>
              )}

              {offer.website_url && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                  <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-full">
                    <Globe className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {isRTL ? 'الموقع الإلكتروني' : 'Website'}
                    </p>
                    <a href={offer.website_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary truncate hover:underline">
                      {offer.website_url}
                    </a>
                  </div>
                </div>
              )}

              {offer.exclusivity && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                  <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-full">
                    <Briefcase className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {isRTL ? 'الحصرية' : 'Exclusivity'}
                    </p>
                    <p className="font-medium text-foreground truncate">
                      {offer.exclusivity}
                    </p>
                  </div>
                </div>
              )}

              {offer.deliverables && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                  <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-full">
                    <FileText className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {isRTL ? 'المخرجات' : 'Deliverables'}
                    </p>
                    <p className="font-medium text-foreground truncate">
                      {offer.deliverables}
                    </p>
                  </div>
                </div>
              )}

              {offer.why_them && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl sm:col-span-2">
                  <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-full">
                    <Building2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {isRTL ? 'لماذا هم' : 'Why Them'}
                    </p>
                    <p className="font-medium text-foreground truncate">
                      {offer.why_them}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Details Section */}
            {offer.details && (
              <div className="pt-4 border-t border-border">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full mt-0.5 shrink-0">
                    <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      {isRTL ? 'التفاصيل' : 'Details'}
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {offer.details}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
