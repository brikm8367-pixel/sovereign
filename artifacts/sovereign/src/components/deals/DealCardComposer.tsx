import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, Briefcase, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { validateDealCard } from '@/utils/dealValidation';
import { Badge } from '@/components/ui/badge';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  celebrityId: string;
  celebrityName?: string | null;
  onSent?: () => void;
}

// ── Lookup tables with descriptions ────────────────────────────────────────────────
const DEAL_TYPES = [
  { 
    id: 'sponsorship',  
    ar: 'رعاية',          
    en: 'Sponsorship',
    arDesc: 'رعاية علامة تجارية أو حدث',
    enDesc: 'Brand or event sponsorship'
  },
  { 
    id: 'appearance',  
    ar: 'ظهور إعلاني',     
    en: 'Brand Appearance',
    arDesc: 'ظهور في إعلان أو حملة تسويقية',
    enDesc: 'Appearance in ad or marketing campaign'
  },
  { 
    id: 'event',       
    ar: 'حضور فعالية',     
    en: 'Event Attendance',
    arDesc: 'حضور فعالية أو مؤتمر أو مهرجان',
    enDesc: 'Attend event, conference or festival'
  },
  { 
    id: 'collab',      
    ar: 'تعاون محتوى',     
    en: 'Content Collab',
    arDesc: 'إنشاء محتوى مشترك مع الموهبة',
    enDesc: 'Create joint content with talent'
  },
  { 
    id: 'endorsement', 
    ar: 'ترويج منتج',      
    en: 'Product Endorsement',
    arDesc: 'ترويج منتج أو خدمة محددة',
    enDesc: 'Promote a specific product or service'
  },
  { 
    id: 'other',       
    ar: 'أخرى',             
    en: 'Other',
    arDesc: 'نوع عرض آخر غير المذكور أعلاه',
    enDesc: 'Other deal type not listed above'
  },
];

const BUDGETS = [
  { id: 'sub5k',     label: '< $5K',       arDesc: 'أقل من 5 آلاف دولار',     enDesc: 'Less than $5,000' },
  { id: '5k-25k',    label: '$5K – $25K',  arDesc: 'من 5 إلى 25 ألف دولار',    enDesc: '$5,000 to $25,000' },
  { id: '25k-100k',  label: '$25K – $100K', arDesc: 'من 25 إلى 100 ألف دولار',  enDesc: '$25,000 to $100,000' },
  { id: '100k+',     label: '$100K+',      arDesc: 'أكثر من 100 ألف دولار',    enDesc: 'More than $100,000' },
];

const PAYMENT_STRUCTURES = [
  { id: 'full',     ar: 'دفعة واحدة',     en: 'Full upfront',     arDesc: 'الدفع كاملاً قبل البدء',     enDesc: 'Full payment before starting' },
  { id: 'half',     ar: '50% مقدم',       en: '50% upfront',      arDesc: 'نصف المبلغ مقدماً والباقي لاحقاً', enDesc: 'Half upfront, rest later' },
  { id: 'monthly',  ar: 'شهري',           en: 'Monthly',          arDesc: 'دفعات شهرية منتظمة',           enDesc: 'Regular monthly payments' },
  { id: 'post',     ar: 'بعد التنفيذ',    en: 'Post-delivery',    arDesc: 'الدفع بعد تسليم العمل',         enDesc: 'Payment after delivery' },
];

const TIMELINES = [
  { id: 'asap', ar: 'عاجل',           en: 'ASAP',           arDesc: 'في أسرع وقت ممكن',           enDesc: 'As soon as possible' },
  { id: '1m',   ar: 'خلال شهر',      en: 'Within a month', arDesc: 'خلال 30 يوماً من الآن',      enDesc: 'Within 30 days from now' },
  { id: '3m',   ar: 'خلال 3 أشهر',   en: 'Within 3 months', arDesc: 'خلال 90 يوماً من الآن',     enDesc: 'Within 90 days from now' },
  { id: 'flex', ar: 'مرن',           en: 'Flexible',       arDesc: 'لا يوجد موعد نهائي محدد',     enDesc: 'No specific deadline' },
];

