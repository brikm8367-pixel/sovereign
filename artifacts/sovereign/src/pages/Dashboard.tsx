import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, User, Check, Crown, Briefcase, DollarSign, Calendar, Building2, X, Heart, RotateCcw, FileText, Shield, UserCheck, Globe } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { BottomNavigation } from '@/components/BottomNavigation';
import InboxSection, { MessageCategory, Message } from '@/components/messaging/InboxSection';
import { CelebritySwitcher } from '@/components/manager/CelebritySwitcher';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface PendingDeal {
  id: string;
  deal_type: string | null;
  company_name: string | null;
  budget_range: string | null;
  timeline: string | null;
  details: string | null;
  website_url: string | null;
  budget_cycle: string | null;
  deliverables: string | null;
  exclusivity: string | null;
  why_them: string | null;
  sender_id: string;
  celebrity_id: string;
  status: string;
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const { role, accountType, managedCelebrityId, managedCelebrities, switchCelebrity } = useRole();
  const { isRTL, language } = useLanguage();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [activeCategory, setActiveCategory] = useState<MessageCategory>('work');
  const [hasActiveManager, setHasActiveManager] = useState(false);
  const [pendingDeals, setPendingDeals] = useState<PendingDeal[]>([]);
  const [isLoadingDeals, setIsLoadingDeals] = useState(false);

  useEffect(() => { if (!loading && !user) navigate('/'); }, [user, loading, navigate]);

  // Check if celebrity has an active manager
  useEffect(() => {
    const checkActiveManager = async () => {
      if (!user || accountType !== 'celebrity') {
        setHasActiveManager(false);
        return;
      }
      const { data } = await supabase
        .from('manager_links')
        .select('id')
        .eq('celebrity_id', user.id)
        .eq('status', 'active')
        .limit(1);
      setHasActiveManager(!!data && data.length > 0);
    };
    checkActiveManager();
  }, [user, accountType]);

  // Fetch pending deals for manager
  useEffect(() => {
    const fetchPendingDeals = async () => {
      if (role !== 'manager' || !managedCelebrityId || !user) {
        setPendingDeals([]);
        return;
      }
      setPendingDeals([]);
      setIsLoadingDeals(true);
      try {
        const { data, error } = await supabase
          .from('deal_cards')
          .select('id, deal_type, company_name, budget_range, timeline, details, website_url, budget_cycle, deliverables, exclusivity, why_them, sender_id, celebrity_id, status')
          .eq('celebrity_id', managedCelebrityId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Mark pending deals as viewed
        await supabase.from('deal_cards').update({ viewed_at: new Date().toISOString() } as any).eq('celebrity_id', managedCelebrityId).eq('status', 'pending').is('viewed_at', null);

        setPendingDeals((data as unknown as PendingDeal[]) || []);
      } catch (error) {
        console.error('Error fetching pending deals:', error);
        toast.error(isRTL ? 'فشل تحميل العروض' : 'Failed to load offers');
        setPendingDeals([]);
      } finally {
        setIsLoadingDeals(false);
      }
    };
    fetchPendingDeals();
  }, [role, managedCelebrityId, user, isRTL]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!user) return;
    setMessages([]);
    setIsLoadingMessages(true);

    let query;
    if (role === 'manager' && managedCelebrityId) {
      // Manager viewing messages for the selected celebrity
      query = supabase
        .from('messages')
        .select('*')
        .eq('celebrity_id', managedCelebrityId)
        .eq('category', 'work')
        .order('created_at', { ascending: false });
    } else if (role === 'manager') {
      // Fallback for manager without selected celebrity
      query = supabase
        .from('messages')
        .select('*')
        .or(`receiver_id.eq.${user.id},sender_id.eq.${user.id}`)
        .eq('category', 'work')
        .order('created_at', { ascending: false });
    } else {
      // Current user logic: all messages (sent and received) without category filter
      query = supabase
        .from('messages')
        .select('*')
        .or(`receiver_id.eq.${user.id},sender_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
    }

    const { data: messagesData, error: messagesError } = await query;

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      setIsLoadingMessages(false);
      return;
    }

    const messages = (messagesData as unknown as Message[]) || [];

    // Extract unique sender_ids
    const senderIds = Array.from(new Set(messages.map(m => m.sender_id).filter(Boolean)));

    // Fetch profiles for those sender_ids
    let profilesMap: Record<string, Profile> = {};
    if (senderIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', senderIds);

      if (profilesData) {
        profilesMap = profilesData.reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {} as Record<string, Profile>);
      }
    }

    // Merge profile data into messages
    const messagesWithProfiles = messages.map(message => ({
      ...message,
      sender_profile: profilesMap[message.sender_id] || null,
    }));

    setMessages(messagesWithProfiles);

    // For non-manager users, set activeCategory based on most recent message
    if (role !== 'manager' && messagesWithProfiles.length > 0) {
      const mostRecentCategory = messagesWithProfiles[0].category as MessageCategory;
      if (['work', 'direct', 'audience'].includes(mostRecentCategory)) {
        setActiveCategory(mostRecentCategory);
      }
    } else if (role !== 'manager' && messagesWithProfiles.length === 0) {
      setActiveCategory('work');
    }

    setIsLoadingMessages(false);
  }, [user, role, managedCelebrityId]);

  useEffect(() => {
    if (user) {
      fetchMessages();
    }
  }, [fetchMessages, user, managedCelebrityId]);

  // Refetch messages on window focus (e.g., returning from ChatPage)
  useEffect(() => {
    const handleFocus = () => {
      if (user) {
        fetchMessages();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchMessages, user]);

  // Mark message as read
  const handleMessageRead = useCallback(async (message: Message) => {
    if (!user || message.is_read) return;
    await supabase.from('messages').update({ is_read: true }).eq('id', message.id);
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, is_read: true } : m));
  }, [user]);

  // Update deal status
  const updateDealStatus = async (dealId: string, status: any) => {
    const { error } = await supabase
      .from('deal_cards')
      .update({ status: status as any })
      .eq('id', dealId);
    if (error) throw error;
  };

  // Handle reject
  const handleReject = async (deal: PendingDeal) => {
    try {
      await updateDealStatus(deal.id, 'declined');
      setPendingDeals(prev => prev.filter(d => d.id !== deal.id));
      toast.success(isRTL ? 'تم رفض العرض' : 'Offer rejected');
    } catch (error) {
      console.error('Error rejecting deal:', error);
      toast.error(isRTL ? 'فشل رفض العرض' : 'Failed to reject offer');
    }
  };

  // Handle interested
  const handleInterested = async (deal: PendingDeal) => {
    if (!user) return;
    try {
      // 1. Insert message to sender
      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: deal.sender_id,
          celebrity_id: deal.celebrity_id,
          subject: deal.deal_type ? `Re: ${deal.deal_type}` : null,
          content: isRTL ? 'مهتم بعرضك' : 'Interested in your offer',
          category: 'work',
        })
        .select('id')
        .single();

      if (messageError) throw messageError;

      // 2. Update deal status to accepted and link message
      const { error: dealError } = await supabase
        .from('deal_cards')
        .update({ status: 'accepted', message_id: messageData.id })
        .eq('id', deal.id);

      if (dealError) throw dealError;

      // 3. Remove from pending deals
      setPendingDeals(prev => prev.filter(d => d.id !== deal.id));

      // 4. Show success toast
      toast.success(isRTL ? 'تم قبول العرض وإرسال رد' : 'Offer accepted and reply sent');

      // 5. Navigate to chat with deal pinned
      navigate(`/chat/${deal.sender_id}?dealId=${deal.id}`);
    } catch (error) {
      console.error('Error accepting deal:', error);
      toast.error(isRTL ? 'فشل قبول العرض' : 'Failed to accept offer');
    }
  };

  // Handle message click - navigate to chat page
  const handleMessageClick = useCallback((message: Message) => {
    const otherParticipantId = message.sender_id === user?.id ? message.receiver_id : message.sender_id;
    navigate(`/chat/${otherParticipantId}`);
  }, [navigate, user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Find active celebrity for manager badge
  const activeCelebrity = managedCelebrities.find(c => c.id === managedCelebrityId);

  // Determine allowed categories
  const allowedCategories: MessageCategory[] = role === 'manager'
    ? ['work']
    : hasActiveManager
      ? ['direct', 'audience']
      : ['work', 'direct', 'audience'];

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="fixed top-0 right-0 left-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
        <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {isRTL ? 'كل شيء في مكانه — تلقائيًا' : 'Everything in its place — automatically'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto pt-16 pb-20 px-4">
        {/* Celebrity Switcher for Managers */}
        {role === 'manager' && managedCelebrities.length > 0 && (
          <CelebritySwitcher
            celebrities={managedCelebrities}
            activeCelebId={managedCelebrityId}
            onSwitch={switchCelebrity}
          />
        )}

        {/* Manager Section: Current Celebrity + Switcher Chips */}
        {role === 'manager' && managedCelebrities.length > 0 && (
          <div className="mb-4 space-y-3">
            {/* Current Celebrity Badge */}
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-card border border-border">
              <Avatar className="h-10 w-10 ring-2 ring-amber-500/20 shrink-0">
                <AvatarImage src={activeCelebrity?.avatar_url || undefined} />
                <AvatarFallback className="bg-amber-500/10 text-amber-500 text-sm">
                  {activeCelebrity?.display_name?.[0] || activeCelebrity?.username?.[0] || <Crown className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">
                  {isRTL ? 'تدير حالياً' : 'Currently managing'}
                </p>
                <p className="text-sm font-medium truncate">
                  {activeCelebrity?.display_name || activeCelebrity?.username || '—'}
                  {activeCelebrity?.username && (
                    <span className="text-muted-foreground font-normal ml-1">@{activeCelebrity.username}</span>
                  )}
                </p>
              </div>
              <span className="text-xs font-medium text-primary px-2 py-1 rounded-full bg-primary/10">
                {isRTL ? 'وكيل' : 'Manager'}
              </span>
            </div>

            {/* Horizontal Chip Bar for Switching */}
            <div className="overflow-x-auto scrollbar-hide pb-1">
              <div className="flex items-center gap-1.5 min-w-max">
                {managedCelebrities.map((c) => {
                  const isActive = c.id === managedCelebrityId;
                  const initials = (c.display_name || c.username || '?')[0].toUpperCase();
                  return (
                    <button
                      key={c.id}
                      onClick={() => switchCelebrity(c.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all shrink-0 relative ${
                        isActive
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted/70 hover:border-border/50'
                      }`}
                    >
                      {c.avatar_url ? (
                        <img src={c.avatar_url} alt="" className="h-3.5 w-3.5 rounded-full" />
                      ) : (
                        <span className="h-3.5 w-3.5 rounded-full flex items-center justify-center bg-primary/10 text-primary text-[10px] font-semibold">{initials}</span>
                      )}
                      <span className="truncate max-w-[70px]">{c.display_name || c.username || '—'}</span>
                      {isActive && (
                        <span className="absolute -top-0.5 -end-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px]">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Pending Deals Section for Manager */}
        {role === 'manager' && pendingDeals.length > 0 && (
          <div className="mb-6 space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              {isRTL ? 'عروض العمل' : 'Work Offers'}
              <span className="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                {pendingDeals.length}
              </span>
            </h2>
            {isLoadingDeals ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              pendingDeals.map((deal) => (
                <div
                  key={deal.id}
                  className="border border-border rounded-2xl p-4 bg-card hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base text-foreground truncate">
                        {deal.deal_type || (isRTL ? 'عرض غير محدد' : 'Untitled Offer')}
                      </h3>
                      {deal.company_name && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {deal.company_name}
                        </p>
                      )}
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 shrink-0">
                      {isRTL ? 'قيد الانتظار' : 'Pending'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {deal.budget_range && (
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-xl">
                        <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-full">
                          <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            {isRTL ? 'الميزانية' : 'Budget'}
                          </p>
                          <p className="font-medium text-foreground truncate text-sm">
                            {deal.budget_range}
                          </p>
                        </div>
                      </div>
                    )}
                    {deal.timeline && (
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-xl">
                        <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                          <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            {isRTL ? 'الجدول الزمني' : 'Timeline'}
                          </p>
                          <p className="font-medium text-foreground truncate text-sm">
                            {deal.timeline}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Additional Details Section */}
                  {(deal.website_url || deal.budget_cycle || deal.deliverables || deal.exclusivity || deal.why_them || deal.details) && (
                    <div className="space-y-2 mb-4 pt-3 border-t border-border/50">
                      {deal.website_url && (
                        <div className="flex items-center gap-2 text-sm">
                          <div className="p-1.5 bg-cyan-100 dark:bg-cyan-900/30 rounded-full">
                            <Globe className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              {isRTL ? 'الموقع الإلكتروني' : 'Website'}
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
                              {isRTL ? 'دورة الميزانية' : 'Budget Cycle'}
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
                              {isRTL ? 'الحصرية' : 'Exclusivity'}
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
                              {isRTL ? 'المخرجات' : 'Deliverables'}
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
                              {isRTL ? 'لماذا هم' : 'Why Them'}
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
                              {isRTL ? 'التفاصيل' : 'Details'}
                            </p>
                            <p className="font-medium text-foreground whitespace-pre-wrap">{deal.details}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-10 text-sm rounded-xl touch-feedback border-red-500 text-red-500 hover:bg-red-500/10"
                      onClick={() => handleReject(deal)}
                    >
                      <X className="h-4 w-4 me-1" />
                      {isRTL ? 'غير مناسب' : 'Not a fit'}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-10 text-sm rounded-xl touch-feedback bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => handleInterested(deal)}
                    >
                      <Heart className="h-4 w-4 me-1" />
                      {isRTL ? 'قبول مبدئي' : 'Accept in principle'}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Inbox Section */}
        <div className="mb-6">
          <InboxSection
            messages={messages}
            isLoading={isLoadingMessages}
            onMessageClick={handleMessageClick}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            allowedCategories={allowedCategories}
          />
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
}
