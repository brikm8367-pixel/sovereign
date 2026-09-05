import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Briefcase, 
  Building2, 
  DollarSign, 
  Calendar, 
  Shield, 
  FileText, 
  Globe, 
  UserCheck,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

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
}

interface DealCardInlineProps {
  dealId: string;
  isRTL: boolean;
  onToggleDetails: () => void;
  showDetails: boolean;
  className?: string;
  showStatusBadge?: boolean; // New prop to control status badge visibility
}

const t = (isRTL: boolean, ar: string, en: string) => isRTL ? ar : en;

const getStatusConfig = (status: string, isRTL: boolean) => {
  switch (status) {
    case 'accepted':
      return {
        label: t(isRTL, 'تم القبول', 'Accepted'),
        variant: 'success' as const,
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-700 dark:text-green-400',
        border: 'border-green-200 dark:border-green-800',
      };
    case 'declined':
      return {
        label: t(isRTL, 'تم الرفض', 'Declined'),
        variant: 'destructive' as const,
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-400',
        border: 'border-red-200 dark:border-red-800',
      };
    case 'pending':
    default:
      return {
        label: t(isRTL, 'قيد المراجعة', 'Under Review'),
        variant: 'secondary' as const,
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-800',
      };
  }
};

const getDealTypeConfig = (type: string | null, isRTL: boolean) => {
  const types: Record<string, { label: string; color: string }> = {
    sponsorship: { label: t(isRTL, 'رعاية', 'Sponsorship'), color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
    appearance: { label: t(isRTL, 'ظهور إعلاني', 'Brand Appearance'), color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
    event: { label: t(isRTL, 'حضور فعالية', 'Event Attendance'), color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' },
    collab: { label: t(isRTL, 'تعاون محتوى', 'Content Collab'), color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-800' },
    endorsement: { label: t(isRTL, 'ترويج منتج', 'Product Endorsement'), color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800' },
    other: { label: t(isRTL, 'أخرى', 'Other'), color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-700' },
  };
  return types[type || 'other'] || types.other;
};

export function DealCardInline({ dealId, isRTL, onToggleDetails, showDetails, className, showStatusBadge = false }: DealCardInlineProps) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadDeal = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('deal_cards')
          .select('id, deal_type, company_name, budget_range, budget_cycle, timeline, details, website_url, exclusivity, deliverables, why_them, status, celebrity_id, sender_id')
          .eq('id', dealId)
          .single();
        
        if (!cancelled) {
          if (fetchError) {
            console.error('Error fetching deal:', fetchError);
            setError('Erreur de chargement');
          } else if (data) {
            setDeal(data as unknown as Deal);
          }
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error fetching deal:', err);
          setError('Erreur de chargement');
          setIsLoading(false);
        }
      }
    };
    loadDeal();
    return () => { cancelled = true; };
  }, [dealId]);

  if (isLoading) {
    return (
      <div className={cn('mb-4 rounded-2xl border border-border bg-card p-5 shadow-sm animate-pulse', className)}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl shrink-0">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-5 w-3/4 bg-muted rounded" />
            <div className="h-3 w-1/2 bg-muted rounded" />
            <div className="flex gap-2">
              <div className="h-5 w-20 bg-muted rounded-full" />
              <div className="h-5 w-20 bg-muted rounded-full" />
              <div className="h-5 w-20 bg-muted rounded-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className={cn('mb-4 rounded-2xl border border-border bg-card p-5 shadow-sm', className)}>
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="p-2 bg-muted/50 rounded-xl shrink-0">
            <Briefcase className="h-5 w-5" />
          </div>
          <p className="text-sm">{error || 'Offre introuvable'}</p>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(deal.status, isRTL);
  const dealTypeConfig = getDealTypeConfig(deal.deal_type, isRTL);

  return (
    <div className={cn('mb-4 rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow duration-200', className)}>
      {/* Header with Company Name and Status Badge */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          {deal.company_name && (
            <p className="font-semibold text-base text-foreground truncate mb-1">
              {deal.company_name}
            </p>
          )}
          {!deal.company_name && deal.deal_type && (
            <p className="font-semibold text-base text-foreground truncate mb-1">
              {deal.deal_type}
            </p>
          )}
          
          {/* Chips row: Deal Type, Budget, Timeline */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge 
              variant="outline" 
              className={cn('rounded-full px-2.5 py-1 text-xs font-medium h-5', dealTypeConfig.color)}
            >
              {dealTypeConfig.label}
            </Badge>
            
            {deal.budget_range && (
              <Badge 
                variant="outline" 
                className="rounded-full px-2.5 py-1 text-xs font-medium h-5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
              >
                <DollarSign className="h-3 w-3 inline mr-1" />
                {deal.budget_range}
              </Badge>
            )}
            
            {deal.timeline && (
              <Badge 
                variant="outline" 
                className="rounded-full px-2.5 py-1 text-xs font-medium h-5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800"
              >
                <Calendar className="h-3 w-3 inline mr-1" />
                {deal.timeline}
              </Badge>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          {showStatusBadge && (
            <Badge 
              variant="outline" 
              className={cn('rounded-full px-3 py-1 text-xs font-medium h-6', statusConfig.bg, statusConfig.text, statusConfig.border)}
            >
              {statusConfig.label}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl shrink-0 touch-feedback"
            onClick={onToggleDetails}
            aria-label={showDetails ? t(isRTL, 'إخفاء التفاصيل', 'Hide details') : t(isRTL, 'إظهار التفاصيل', 'Show details')}
          >
            {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {showDetails && (
        <div className="space-y-4 pt-4 border-t border-border/50">
          {/* Description / Pitch Section */}
          {deal.details && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                {t(isRTL, 'الوصف', 'Description')}
              </p>
              <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                {deal.details}
              </p>
            </div>
          )}

          {/* Details Grid */}
          <div className="space-y-3">
            {deal.website_url && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-full">
                  <Globe className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {t(isRTL, 'الموقع الإلكتروني', 'Website')}
                  </p>
                  <a href={deal.website_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary truncate block hover:underline">
                    {deal.website_url}
                  </a>
                </div>
              </div>
            )}

            {deal.budget_cycle && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                  <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {t(isRTL, 'دورة الميزانية', 'Budget Cycle')}
                  </p>
                  <p className="font-medium text-foreground truncate">{deal.budget_cycle}</p>
                </div>
              </div>
            )}

            {deal.exclusivity && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                  <Shield className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {t(isRTL, 'الحصرية', 'Exclusivity')}
                  </p>
                  <p className="font-medium text-foreground truncate">{deal.exclusivity}</p>
                </div>
              </div>
            )}

            {deal.deliverables && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-full">
                  <FileText className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {t(isRTL, 'المخرجات', 'Deliverables')}
                  </p>
                  <p className="font-medium text-foreground truncate">{deal.deliverables}</p>
                </div>
              </div>
            )}

            {deal.why_them && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-full">
                  <UserCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {t(isRTL, 'لماذا هم', 'Why Them')}
                  </p>
                  <p className="font-medium text-foreground truncate">{deal.why_them}</p>
                </div>
              </div>
            )}

            {deal.status && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
                  <Briefcase className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {t(isRTL, 'الحالة', 'Status')}
                  </p>
                  <Badge variant="outline" className={cn('rounded-full px-2.5 py-1 text-xs font-medium h-5', statusConfig.bg, statusConfig.text, statusConfig.border)}>
                    {statusConfig.label}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
