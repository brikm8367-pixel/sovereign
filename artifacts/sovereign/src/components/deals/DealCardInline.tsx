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
  showStatusBadge?: boolean;
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
        label: t(isRTL, 'قيد المراجعة', 'Pending'),
        variant: 'secondary' as const,
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-800',
      };
  }
};

const getDealTypeConfig = (type: string | null, isRTL: boolean) => {
  const types: Record<string, { label: string; color: string; description: string }> = {
    sponsorship: { 
      label: t(isRTL, 'رعاية', 'Sponsorship'), 
      description: t(isRTL, 'رعاية علامة تجارية أو حدث', 'Brand or event sponsorship'),
      color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' 
    },
    appearance: { 
      label: t(isRTL, 'ظهور إعلاني', 'Brand Appearance'), 
      description: t(isRTL, 'ظهور في إعلان أو حملة', 'Appearance in ad or campaign'),
      color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' 
    },
    event: { 
      label: t(isRTL, 'حضور فعالية', 'Event Attendance'), 
      description: t(isRTL, 'حضور حدث أو مؤتمر', 'Attend event or conference'),
      color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' 
    },
    collab: { 
      label: t(isRTL, 'تعاون محتوى', 'Content Collab'), 
      description: t(isRTL, 'إنشاء محتوى مشترك', 'Create joint content'),
      color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-800' 
    },
    endorsement: { 
      label: t(isRTL, 'ترويج منتج', 'Product Endorsement'), 
      description: t(isRTL, 'ترويج منتج أو خدمة', 'Promote product or service'),
      color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800' 
    },
    other: { 
      label: t(isRTL, 'أخرى', 'Other'), 
      description: t(isRTL, 'نوع عرض آخر', 'Other deal type'),
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
      <div className={cn('mb-4 rounded-2xl border border-border bg-card p-5 shadow-md hover:shadow-lg transition-shadow animate-pulse', className)}>
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
      <div className={cn('mb-4 rounded-2xl border border-border bg-card p-5 shadow-md hover:shadow-lg transition-shadow', className)}>
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
    <div className={cn('mb-4 rounded-2xl border border-border bg-card p-5 shadow-md hover:shadow-lg transition-shadow', className)}>
      {/* Header Section */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="p-2 bg-primary/10 rounded-xl shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold text-lg text-foreground truncate">
              {deal.company_name || t(isRTL, 'غير محدد', 'Not specified')}
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
            label={t(isRTL, 'الميزانية', 'Budget')} 
            icon={DollarSign}
          >
            <span className="font-semibold text-primary">{deal.budget_range}</span>
          </FieldRow>
        )}

        {/* Budget Cycle */}
        {deal.budget_cycle && (
          <FieldRow 
            label={t(isRTL, 'دورة الميزانية', 'Budget Cycle')} 
            icon={Calendar}
          >
            {deal.budget_cycle}
          </FieldRow>
        )}

        {/* Timeline */}
        {deal.timeline && (
          <FieldRow 
            label={t(isRTL, 'الجدول الزمني', 'Timeline')} 
            icon={Calendar}
          >
            {deal.timeline}
          </FieldRow>
        )}

        <SectionDivider />

        {/* Website URL */}
        {deal.website_url && (
          <FieldRow 
            label={t(isRTL, 'الموقع الإلكتروني', 'Website')} 
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
            label={t(isRTL, 'الحصرية', 'Exclusivity')} 
            icon={Shield}
          >
            {deal.exclusivity}
          </FieldRow>
        )}

        {/* Deliverables */}
        {deal.deliverables && (
          <FieldRow 
            label={t(isRTL, 'المخرجات', 'Deliverables')} 
            icon={FileText}
          >
            {deal.deliverables}
          </FieldRow>
        )}

        {/* Why Them */}
        {deal.why_them && (
          <FieldRow 
            label={t(isRTL, 'لماذا هم', 'Why Them')} 
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
              label={t(isRTL, 'الوصف', 'Description')} 
              icon={FileText}
            >
              {deal.details}
            </FieldRow>
          </>
        )}
      </div>

      {/* Action Buttons Section */}
      <div className="mt-5 pt-4 border-t border-border/50 space-y-2">
        <Button
          variant="default"
          className={cn('w-full sm:w-auto h-11 rounded-xl font-semibold text-sm touch-feedback', 'bg-primary text-primary-foreground hover:bg-primary/90')}
          onClick={onToggleDetails}
        >
          {showDetails ? t(isRTL, 'إخفاء التفاصيل', 'Hide details') : t(isRTL, 'إظهار التفاصيل', 'View details')}
        </Button>
        
        <Button
          variant="outline"
          className={cn('w-full sm:w-auto h-11 rounded-xl font-semibold text-sm touch-feedback', 'border border-border bg-background hover:bg-muted/50')}
        >
          {t(isRTL, 'رد', 'Reply')}
        </Button>
      </div>
    </div>
  );
}