const COMMITMENTS = [
  { id: 'exclusive_30', ar: 'حصرية 30 يوم',     en: 'Exclusivity 30d',     arDesc: 'لا يعمل مع منافسين لمدة 30 يوم', enDesc: 'No competitors for 30 days' },
  { id: 'exclusive_90', ar: 'حصرية 90 يوم',     en: 'Exclusivity 90d',     arDesc: 'لا يعمل مع منافسين لمدة 90 يوم', enDesc: 'No competitors for 90 days' },
  { id: 'usage_rights', ar: 'حقوق الاستخدام',   en: 'Usage rights',        arDesc: 'حقوق استخدام المحتوى تجارياً',   enDesc: 'Commercial usage rights for content' },
  { id: '1_post',       ar: 'منشور واحد',        en: '1 post',              arDesc: 'منشور واحد على المنصة الرئيسية',  enDesc: 'One post on main platform' },
  { id: '3_posts',      ar: '3 منشورات',         en: '3 posts',             arDesc: 'ثلاثة منشورات على المنصة الرئيسية', enDesc: 'Three posts on main platform' },
  { id: 'story_only',   ar: 'ستوري فقط',         en: 'Story only',          arDesc: 'محتوى ستوري فقط بدون منشور',      enDesc: 'Story content only, no main post' },
];

// Toggle button generic component with description
function ChoiceBtn({ active, onClick, children, description, className }: {
  active: boolean; onClick: () => void; children: React.ReactNode; description?: string; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'p-3 rounded-xl border text-start transition-all duration-150 h-auto min-h-[72px]',
        active
          ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
          : 'border-border hover:bg-muted/60 text-foreground/80',
        className,
      )}
    >
      <div className="font-medium text-sm">{children}</div>
      {description && <div className="text-[11px] text-muted-foreground mt-1">{description}</div>}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-muted-foreground">{children}</p>;
}

function SectionHeader({ label, required }: { label: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <SectionLabel>{label}</SectionLabel>
      {required && <span className="text-destructive text-sm">*</span>}
    </div>
  );
}

function InputField({ label, placeholder, value, onChange, type = 'text', required, maxLength, className = '' }: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={cn("h-11 px-3 py-2 rounded-xl border-border", className)}
        maxLength={maxLength}
        required={required}
      />
    </div>
  );
}

function TextareaField({ label, placeholder, value, onChange, maxLength, className = '', rows = 4 }: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  maxLength?: number;
  className?: string;
  rows?: number;
}) {
  const remaining = maxLength ? maxLength - value.length : null;
  const remainingColor = remaining !== null && remaining < 30 ? 'text-destructive' : remaining !== null && remaining < 80 ? 'text-amber-500' : 'text-muted-foreground';
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">{label}</label>
        {remaining !== null && <span className={cn('text-xs font-medium', remainingColor)}>{remaining} {remaining < 0 ? 'chars over' : 'chars left'}</span>}
      </div>
      <Textarea
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        className={cn("rounded-xl resize-none text-sm leading-relaxed border-border px-3 py-2", className)}
        rows={rows}
      />
    </div>
  );
}

