import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { MessageSquare, Briefcase, ArrowRight, X, Send, Paperclip, Mic, Smile, Globe, Building2, DollarSign, Calendar, FileText } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export const ComposePage = () => {
  const { isRTL } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const recipientId = searchParams.get('recipientId');
  const celebrityId = searchParams.get('celebrityId');
  const typeParam = searchParams.get('type'); // 'deal' | 'message'

  // États pour les composeurs
  const [messageText, setMessageText] = useState('');
  const [dealType, setDealType] = useState('');
  const [budgetRange, setBudgetRange] = useState('');
  const [timeline, setTimeline] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [recipientProfile, setRecipientProfile] = useState<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null>(null);

  // Charger le profil du destinataire si recipientId ou celebrityId est présent
  useEffect(() => {
    const targetId = recipientId || celebrityId;
    if (targetId && !recipientProfile) {
      supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .eq('id', targetId)
        .single()
        .then(({ data }) => {
          if (data) setRecipientProfile(data);
        });
    }
  }, [recipientId, celebrityId]);

  // Si on a un recipientId → mode message
  // Si on a celebrityId + type=deal → mode deal
  // Sinon → écran de sélection
  const isMessageMode = !!recipientId;
  const isDealMode = !!celebrityId && typeParam === 'deal';

  const handleSendMessage = async () => {
    if (!messageText.trim() || !recipientId || !user) return;
    setSending(true);
    try {
      const { error } = await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: recipientId,
        content: messageText.trim(),
        category: 'direct',
      });
      if (error) throw error;
      toast.success(isRTL ? 'Message envoyé' : 'Message sent');
      setMessageText('');
      navigate('/home');
    } catch (err) {
      console.error(err);
      toast.error(isRTL ? 'Échec de l\'envoi' : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleSendDeal = async () => {
    if (!dealType.trim() || !celebrityId || !user) return;
    setSending(true);
    try {
      const { error } = await supabase.from('deal_cards').insert({
        sender_id: user.id,
        celebrity_id: celebrityId,
        deal_type: dealType.trim(),
        budget_range: budgetRange.trim() || null,
        timeline: timeline.trim() || null,
        details: details.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
      toast.success(isRTL ? 'Offre envoyée' : 'Deal sent');
      setDealType('');
      setBudgetRange('');
      setTimeline('');
      setDetails('');
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

  // ===== MODE MESSAGE =====
  if (isMessageMode) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? 'rtl' : 'ltr'}>
        <header className="fixed top-0 right-0 left-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
          <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
            <button onClick={handleBack} className="p-2 -ml-2 rounded-lg hover:bg-accent touch-feedback">
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarImage src={recipientProfile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {recipientProfile?.display_name?.[0] || recipientProfile?.username?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold truncate">{recipientProfile?.display_name || recipientProfile?.username || '...'}</p>
                {recipientProfile?.username && <p className="text-xs text-muted-foreground">@{recipientProfile.username}</p>}
              </div>
            </div>
            <div className="w-10" />
          </div>
        </header>

        <main className="flex-1 flex flex-col pt-16 pb-20 px-4 max-w-lg mx-auto w-full">
          <div className="flex-1 overflow-y-auto space-y-4 mb-4" id="messages-end">
            {/* Ici on pourrait afficher l'historique, mais pour l'instant zone de saisie */}
          </div>

          <div className="border-t border-border p-4 bg-card sticky bottom-0 safe-area-inset-bottom">
            <div className="flex items-end gap-2">
              <Textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={isRTL ? 'Écrivez un message...' : 'Write a message...'}
                className="flex-1 min-h-[44px] max-h-32 resize-none rounded-2xl border-2 focus:border-primary"
                rows={1}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!messageText.trim() || sending}
                className="h-11 w-11 rounded-full p-0 flex-shrink-0"
                size="icon"
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <Paperclip className="h-4 w-4" />
              <Mic className="h-4 w-4" />
              <Smile className="h-4 w-4" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ===== MODE DEAL =====
  if (isDealMode) {
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

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  {isRTL ? 'Type de deal *' : 'Deal Type *'}
                </label>
                <div className="relative">
                  <FileText className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    value={dealType}
                    onChange={(e) => setDealType(e.target.value)}
                    placeholder={isRTL ? 'ex: Collaboration Instagram' : 'e.g. Instagram Collaboration'}
                    className="h-12 rounded-2xl border-2 focus:border-primary ps-12"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  {isRTL ? 'Budget' : 'Budget Range'}
                </label>
                <div className="relative">
                  <DollarSign className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    value={budgetRange}
                    onChange={(e) => setBudgetRange(e.target.value)}
                    placeholder={isRTL ? 'ex: 5000-10000 $' : 'e.g. 5000-10000 $'}
                    className="h-12 rounded-2xl border-2 focus:border-primary ps-12"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  {isRTL ? 'Délai' : 'Timeline'}
                </label>
                <div className="relative">
                  <Calendar className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    value={timeline}
                    onChange={(e) => setTimeline(e.target.value)}
                    placeholder={isRTL ? 'ex: 2 semaines' : 'e.g. 2 weeks'}
                    className="h-12 rounded-2xl border-2 focus:border-primary ps-12"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  {isRTL ? 'Détails' : 'Details'}
                </label>
                <Textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={isRTL ? 'Décrivez l\'offre...' : 'Describe the offer...'}
                  className="h-28 rounded-2xl border-2 focus:border-primary resize-none"
                  rows={4}
                />
              </div>
            </div>

            <Button
              onClick={handleSendDeal}
              disabled={!dealType.trim() || sending}
              className="w-full h-12 rounded-2xl mt-6"
            >
              {sending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  {isRTL ? 'جاري الإرسال...' : 'Sending...'}
                </>
              ) : (
                isRTL ? 'إرسال العرض' : 'Send Offer'
              )}
            </Button>
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
            {isRTL ? 'إنشاء رسالة' : 'Create Message'}
          </h1>
          <p className="mt-2 text-muted-foreground text-lg">
            {isRTL ? 'ابدأ محادثة جديدة أو أرسل عرضًا احترافيًا' : 'Start a new conversation or send a professional offer'}
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => navigate('/search?type=message')}
            className="group flex flex-col items-center justify-center p-8 bg-card border border-border rounded-2xl shadow-sm hover:shadow-lg hover:border-primary/50 transition-all duration-300"
          >
            <div className="p-4 bg-primary/10 rounded-full text-primary mb-4 group-hover:bg-primary/20 transition-colors">
              <MessageSquare className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {isRTL ? 'رسالة عادية' : 'Regular Message'}
            </h2>
            <p className="text-muted-foreground text-center">
              {isRTL ? 'دردشة سريعة ومباشرة' : 'Quick and direct chat'}
            </p>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
              {isRTL ? 'ابدأ الدردشة' : 'Start chatting'}
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>

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
