import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Briefcase, ArrowRight, X, Globe, Building2, DollarSign, Calendar, FileText, Check } from 'lucide-react';
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
  const { isRTL } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const { role } = useRole();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const celebrityId = searchParams.get('celebrityId');

  // Nouveaux états pour le formulaire de deal
  const [companyName, setCompanyName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [selectedBudget, setSelectedBudget] = useState<string>('');
  const [budgetCycle, setBudgetCycle] = useState<'per_post' | 'per_campaign'>('per_post');
  const [selectedDealType, setSelectedDealType] = useState<string>('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [selectedTimeline, setSelectedTimeline] = useState<string>('');
  const [exclusivity, setExclusivity] = useState<'exclusive' | 'non_exclusive'>('non_exclusive');
  const [whyThem, setWhyThem] = useState('');
  
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

  // Deal type options
  const DEAL_TYPES = [
    { value: 'instagram_post', label: { ar: 'منشور انستغرام', en: 'Instagram Post' }, description: { ar: 'منشور واحد على انستغرام', en: 'Single Instagram post' } },
    { value: 'instagram_story', label: { ar: 'ستوري انستغرام', en: 'Instagram Story' }, description: { ar: 'ستوري على انستغرام', en: 'Instagram story' } },
    { value: 'instagram_reel', label: { ar: 'ريلز انستغرام', en: 'Instagram Reel' }, description: { ar: 'فيديو ريلز على انستغرام', en: 'Instagram Reel video' } },
    { value: 'tiktok_video', label: { ar: 'فيديو تيك توك', en: 'TikTok Video' }, description: { ar: 'فيديو على تيك توك', en: 'TikTok video' } },
    { value: 'youtube_video', label: { ar: 'فيديو يوتيوب', en: 'YouTube Video' }, description: { ar: 'فيديو على يوتيوب', en: 'YouTube video' } },
    { value: 'other', label: { ar: 'أخرى', en: 'Other' }, description: { ar: 'نوع آخر من التعاون', en: 'Other collaboration type' } },
  ];

  // Timeline options
  const TIMELINE_OPTIONS = [
    { value: 'asap', label: { ar: 'عاجل', en: 'ASAP' }, description: { ar: 'في أقرب وقت ممكن', en: 'As soon as possible' } },
    { value: 'within_1_month', label: { ar: 'خلال شهر', en: 'Within 1 month' }, description: { ar: 'خلال 30 يوم', en: 'Within 30 days' } },
    { value: 'within_3_months', label: { ar: 'خلال 3 أشهر', en: 'Within 3 months' }, description: { ar: 'خلال 90 يوم', en: 'Within 90 days' } },
    { value: 'flexible', label: { ar: 'مرن', en: 'Flexible' }, description: { ar: 'لا يوجد موعد محدد', en: 'No fixed deadline' } },
  ];

  const handleSendDeal = async () => {
    // Validation des champs requis
    if (!companyName.trim() || !websiteUrl.trim() || !selectedBudget || !selectedDealType || !campaignDescription.trim() || !selectedTimeline || !celebrityId || !user) return;
    
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
        budget_cycle: budgetCycle,
        deal_type: selectedDealType,
        details: campaignDescription.trim(),
        deliverables: deliverables.trim() || null,
        timeline: selectedTimeline,
        exclusivity: exclusivity,
        why_them: whyThem.trim() || null,
        status: 'pending',
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
    // Validation des champs requis pour le bouton
    const isFormValid = companyName.trim() && websiteUrl.trim() && selectedBudget && selectedDealType && campaignDescription.trim() && selectedTimeline;

    return (
      <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
        <header className="fixed top-0 right-0 left-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
          <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
            <button onClick={handleBack} className="p-2 -ml-2 rounded-lg hover:bg-accent touch-feedback">
              <X className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold flex-1 text-center">
              {isRTL ? 'عرض جديد' : 'New Offer'}
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
            <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
              <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                  <Briefcase className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg text-foreground">
                    {isRTL ? 'تفاصيل العرض' : 'Offer Details'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isRTL ? 'املأ المعلومات لإرسال عرض احترافي' : 'Fill in the details to send a professional offer'}
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Company Name */}
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">
                    {isRTL ? 'اسم الشركة *' : 'Company Name *'}
                  </label>
                  <div className="relative">
                    <Building2 className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder={isRTL ? 'مثال: شركة أكمي' : 'e.g. Acme Inc.'}
                      className="h-12 rounded-xl border-2 focus:border-primary ps-12 bg-background"
                      required
                    />
                  </div>
                </div>

                {/* Website URL */}
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">
                    {isRTL ? 'الموقع الإلكتروني *' : 'Website URL *'}
                  </label>
                  <div className="relative">
                    <Globe className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      type="url"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="h-12 rounded-xl border-2 focus:border-primary ps-12 bg-background"
                      required
                    />
                  </div>
                </div>

                {/* Budget Range - Choice Buttons */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">
                    {isRTL ? 'الميزانية *' : 'Budget *'}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {BUDGETS.map((budget) => (
                      <button
                        key={budget.value}
                        type="button"
                        onClick={() => setSelectedBudget(budget.value)}
                        className={cn(
                          "relative h-auto min-h-[72px] rounded-xl border-2 p-3 text-start transition-all touch-feedback",
                          selectedBudget === budget.value
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border bg-background hover:border-primary/50"
                        )}
                      >
                        <div className="font-medium text-sm">{isRTL ? budget.label.ar : budget.label.en}</div>
                        <div className="text-xs text-muted-foreground mt-1">{isRTL ? budget.description.ar : budget.description.en}</div>
                        {selectedBudget === budget.value && (
                          <Check className="absolute top-2 end-2 h-4 w-4 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Budget Cycle - Toggle Buttons */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">
                    {isRTL ? 'دورة الميزانية *' : 'Budget Cycle *'}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'per_post', label: { ar: 'لكل منشور', en: 'Per Post' } },
                      { value: 'per_campaign', label: { ar: 'لكل حملة', en: 'Per Campaign' } },
                    ].map((cycle) => (
                      <button
                        key={cycle.value}
                        type="button"
                        onClick={() => setBudgetCycle(cycle.value as 'per_post' | 'per_campaign')}
                        className={cn(
                          "relative h-11 rounded-xl border-2 font-medium transition-all touch-feedback",
                          budgetCycle === cycle.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background hover:border-primary/50"
                        )}
                      >
                        {isRTL ? cycle.label.ar : cycle.label.en}
                        {budgetCycle === cycle.value && (
                          <Check className="absolute top-1/2 end-2 -translate-y-1/2 h-4 w-4 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Deal Type - Choice Buttons */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">
                    {isRTL ? 'نوع الصفقة *' : 'Deal Type *'}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {DEAL_TYPES.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setSelectedDealType(type.value)}
                        className={cn(
                          "relative h-auto min-h-[72px] rounded-xl border-2 p-3 text-start transition-all touch-feedback",
                          selectedDealType === type.value
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border bg-background hover:border-primary/50"
                        )}
                      >
                        <div className="font-medium text-sm">{isRTL ? type.label.ar : type.label.en}</div>
                        <div className="text-xs text-muted-foreground mt-1">{isRTL ? type.description.ar : type.description.en}</div>
                        {selectedDealType === type.value && (
                          <Check className="absolute top-2 end-2 h-4 w-4 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campaign Description */}
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">
                    {isRTL ? 'وصف الحملة *' : 'Campaign Description *'}
                  </label>
                  <Textarea
                    value={campaignDescription}
                    onChange={(e) => setCampaignDescription(e.target.value)}
                    placeholder={isRTL ? 'صف الحملة بالتفصيل...' : 'Describe the campaign in detail...'}
                    className="h-28 rounded-xl border-2 focus:border-primary resize-none bg-background p-4"
                    rows={4}
                    required
                  />
                </div>

                {/* Deliverables (optional) */}
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">
                    {isRTL ? 'المخرجات (اختياري)' : 'Deliverables (optional)'}
                  </label>
                  <Textarea
                    value={deliverables}
                    onChange={(e) => setDeliverables(e.target.value)}
                    placeholder={isRTL ? 'اذكر المخرجات المتوقعة...' : 'List expected deliverables...'}
                    className="h-24 rounded-xl border-2 focus:border-primary resize-none bg-background p-4"
                    rows={3}
                  />
                </div>

                {/* Timeline - Choice Buttons */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">
                    {isRTL ? 'الجدول الزمني *' : 'Timeline *'}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {TIMELINE_OPTIONS.map((timeline) => (
                      <button
                        key={timeline.value}
                        type="button"
                        onClick={() => setSelectedTimeline(timeline.value)}
                        className={cn(
                          "relative h-auto min-h-[72px] rounded-xl border-2 p-3 text-start transition-all touch-feedback",
                          selectedTimeline === timeline.value
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border bg-background hover:border-primary/50"
                        )}
                      >
                        <div className="font-medium text-sm">{isRTL ? timeline.label.ar : timeline.label.en}</div>
                        <div className="text-xs text-muted-foreground mt-1">{isRTL ? timeline.description.ar : timeline.description.en}</div>
                        {selectedTimeline === timeline.value && (
                          <Check className="absolute top-2 end-2 h-4 w-4 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Exclusivity - Toggle Buttons */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">
                    {isRTL ? 'الحصرية *' : 'Exclusivity *'}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'exclusive', label: { ar: 'حصرية', en: 'Exclusive' } },
                      { value: 'non_exclusive', label: { ar: 'غير حصرية', en: 'Non-Exclusive' } },
                    ].map((excl) => (
                      <button
                        key={excl.value}
                        type="button"
                        onClick={() => setExclusivity(excl.value as 'exclusive' | 'non_exclusive')}
                        className={cn(
                          "relative h-11 rounded-xl border-2 font-medium transition-all touch-feedback",
                          exclusivity === excl.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background hover:border-primary/50"
                        )}
                      >
                        {isRTL ? excl.label.ar : excl.label.en}
                        {exclusivity === excl.value && (
                          <Check className="absolute top-1/2 end-2 -translate-y-1/2 h-4 w-4 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Why Them (optional) */}
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">
                    {isRTL ? 'لماذا هم؟ (اختياري)' : 'Why Them? (optional)'}
                  </label>
                  <Textarea
                    value={whyThem}
                    onChange={(e) => setWhyThem(e.target.value)}
                    placeholder={isRTL ? 'لماذا هذه الشخصية المثالية؟' : 'Why is this celebrity the right fit?'}
                    className="h-24 rounded-xl border-2 focus:border-primary resize-none bg-background p-4"
                    rows={3}
                  />
                </div>
              </div>

              <Button
                onClick={handleSendDeal}
                disabled={!isFormValid || sending}
                className="w-full h-12 rounded-xl mt-2 flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    {isRTL ? 'جاري الإرسال...' : 'Sending...'}
                  </>
                ) : (
                  <>
                    <Briefcase className="h-5 w-5" />
                    {isRTL ? 'إرسال العرض' : 'Send Offer'}
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