export function DealCardComposer({ open, onOpenChange, celebrityId, celebrityName, onSent }: Props) {
  const { user } = useAuth();
  const { isRTL } = useLanguage();

  // Form state
  const [dealType,          setDealType]         = useState('');
  const [budget,            setBudget]            = useState('');
  const [paymentStructure,  setPaymentStructure]  = useState('');
  const [timeline,          setTimeline]          = useState('');
  const [commitments,       setCommitments]       = useState<string[]>([]);
  const [pitch,             setPitch]             = useState('');
  const [companyName,       setCompanyName]       = useState('');
  const [websiteUrl,        setWebsiteUrl]        = useState('');

  // Meta state
  const [sending,       setSending]       = useState(false);
  const [hasPending,    setHasPending]    = useState(false);
  const [checking,      setChecking]      = useState(true);

  // Entitlement + pending check on open
  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    setChecking(true);
    (async () => {
      const { data: pending } = await supabase.from('deal_cards' as any).select('id')
          .eq('sender_id', user.id).eq('celebrity_id', celebrityId).eq('status', 'pending').limit(1);
      if (!alive) return;
      setHasPending((pending?.length ?? 0) > 0);
      setChecking(false);
    })();
    return () => { alive = false; };
  }, [open, user, celebrityId]);

  const reset = () => {
    setDealType(''); setBudget(''); setPaymentStructure(''); setTimeline('');
    setCommitments([]); setPitch(''); setCompanyName(''); setWebsiteUrl('');
  };

  const toggleCommitment = (id: string) => {
    setCommitments(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id],
    );
  };

  const submit = async () => {
    if (!user) return;
    if (!dealType) { toast.error(isRTL ? 'اختر نوع العرض' : 'Choose a deal type'); return; }
    if (!budget)   { toast.error(isRTL ? 'حدد الميزانية' : 'Specify the budget'); return; }
    if (!companyName.trim()) { toast.error(isRTL ? 'أدخل اسم الشركة' : 'Enter company name'); return; }
    if (!websiteUrl.trim()) { toast.error(isRTL ? 'أدخل الموقع الإلكتروني' : 'Enter website URL'); return; }
    if (hasPending) {
      toast.error(isRTL ? 'لديك عرض قيد المراجعة — انتظر الرد أولاً' : 'You have a pending deal — wait for a reply first');
      return;
    }

    // Smart validation & spam detection
    const validation = validateDealCard({
      dealType,
      budgetRange: budget,
      pitch,
      timeline,
      campaignDescription: pitch,
      deliverables: '',
      whyThem: '',
      companyName,
      websiteUrl,
    });

    if (!validation.valid) {
      validation.errors.forEach(err => toast.error(err));
      return;
    }

    setSending(true);

    const typeLabel = DEAL_TYPES.find(t => t.id === dealType);
    const budgetLabel = BUDGETS.find(b => b.id === budget)?.label ?? budget;
    const summary = `${isRTL ? 'عرض عمل' : 'Deal'}: ${typeLabel?.[isRTL ? 'ar' : 'en'] ?? dealType} · ${budgetLabel}`;

    // Pack all structured fields into details JSON
    const detailsPayload = JSON.stringify({
      payment_structure: paymentStructure || null,
      commitments,
      pitch: pitch.trim() || null,
    });

    const { data: msg, error: msgErr } = await supabase.from('messages').insert({
      sender_id:   user.id,
      receiver_id: celebrityId,
      category:    'work',
      subject:     isRTL ? 'بطاقة عرض' : 'Deal Card',
      content:     summary,
    }).select('id').single();

    if (msgErr) { setSending(false); toast.error(isRTL ? 'تعذّر الإرسال' : 'Could not send'); return; }

    const { error: dealErr } = await (supabase as any).from('deal_cards').insert({
      sender_id:   user.id,
      celebrity_id: celebrityId,
      message_id:  msg.id,
      deal_type:   dealType,
      budget_range: budgetLabel,
      timeline:    timeline || null,
      details:     detailsPayload,
      company_name: companyName,
      website_url: websiteUrl,
    });

    setSending(false);
    if (dealErr) {
      toast.error(isRTL ? 'تعذّر إنشاء البطاقة' : 'Could not create deal card');
      return;
    }

    toast.success(isRTL ? 'تم إرسال بطاقة العرض ✓' : 'Deal card sent ✓');
    reset();
    onOpenChange(false);
    onSent?.();
  };

  const t = (ar: string, en: string) => (isRTL ? ar : en);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md max-h-[92vh] overflow-y-auto pb-20 safe-area-inset-bottom">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            {t('بطاقة عرض عمل', 'Deal Card')}
          </DialogTitle>
          <DialogDescription>
            {t('عرض منظّم إلى ', 'Structured offer to ')}{celebrityName ? `@${celebrityName}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1 px-1">

          {/* Company Info Section */}
          <div className="space-y-4">
            <SectionHeader label={t('معلومات الشركة', 'Company Information')} required />
            
            <InputField
              label={t('اسم الشركة', 'Company Name')}
              placeholder={t('اكتب اسم شركتك كما يظهر رسمياً', 'Enter your official company name')}
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              required
              maxLength={100}
            />

            <InputField
              label={t('الموقع الإلكتروني', 'Website URL')}
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={e => setWebsiteUrl(e.target.value)}
              type="url"
              required
              maxLength={200}
            />
          </div>

          <div className="pt-2 border-t border-border/50" />

          {/* 1 — Deal type with descriptions */}
          <div className="space-y-3">
            <SectionHeader label={t('نوع العرض', 'Deal Type')} required />
            <div className="grid grid-cols-1 gap-2">
              {DEAL_TYPES.map(dt => (
                <ChoiceBtn 
                  key={dt.id} 
                  active={dealType === dt.id} 
                  onClick={() => setDealType(dt.id)}
                  description={t(dt.arDesc, dt.enDesc)}
                >
                  {dt[isRTL ? 'ar' : 'en']}
                </ChoiceBtn>
              ))}
            </div>
          </div>

          {/* 2 — Budget with full ranges */}
          <div className="space-y-3">
            <SectionHeader label={t('الميزانية الصافية', 'Net Budget')} required />
            <div className="grid grid-cols-2 gap-2">
              {BUDGETS.map(b => (
                <ChoiceBtn key={b.id} active={budget === b.id} onClick={() => setBudget(b.id)} description={t(b.arDesc, b.enDesc)}>
                  {b.label}
                </ChoiceBtn>
              ))}
            </div>
          </div>

          {/* 3 — Payment structure with full labels */}
          <div className="space-y-3">
            <SectionHeader label={t('هيكل الدفع', 'Payment Structure')} />
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_STRUCTURES.map(p => (
                <ChoiceBtn key={p.id} active={paymentStructure === p.id} onClick={() => setPaymentStructure(p.id)} description={t(p.arDesc, p.enDesc)}>
                  {p[isRTL ? 'ar' : 'en']}
                </ChoiceBtn>
              ))}
            </div>
          </div>

          {/* 4 — Timeline with full labels */}
          <div className="space-y-3">
            <SectionHeader label={t('الجدول الزمني', 'Timeline')} />
            <div className="grid grid-cols-2 gap-2">
              {TIMELINES.map(tl => (
                <ChoiceBtn key={tl.id} active={timeline === tl.id} onClick={() => setTimeline(tl.id)} description={t(tl.arDesc, tl.enDesc)}>
                  {tl[isRTL ? 'ar' : 'en']}
                </ChoiceBtn>
              ))}
            </div>
          </div>

          {/* 5 — Commitments with full labels and checkmark */}
          <div className="space-y-3">
            <SectionHeader label={t('الالتزامات الرئيسية', 'Main Commitments')} />
            <div className="flex flex-wrap gap-2">
              {COMMITMENTS.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCommitment(c.id)}
                  className={cn(
                    'px-3 py-2 rounded-full border text-xs font-medium transition-all duration-150 h-9 flex items-center gap-1.5',
                    commitments.includes(c.id)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-muted/60 text-foreground/70',
                  )}
                >
                  {commitments.includes(c.id) && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                  <span>{c[isRTL ? 'ar' : 'en']}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 6 — Pitch Box with clear label and placeholder */}
          <TextareaField
            label={t('لماذا هذه الموهبة؟', 'Why this talent?')}
            placeholder={t('اكتب لماذا اخترت هذه الموهبة تحديداً وما قيمة التعاون للطرفين (أقصى 300 حرف)', 'Write why you chose this specific talent and what value the collaboration brings to both sides (max 300 chars)')}
            value={pitch}
            onChange={e => setPitch(e.target.value)}
            maxLength={300}
            rows={4}
          />

          {hasPending && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-700 dark:text-amber-400 text-center">
                {t('لديك عرض قيد المراجعة — لا يمكن الإرسال حتى يتم الرد.', 'You have a pending deal — cannot send until it gets a reply.')}
              </p>
            </div>
          )}

          <Button
            onClick={submit}
            disabled={sending || checking || hasPending || !dealType || !budget || !companyName.trim() || !websiteUrl.trim()}
            className="w-full h-11 rounded-xl font-semibold text-base"
          >
            {sending
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : <><Check className="h-4 w-4 me-2" />{t('إرسال العرض', 'Send Deal')}</>}
          </Button>

        </div>
      </DialogContent>
    </Dialog>
  );
}
