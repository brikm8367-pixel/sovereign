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
}

const t = (isRTL: boolean, ar: string, en: string) => isRTL ? ar : en;

export function DealCardInline({ dealId, isRTL, onToggleDetails, showDetails, className }: DealCardInlineProps) {
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
      <div className={cn('mb-4 border border-border/50 rounded-2xl bg-card p-4 shadow-sm animate-pulse', className)}>
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-xl shrink-0">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="h-4 w-3/4 bg-muted rounded" />
            <div className="h-3 w-1/2 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className={cn('mb-4 border border-border/50 rounded-2xl bg-card p-4 shadow-sm', className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="p-2 bg-muted/50 rounded-xl shrink-0">
            <Briefcase className="h-5 w-5" />
          </div>
          <p className="text-sm">{error || 'Offre introuvable'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('mb-4 border border-border/50 rounded-2xl bg-card p-4 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="p-2 bg-primary/10 rounded-xl shrink-0">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">
              {deal.deal_type || t(isRTL, 'عرض غير محدد', 'Untitled Offer')}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              {deal.company_name && (
                <>
                  <Building2 className="h-3 w-3" />
                  {deal.company_name}
                </>
              )}
              {deal.budget_range && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <DollarSign className="h-3 w-3" />
                  {deal.budget_range}
                </>
              )}
              {deal.timeline && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <Calendar className="h-3 w-3" />
                  {deal.timeline}
                </>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-xl shrink-0"
          onClick={onToggleDetails}
          aria-label={showDetails ? t(isRTL, 'إخفاء التفاصيل', 'Hide details') : t(isRTL, 'إظهار التفاصيل', 'Show details')}
        >
          {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {showDetails && (
        <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
          {deal.website_url && (
            <div className="flex items-center gap-2 text-sm">
              <div className="p-1.5 bg-cyan-100 dark:bg-cyan-900/30 rounded-full">
                <Globe className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {t(isRTL, 'الموقع الإلكتروني', 'Website')}
                </p>
                <a href={deal.website_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary truncate hover:underline">
                  {deal.website_url}
                </a>
              </div>
            </div>
          )}
          {deal.budget_cycle && (
            <div className="flex items-center gap-2 text-sm">
              <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {t(isRTL, 'دورة الميزانية', 'Budget Cycle')}
                </p>
                <p className="font-medium text-foreground truncate">{deal.budget_cycle}</p>
              </div>
            </div>
          )}
          {deal.exclusivity && (
            <div className="flex items-center gap-2 text-sm">
              <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                <Shield className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {t(isRTL, 'الحصرية', 'Exclusivity')}
                </p>
                <p className="font-medium text-foreground truncate">{deal.exclusivity}</p>
              </div>
            </div>
          )}
          {deal.deliverables && (
            <div className="flex items-center gap-2 text-sm">
              <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-full">
                <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {t(isRTL, 'المخرجات', 'Deliverables')}
                </p>
                <p className="font-medium text-foreground truncate">{deal.deliverables}</p>
              </div>
            </div>
          )}
          {deal.why_them && (
            <div className="flex items-center gap-2 text-sm">
              <div className="p-1.5 bg-teal-100 dark:bg-teal-900/30 rounded-full">
                <UserCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {t(isRTL, 'لماذا هم', 'Why Them')}
                </p>
                <p className="font-medium text-foreground truncate">{deal.why_them}</p>
              </div>
            </div>
          )}
          {deal.details && (
            <div className="flex items-start gap-2 text-sm">
              <div className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mt-0.5">
                <FileText className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {t(isRTL, 'التفاصيل', 'Details')}
                </p>
                <p className="font-medium text-foreground whitespace-pre-wrap">{deal.details}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
