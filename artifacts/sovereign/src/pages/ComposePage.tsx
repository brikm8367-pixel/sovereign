import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Briefcase, ArrowRight, X, Globe, Building2, DollarSign, Calendar, FileText, Check, Shield } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { toast } from 'sonner';
import { validateDealCard } from '@/utils/dealValidation';
import { cn } from '@/lib/utils';

export const ComposePage = () => {
  const { isRTL, t } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const { role } = useRole();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const celebrityId = searchParams.get('celebrityId');

  // Nouveaux états pour le formulaire de deal
  const [companyName, setCompanyName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [selectedBudget, setSelectedBudget] = useState<string>('');
  const [budgetCycle, setBudgetCycle] = useState<'per_post' | 'per_campaign' | 'other'>('per_post');
  const [selectedDealType, setSelectedDealType] = useState<string>('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [selectedTimeline, setSelectedTimeline] = useState<string>('');
  const [exclusivity, setExclusivity] = useState<'exclusive' | 'non_exclusive'>('non_exclusive');
  const [whyThem, setWhyThem] = useState('');
  
  // Nouveaux états pour les champs "autre" et devise
  const [customDealType, setCustomDealType] = useState('');
  const [customBudgetCycle, setCustomBudgetCycle] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'EUR' | 'GBP' | 'AED' | 'SAR' | 'KWD'>('USD');
  
  const [sending, setSending] = useState(false);
  const [recipientProfile, setRecipientProfile] = useState<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null>(null);

  // Redirect managers to home
  useEffect(() => {
    if (!authLoading && role === 'manager') {
      navigate('/home', { replace: true });
    }
  }, [authLoading, role, navigate]);

  // Charger le profil du destinataire si celebrityId est présent
  useEffect(() => {
    if (celebrityId && !recipientProfile) {
      supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .eq('id', celebrityId)
        .single()
        .then(({ data }) => {
          if (data) setRecipientProfile(data);
        });
    }
  }, [celebrityId]);

  // Determine mode:
  // - If celebrityId present → deal mode
  // - Otherwise → redirect to search
  const isDealMode = !!celebrityId;

  // Redirect to search if no celebrityId (selection screen removed)
  useEffect(() => {
    if (!authLoading && !isDealMode && role !== 'manager') {
      navigate('/search?type=deal', { replace: true });
    }
  }, [authLoading, isDealMode, role, navigate]);

  // Budget options
  const BUDGETS = [
    { value: 'under_5k', label: { ar: 'أقل من 5000$', en: 'Under $5k' }, description: { ar: 'ميزانية صغيرة', en: 'Small budget' } },
    { value: '5k_10k', label: { ar: '5000$ - 10000$', en: '$5k - $10k' }, description: { ar: 'ميزانية متوسطة', en: 'Medium budget' } },
    { value: '10k_50k', label: { ar: '10000$ - 50000$', en: '$10k - $50k' }, description: { ar: 'ميزانية كبيرة', en: 'Large budget' } },
    { value: 'over_50k', label: { ar: 'أكثر من 50000$', en: 'Over $50k' }, description: { ar: 'ميزانية ضخمة', en: 'Huge budget' } },
  ];

  // Currency options
  const CURRENCIES = [
    { value: 'USD', label: '$', flag: '🇺🇸', name: { ar: 'دولار أمريكي', en: 'US Dollar' } },
    { value: 'EUR', label: '€', flag: '🇪🇺', name: { ar: 'يورو', en: 'Euro' } },
    { value: 'GBP', label: '£', flag: '🇬🇧', name: { ar: 'جنيه إسترليني', en: 'British Pound' } },
    { value: 'AED', label: 'د.إ', flag: '🇦🇪', name: { ar: 'درهم إماراتي', en: 'UAE Dirham' } },
    { value: 'SAR', label: 'ر.س', flag: '🇸🇦', name: { ar: 'ريال سعودي', en: 'Saudi Riyal' } },
    { value: 'KWD', label: 'د.ك', flag: '🇰🇼', name: { ar: 'دينار كويتي', en: 'Kuwaiti Dinar' } },
  ];

  // Deal type options - updated to match DealCardInline
  const DEAL_TYPES = [
    { value: 'sponsorship', label: { ar: 'رعاية', en: 'Sponsorship' }, description: { ar: 'رعاية علامة تجارية أو حدث', en: 'Brand or event sponsorship' } },
    { value: 'appearance', label: { ar: 'ظهور إعلاني', en: 'Brand Appearance' }, description: { ar: 'ظهور في إعلان أو حملة', en: 'Appearance in ad or campaign' } },
    { value: 'event', label: { ar: 'حضور فعالية', en: 'Event Attendance' }, description: { ar: 'حضور حدث أو مؤتمر', en: 'Attend event or conference' } },
    { value: 'collab', label: { ar: 'تعاون محتوى', en: 'Content Collab' }, description: { ar: 'إنشاء محتوى مشترك', en: 'Create joint content' } },
    { value: 'endorsement', label: { ar: 'ترويج منتج', en: 'Product Endorsement' }, description: { ar: 'ترويج منتج أو خدمة', en: 'Promote product or service' } },
    { value: 'other', label: { ar: 'أخرى', en: 'Other' }, description: { ar: 'نوع عرض آخر', en: 'Other deal type' } },
  ];

  // Timeline options
  const TIMELINE_OPTIONS = [
    { value: 'asap', label: { ar: 'عاجل', en: 'ASAP' }, description: { ar: 'في أقرب وقت ممكن', en: 'As soon as possible' } },
    { value: 'within_1_month', label: { ar: 'خلال شهر', en: 'Within 1 month' }, description: { ar: 'خلال 30 يوم', en: 'Within 30 days' } },
    { value: 'within_3_months', label: { ar: 'خلال 3 أشهر', en: 'Within 3 months' }, description: { ar: 'خلال 90 يوم', en: 'Within 90 days' } },
    { value: 'flexible', label: { ar: 'مرن', en: 'Flexible' }, description: { ar: 'لا يوجد موعد محدد', en: 'No fixed deadline' } },
  ];

  const handleSendDeal = async () => {
    // Validation des champs requis - deliverables maintenant requis
    if (!companyName.trim() || !websiteUrl.trim() || !selectedBudget || !selectedDealType || !campaignDescription.trim() || !deliverables.trim() || !selectedTimeline || !celebrityId || !user) return;
    
    // Smart validation & spam detection
    const validation = validateDealCard({
      companyName,
      websiteUrl,
      budgetRange: selectedBudget,
      campaignDescription,
      dealType: selectedDealType,
      timeline: selectedTimeline,
      deliverables,
      whyThem,
    });

    if (!validation.valid) {
      validation.errors.forEach(err => toast.error(err));
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.from('deal_cards').insert({
        sender_id: user.id,
        celebrity_id: celebrityId,
        company_name: companyName.trim(),
        website_url: websiteUrl.trim(),
        budget_range: selectedBudget,
        budget_cycle: budgetCycle === 'other' ? customBudgetCycle : budgetCycle,
        deal_type: selectedDealType === 'other' ? customDealType : selectedDealType,
        details: campaignDescription.trim(),
        deliverables: deliverables.trim() || null,
        timeline: selectedTimeline,
        exclusivity: exclusivity,
        why_them: whyThem.trim() || null,
        status: 'pending',
        budget_currency: selectedCurrency,
      } as any);
      if (error) throw error;
      toast.success(isRTL ? 'تم إرسال العرض' : 'Offer sent');
      // Reset form
      setCompanyName('');
      setWebsiteUrl('');
      setSelectedBudget('');
      setBudgetCycle('per_post');
      setSelectedDealType('');
      setCampaignDescription('');
      setDeliverables('');
      setSelectedTimeline('');
      setExclusivity('non_exclusive');
      setWhyThem('');
      setCustomDealType('');
      setCustomBudgetCycle('');
      setSelectedCurrency('USD');
      navigate('/offers');
    } catch (err) {
      console.error(err);
      toast.error(isRTL ? 'فشل الإرسال' : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleBack = () => {
    // Nettoyer les params et revenir à l'écran de sélection
    setSearchParams({}, { replace: true });
  };

  // Show loader while checking auth/role
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <svg className="animate-spin -ml-1 mr-2 h-8 w-8 text-primary" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
      </div>
    );
  }

  // Return null when redirecting (manager)
  if (role === 'manager') {
    return null;
  }

  // ===== MODE DEAL =====
  if (isDealMode) {
    // Validation des champs requis pour le bouton - deliverables maintenant requis
    const isFormValid = companyName.trim() && websiteUrl.trim() && selectedBudget && selectedDealType && campaignDescription.trim() && deliverables.trim() && selectedTimeline && 
      (selectedDealType !== 'other' || customDealType.trim()) &&
      (budgetCycle !== 'other' || customBudgetCycle.trim());

    const tLocal = (ar: string, en: string) => isRTL ? ar : en;

    // Section Header Component
    const SectionHeader = ({ icon: Icon, title, color = 'primary' }: { icon: React.ComponentType<{ className?: string }>; title: string; color?: string }) => (
      <div className="flex items-center gap-3 mb-4">
        <div className={cn('p-2 rounded-full shrink-0', `bg-${color}/10 text-${color}`)}>
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="font-semibold text-base text-foreground">{title}</h2>
      </div>
    );

    // Choice Button Component
    const ChoiceButton = ({ 
      value, 
      selected, 
      onClick, 
      label, 
      description, 
      children 
    }: { 
      value: string; 
      selected: boolean; 
      onClick: () => void; 
      label: { ar: string; en: string };
      description: { ar: string; en: string };
      children?: React.ReactNode;
    }) => (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative h-auto min-h-[72px] rounded-xl border-2 p-3 text-start transition-all touch-feedback",
          selected
            ? "border-primary bg-primary/5 text-primary"
            : "border-border bg-background hover:border-primary/50"
        )}
      >
        <div className="font-medium text-sm">{isRTL ? label.ar : label.en}</div>
        <div className="text-xs text-muted-foreground mt-1">{isRTL ? description.ar : description.en}</div>
        {selected && (
          <Check className="absolute top-2 end-2 h-4 w-4 text-primary" />
        )}
        {children}
      </button>
    );

    return (
      <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
        <header className="fixed top-0 right-0 left-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
          <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
            <button onClick={handleBack} className="p-2 -ml-2 rounded-lg hover:bg-accent touch-feedback">
              <X className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold flex-1 text-center">
              {t.compose.newOffer}
            </h1>
            <div className="w-10" />
          </div>
        </header>

        <main className="max-w-lg mx-auto pt-16 pb-20 px-4">
          <div className="space-y-4">
            {recipientProfile && (
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-2xl border border-primary/10">
                <Avatar className="h-12 w-12 flex-shrink-0">
                  <AvatarImage src={recipientProfile.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {recipientProfile.display_name?.[0] || recipientProfile.username?.[0] || '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{recipientProfile.display_name || recipientProfile.username}</p>
                  <p className="text-sm text-muted-foreground">@{recipientProfile.username}</p>
                </div>
              </div>
            )}

            {/* Deal Form Card */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-6">
              {/* Section 1: Company Information */}
              <section>
                <SectionHeader icon={Building2} title={tLocal('معلومات الشركة', 'Company Information')} color="blue" />
                
                <div className="space-y-4">
                  {/* Company Name */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      {tLocal('اسم الشركة', 'Company Name')}
                    </label>
                    <div className="relative">
                      <Building2 className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder={tLocal('مثال: شركة نايكي', 'e.g., Nike Inc.')}
                        className="h-12 rounded-xl border-2 focus:border-primary ps-12 bg-background"
                        required
                      />
                    </div>
                  </div>

                  {/* Website URL */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      {tLocal('الموقع الإلكتروني', 'Website URL')}
                    </label>
                    <div className="relative">
                      <Globe className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        type="url"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        placeholder={tLocal('مثال: https://nike.com', 'e.g., https://nike.com')}
                        className="h-12 rounded-xl border-2 focus:border-primary ps-12 bg-background"
                        required
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 2: Budget */}
              <section>
                <SectionHeader icon={DollarSign} title={tLocal('الميزانية', 'Budget')} color="green" />
                
                <div className="space-y-4">
                  {/* Budget Range - Choice Buttons */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {tLocal('نطاق الميزانية', 'Budget Range')}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {BUDGETS.map((budget) => (
                        <ChoiceButton
                          key={budget.value}
                          value={budget.value}
                          selected={selectedBudget === budget.value}
                          onClick={() => setSelectedBudget(budget.value)}
                          label={budget.label}
                          description={budget.description}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Currency Selector */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {tLocal('العملة', 'Currency')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CURRENCIES.map((currency) => (
                        <button
                          key={currency.value}
                          type="button"
                          onClick={() => setSelectedCurrency(currency.value as 'USD' | 'EUR' | 'GBP' | 'AED' | 'SAR' | 'KWD')}
                          className={cn(
                            "relative px-4 py-2 rounded-full text-sm font-medium transition-all touch-feedback border",
                            selectedCurrency === currency.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50 text-foreground"
                          )}
                        >
                          <span className="flex items-center gap-1.5">
                            {currency.flag}
                            {currency.label}
                          </span>
                          {selectedCurrency === currency.value && (
                            <Check className="absolute top-1 right-1 h-3.5 w-3.5 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Budget Cycle - Toggle Buttons */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {tLocal('دورة الميزانية', 'Budget Cycle')}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: 'per_post', label: { ar: 'لكل منشور', en: 'Per Post' }, description: { ar: 'الدفع لكل منشور منفصل', en: 'Payment per individual post' } },
                        { value: 'per_campaign', label: { ar: 'لكل حملة', en: 'Per Campaign' }, description: { ar: 'دفعة واحدة للحملة كاملة', en: 'Single payment for entire campaign' } },
                        { value: 'other', label: { ar: 'أخرى', en: 'Other' }, description: { ar: 'دورة ميزانية مخصصة', en: 'Custom budget cycle' } },
                      ].map((cycle) => (
                        <ChoiceButton
                          key={cycle.value}
                          value={cycle.value}
                          selected={budgetCycle === cycle.value}
                          onClick={() => setBudgetCycle(cycle.value as 'per_post' | 'per_campaign' | 'other')}
                          label={cycle.label}
                          description={cycle.description}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Custom Budget Cycle Input */}
                  {budgetCycle === 'other' && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        {tLocal('حدد دورة الميزانية', 'Specify Budget Cycle')}
                      </label>
                      <div className="relative">
                        <DollarSign className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          value={customBudgetCycle}
                          onChange={(e) => setCustomBudgetCycle(e.target.value)}
                          placeholder={tLocal('مثال: شهري، ربع سنوي، عند الإنجاز', 'e.g., Monthly, Quarterly, Upon completion')}
                          className="h-12 rounded-xl border-2 focus:border-primary ps-12 bg-background"
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Section 3: Deal Type */}
              <section>
                <SectionHeader icon={Briefcase} title={tLocal('نوع الصفقة', 'Deal Type')} color="purple" />
                
                <div className="space-y-4">
                  {/* Deal Type - Choice Buttons */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {tLocal('نوع التعاون', 'Collaboration Type')}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {DEAL_TYPES.map((type) => (
                        <ChoiceButton
                          key={type.value}
                          value={type.value}
                          selected={selectedDealType === type.value}
                          onClick={() => setSelectedDealType(type.value)}
                          label={type.label}
                          description={type.description}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Custom Deal Type Input */}
                  {selectedDealType === 'other' && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        {tLocal('حدد نوع التعاون', 'Specify Collaboration Type')}
                      </label>
                      <div className="relative">
                        <FileText className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          value={customDealType}
                          onChange={(e) => setCustomDealType(e.target.value)}
                          placeholder={tLocal('مثال: بث مباشر، بودكاست، حدث', 'e.g., Live stream, Podcast, Event appearance')}
                          className="h-12 rounded-xl border-2 focus:border-primary ps-12 bg-background"
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Section 4: Timeline */}
              <section>
                <SectionHeader icon={Calendar} title={tLocal('الجدول الزمني', 'Timeline')} color="orange" />
                
                <div className="space-y-4">
                  {/* Timeline - Choice Buttons */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {tLocal('الموعد النهائي', 'Deadline')}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {TIMELINE_OPTIONS.map((timeline) => (
                        <ChoiceButton
                          key={timeline.value}
                          value={timeline.value}
                          selected={selectedTimeline === timeline.value}
                          onClick={() => setSelectedTimeline(timeline.value)}
                          label={timeline.label}
                          description={timeline.description}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Exclusivity - Toggle Buttons */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {tLocal('الحصرية', 'Exclusivity')}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: 'exclusive', label: { ar: 'حصرية', en: 'Exclusive' }, description: { ar: 'لا تعمل مع منافسين خلال الفترة', en: 'No competitor work during period' } },
                        { value: 'non_exclusive', label: { ar: 'غير حصرية', en: 'Non-Exclusive' }, description: { ar: 'يمكن العمل مع علامات تجارية أخرى', en: 'Can work with other brands' } },
                      ].map((excl) => (
                        <ChoiceButton
                          key={excl.value}
                          value={excl.value}
                          selected={exclusivity === excl.value}
                          onClick={() => setExclusivity(excl.value as 'exclusive' | 'non_exclusive')}
                          label={excl.label}
                          description={excl.description}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 5: Description */}
              <section>
                <SectionHeader icon={FileText} title={tLocal('الوصف', 'Description')} color="amber" />
                
                <div className="space-y-4">
                  {/* Campaign Description */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      {tLocal('وصف الحملة', 'Campaign Description')}
                    </label>
                    <Textarea
                      value={campaignDescription}
                      onChange={(e) => setCampaignDescription(e.target.value)}
                      placeholder={tLocal('صف بالتفصيل ما تريد إنجازه: الأهداف، الرسالة، النبرة، الهاشتاجات المطلوبة...', 'Describe in detail what you want to achieve: goals, message, tone, required hashtags...')}
                      className="h-28 rounded-xl border-2 focus:border-primary resize-none bg-background p-4"
                      rows={4}
                      required
                    />
                  </div>

                  {/* Deliverables (required) - avec astérisque rouge et compteur de caractères */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-1">
                      {tLocal('المخرجات المطلوبة', 'Required Deliverables')}
                      <span className="text-destructive" aria-hidden="true">*</span>
                    </label>
                    <div className="relative">
                      <Textarea
                        value={deliverables}
                        onChange={(e) => setDeliverables(e.target.value)}
                        placeholder={tLocal('مثال: 3 منشورات فيد، 5 ستوريز، 1 ريلز، رابط في البايو لمدة أسبوع', 'e.g., 3 feed posts, 5 stories, 1 reel, link in bio for 1 week')}
                        className="h-24 rounded-xl border-2 focus:border-primary resize-none bg-background p-4 pr-20"
                        rows={3}
                        maxLength={200}
                        required
                      />
                      <div className="absolute bottom-2 end-2 text-xs text-muted-foreground">
                        {200 - deliverables.length} / 200
                      </div>
                    </div>
                  </div>

                  {/* Why Them (optional) */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      {tLocal('لماذا اخترت هذا المؤثر؟ (اختياري)', 'Why This Influencer? (Optional)')}
                    </label>
                    <Textarea
                      value={whyThem}
                      onChange={(e) => setWhyThem(e.target.value)}
                      placeholder={tLocal('مثال: جمهورهم يتطابق مع جمهورنا المستهدف، معدل تفاعل عالي، أسلوب محتوى يناسب علامتنا', 'e.g., Their audience matches our target, high engagement rate, content style fits our brand')}
                      className="h-24 rounded-xl border-2 focus:border-primary resize-none bg-background p-4"
                      rows={3}
                    />
                  </div>
                </div>
              </section>

              {/* Submit Button */}
              <Button
                onClick={handleSendDeal}
                disabled={!isFormValid || sending}
                className="w-full h-12 rounded-xl font-semibold text-base flex items-center justify-center gap-2 mt-2"
              >
                {sending ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    {tLocal('جاري الإرسال...', 'Sending...')}
                  </>
                ) : (
                  <>
                    <Briefcase className="h-5 w-5" />
                    {tLocal('إرسال العرض', 'Send Offer')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Loading state while redirecting to search
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <svg className="animate-spin -ml-1 mr-2 h-8 w-8 text-primary" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
    </div>
  );
};
