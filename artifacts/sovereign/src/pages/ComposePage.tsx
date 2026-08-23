import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Briefcase, ArrowRight, X, Globe, Building2, DollarSign, Calendar, FileText } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { toast } from 'sonner';

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
  const [budgetRange, setBudgetRange] = useState('');
  const [budgetCycle, setBudgetCycle] = useState<'per_post' | 'per_campaign' | 'other'>('per_post');
  const [dealType, setDealType] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [timeline, setTimeline] = useState('');
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
  // - Otherwise → selection screen
  const isDealMode = !!celebrityId;

  const handleSendDeal = async () => {
    // Validation des champs requis
    if (!companyName.trim() || !websiteUrl.trim() || !budgetRange.trim() || !dealType.trim() || !campaignDescription.trim() || !timeline.trim() || !celebrityId || !user) return;
    
    setSending(true);
    try {
      const { error } = await supabase.from('deal_cards').insert({
        sender_id: user.id,
        celebrity_id: celebrityId,
        company_name: companyName.trim(),
        website_url: websiteUrl.trim(),
        budget_range: budgetRange.trim(),
        budget_cycle: budgetCycle,
        deal_type: dealType.trim(),
        details: campaignDescription.trim(),
        deliverables: deliverables.trim() || null,
        timeline: timeline.trim(),
        exclusivity: exclusivity,
        why_them: whyThem.trim() || null,
        status: 'pending',
      } as any);
      if (error) throw error;
      toast.success(isRTL ? 'Offre envoyée' : 'Deal sent');
      // Reset form
      setCompanyName('');
      setWebsiteUrl('');
      setBudgetRange('');
      setBudgetCycle('per_post');
      setDealType('');
      setCampaignDescription('');
      setDeliverables('');
      setTimeline('');
      setExclusivity('non_exclusive');
      setWhyThem('');
      navigate('/offers');
    } catch (err) {
      console.error(err);
      toast.error(isRTL ? 'Échec de l\'envoi' : 'Failed to send');
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
    const isFormValid = companyName.trim() && websiteUrl.trim() && budgetRange.trim() && dealType.trim() && campaignDescription.trim() && timeline.trim();

    return (
      <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
        <header className="fixed top-0 right-0 left-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
          <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
            <button onClick={handleBack} className="p-2 -ml-2 rounded-lg hover:bg-accent touch-feedback">
              <X className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold flex-1 text-center">
              {isRTL ? 'Nouvelle offre' : 'New Offer'}
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
                    {isRTL ? 'Détails de l\'offre' : 'Offer Details'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isRTL ? 'Remplissez les informations pour envoyer une offre professionnelle' : 'Fill in the details to send a professional offer'}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Company Name */}
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">
                    {isRTL ? 'Nom de l\'entreprise *' : 'Company Name *'}
                  </label>
                  <div className="relative">
                    <Building2 className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder={isRTL ? 'ex: Acme Inc.' : 'e.g. Acme Inc.'}
                      className="h-12 rounded-xl border-2 focus:border-primary ps-12 bg-background"
                      required
                    />
                  </div>
                </div>

                {/* Website URL */}
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">
                    {isRTL ? 'Site web *' : 'Website URL *'}
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

                {/* Budget Range & Budget Cycle */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-foreground">
                      {isRTL ? 'Budget *' : 'Budget Range *'}
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        value={budgetRange}
                        onChange={(e) => setBudgetRange(e.target.value)}
                        placeholder={isRTL ? 'ex: 5000-10000 $' : 'e.g. 5000-10000 $'}
                        className="h-12 rounded-xl border-2 focus:border-primary ps-12 bg-background"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-foreground">
                      {isRTL ? 'Cycle budgétaire *' : 'Budget Cycle *'}
                    </label>
                    <select
                      value={budgetCycle}
                      onChange={(e) => setBudgetCycle(e.target.value as 'per_post' | 'per_campaign' | 'other')}
                      className="w-full h-12 rounded-xl border-2 focus:border-primary bg-background ps-4 pe-10 appearance-none text-foreground"
                      required
                    >
                      <option value="per_post">{isRTL ? 'Par publication' : 'Per Post'}</option>
                      <option value="per_campaign">{isRTL ? 'Par campagne' : 'Per Campaign'}</option>
                      <option value="other">{isRTL ? 'Autre' : 'Other'}</option>
                    </select>
                  </div>
                </div>

                {/* Deal Type */}
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">
                    {isRTL ? 'Type de deal *' : 'Deal Type *'}
                  </label>
                  <div className="relative">
                    <FileText className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      value={dealType}
                      onChange={(e) => setDealType(e.target.value)}
                      placeholder={isRTL ? 'ex: Collaboration Instagram' : 'e.g. Instagram Collaboration'}
                      className="h-12 rounded-xl border-2 focus:border-primary ps-12 bg-background"
                      required
                    />
                  </div>
                </div>

                {/* Campaign Description */}
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">
                    {isRTL ? 'Description de la campagne *' : 'Campaign Description *'}
                  </label>
                  <Textarea
                    value={campaignDescription}
                    onChange={(e) => setCampaignDescription(e.target.value)}
                    placeholder={isRTL ? 'Décrivez la campagne...' : 'Describe the campaign...'}
                    className="h-28 rounded-xl border-2 focus:border-primary resize-none bg-background p-4"
                    rows={4}
                    required
                  />
                </div>

                {/* Deliverables (optional) */}
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">
                    {isRTL ? 'Livrables (optionnel)' : 'Deliverables (optional)'}
                  </label>
                  <Textarea
                    value={deliverables}
                    onChange={(e) => setDeliverables(e.target.value)}
                    placeholder={isRTL ? 'Listez les livrables attendus...' : 'List expected deliverables...'}
                    className="h-24 rounded-xl border-2 focus:border-primary resize-none bg-background p-4"
                    rows={3}
                  />
                </div>

                {/* Timeline & Exclusivity */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-foreground">
                      {isRTL ? 'Délai *' : 'Timeline *'}
                    </label>
                    <div className="relative">
                      <Calendar className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        value={timeline}
                        onChange={(e) => setTimeline(e.target.value)}
                        placeholder={isRTL ? 'ex: 2 semaines' : 'e.g. 2 weeks'}
                        className="h-12 rounded-xl border-2 focus:border-primary ps-12 bg-background"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-foreground">
                      {isRTL ? 'Exclusivité *' : 'Exclusivity *'}
                    </label>
                    <select
                      value={exclusivity}
                      onChange={(e) => setExclusivity(e.target.value as 'exclusive' | 'non_exclusive')}
                      className="w-full h-12 rounded-xl border-2 focus:border-primary bg-background ps-4 pe-10 appearance-none text-foreground"
                      required
                    >
                      <option value="exclusive">{isRTL ? 'Exclusif' : 'Exclusive'}</option>
                      <option value="non_exclusive">{isRTL ? 'Non exclusif' : 'Non-Exclusive'}</option>
                    </select>
                  </div>
                </div>

                {/* Why Them (optional) */}
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">
                    {isRTL ? 'Pourquoi eux ? (optionnel)' : 'Why Them? (optional)'}
                  </label>
                  <Textarea
                    value={whyThem}
                    onChange={(e) => setWhyThem(e.target.value)}
                    placeholder={isRTL ? 'Pourquoi cette célébrité est-elle idéale ?' : 'Why is this celebrity the right fit?'}
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

  // ===== ÉCRAN DE SÉLECTION (par défaut) =====
  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            {isRTL ? 'إنشاء عرض' : 'Create Offer'}
          </h1>
          <p className="mt-2 text-muted-foreground text-lg">
            {isRTL ? 'أرسل عرضًا احترافيًا' : 'Send a professional offer'}
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-md mx-auto">
          <button
            onClick={() => navigate('/search?type=deal')}
            className="group flex flex-col items-center justify-center p-8 bg-card border border-border rounded-2xl shadow-sm hover:shadow-lg hover:border-primary/50 transition-all duration-300"
          >
            <div className="p-4 bg-primary/10 rounded-full text-primary mb-4 group-hover:bg-primary/20 transition-colors">
              <Briefcase className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {isRTL ? 'بطاقة عرض' : 'Deal Card'}
            </h2>
            <p className="text-muted-foreground text-center">
              {isRTL ? 'أرسل عرضًا احترافيًا' : 'Send a professional offer'}
            </p>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
              {isRTL ? 'إنشاء عرض' : 'Create offer'}
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
