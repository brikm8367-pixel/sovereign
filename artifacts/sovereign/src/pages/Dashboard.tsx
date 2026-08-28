import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, User, Check, Crown, Briefcase, DollarSign, Calendar, Building2, X, Heart, RotateCcw, FileText, Shield, UserCheck, Globe, MessageSquare, Send } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { BottomNavigation } from '@/components/BottomNavigation';
import InboxSection, { ConversationSummary } from '@/components/messaging/InboxSection';
import { CelebritySwitcher } from '@/components/manager/CelebritySwitcher';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

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

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  sender_profile?: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
  subject: string | null;
  content: string;
  is_important: boolean;
  is_read: boolean;
  created_at: string;
  category: string;
  parent_id: string | null;
  voice_url?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  deal_id?: string | null;
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const { role, accountType, managedCelebrityId, managedCelebrities, switchCelebrity, refresh: refreshRole } = useRole();
  const { isRTL, language } = useLanguage();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'work'>('work');
  const [pendingDeals, setPendingDeals] = useState<PendingDeal[]>([]);
  const [isLoadingDeals, setIsLoadingDeals] = useState(false);
  
  // Ask Talent dialog state
  const [askTalentOpen, setAskTalentOpen] = useState(false);
  const [askTalentDeal, setAskTalentDeal] = useState<PendingDeal | null>(null);
  const [askTalentQuestion, setAskTalentQuestion] = useState('');
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);

  // Refs for preventing unnecessary refreshes
  const isMountedRef = useRef(true);
  const lastFetchRef = useRef<number>(0);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  useEffect(() => { 
    if (!loading && !user) navigate('/'); 
  }, [user, loading, navigate]);

  // Group messages into conversation summaries by deal_id first, then by parent_id
  const buildConversations = useCallback((msgs: Message[]) => {
    if (!user) return [];
    
    // Map to group conversations: key is deal_id or parent_id (or message id if no parent)
    const conversationMap = new Map<string, {
      groupKey: string;
      messages: Message[];
      otherParticipantId: string;
      otherParticipantProfile: Message['sender_profile'];
      hasDealId: boolean;
    }>();

    msgs.forEach(msg => {
      // Determine conversation group key: deal_id takes precedence, then parent_id, then message id
      const groupKey = msg.deal_id || msg.parent_id || msg.id;
      const hasDealId = !!msg.deal_id;
      
      // Determine other participant
      const otherParticipantId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      const otherProfile = msg.sender_id === user.id ? null : msg.sender_profile;

      if (!conversationMap.has(groupKey)) {
        conversationMap.set(groupKey, {
          groupKey,
          messages: [],
          otherParticipantId,
          otherParticipantProfile: otherProfile,
          hasDealId,
        });
      }
      
      const conv = conversationMap.get(groupKey)!;
      conv.messages.push(msg);
      
      // Update other participant profile if we have it from a message they sent
      if (msg.sender_id === otherParticipantId && msg.sender_profile) {
        conv.otherParticipantProfile = msg.sender_profile;
      }
    });

    // Build conversation summaries
    const summaries: ConversationSummary[] = Array.from(conversationMap.values()).map(conv => {
      // Sort messages by created_at descending to get latest
      const sortedMessages = [...conv.messages].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      const latestMessage = sortedMessages[0];
      const unreadCount = conv.messages.filter(m => 
        m.receiver_id === user.id && !m.is_read
      ).length;

      return {
        rootId: conv.groupKey,
        otherParticipantId: conv.otherParticipantId,
        otherParticipantProfile: conv.otherParticipantProfile || {
          id: conv.otherParticipantId,
          display_name: null,
          username: null,
          avatar_url: null,
        },
        latestMessageContent: latestMessage?.content || '',
        latestMessageTime: latestMessage?.created_at || new Date().toISOString(),
        unreadCount,
        hasUnread: unreadCount > 0,
      };
    });

    // Sort conversations by latest message time descending
    return summaries.sort((a, b) => 
      new Date(b.latestMessageTime).getTime() - new Date(a.latestMessageTime).getTime()
    );
  }, [user]);

  // Fetch pending deals for manager
  const fetchPendingDeals = useCallback(async () => {
    if (role !== 'manager' || !managedCelebrityId || !user) {
      setPendingDeals([]);
      return;
    }

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

      if (isMountedRef.current) {
        setPendingDeals((data as unknown as PendingDeal[]) || []);
      }
    } catch (error) {
      console.error('Error fetching pending deals:', error);
      toast.error(isRTL ? 'فشل تحميل العروض' : 'Failed to load offers');
      if (isMountedRef.current) {
        setPendingDeals([]);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingDeals(false);
      }
    }
  }, [role, managedCelebrityId, user, isRTL]);

  useEffect(() => {
    fetchPendingDeals();
  }, [fetchPendingDeals]);

  // Fetch messages - only 'work' category for all roles
  const fetchMessages = useCallback(async () => {
    if (!user || !isMountedRef.current) return;
    
    // Debounce: prevent fetching more than once per 2 seconds
    const now = Date.now();
    if (now - lastFetchRef.current < 2000) {
      return;
    }
    lastFetchRef.current = now;

    let cancelled = false;
    const doFetch = async () => {
      setIsLoadingMessages(true);

      let query: any;
      if (role === 'manager' && managedCelebrityId) {
        // Manager: only fetch messages for the managed celebrity with category='work'
        query = (supabase as any)
          .from('messages')
          .select('*')
          .eq('celebrity_id', managedCelebrityId)
          .eq('category', 'work')
          .order('created_at', { ascending: false });
      } else if (role === 'manager') {
        // Fallback for manager without selected celebrity - only 'work' category, no user filter
        query = supabase
          .from('messages')
          .select('*')
          .eq('category', 'work')
          .order('created_at', { ascending: false });
      } else {
        // Non-manager users: only 'work' category messages sent/received
        query = supabase
          .from('messages')
          .select('*')
          .or(`receiver_id.eq.${user.id},sender_id.eq.${user.id}`)
          .eq('category', 'work')
          .order('created_at', { ascending: false });
      }

      const { data: messagesData, error: messagesError } = await query;

      if (messagesError) {
        console.error('Error fetching messages:', messagesError);
        if (!cancelled && isMountedRef.current) {
          setIsLoadingMessages(false);
        }
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

      if (!cancelled && isMountedRef.current) {
        setMessages(messagesWithProfiles);
        setConversations(buildConversations(messagesWithProfiles));
        setIsLoadingMessages(false);
      }
    };

    doFetch();
    return () => { cancelled = true; };
  }, [user, role, managedCelebrityId, buildConversations]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime subscriptions for pending deals and messages
  useEffect(() => {
    if (!user) return;

    // Cleanup existing channels
    channelsRef.current.forEach(channel => {
      void supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    // Subscribe to pending deals changes for manager
    if (role === 'manager' && managedCelebrityId) {
      const dealsChannel = supabase
        .channel(`deals-${managedCelebrityId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'deal_cards',
            filter: `celebrity_id=eq.${managedCelebrityId},status=eq.pending`,
          },
          () => {
            fetchPendingDeals();
          }
        )
        .subscribe();
      channelsRef.current.push(dealsChannel);
    }

    // Subscribe to messages changes - only 'work' category
    let messagesFilter = '';
    if (role === 'manager' && managedCelebrityId) {
      messagesFilter = `celebrity_id=eq.${managedCelebrityId},category=eq.work`;
    } else {
      messagesFilter = `or(receiver_id.eq.${user.id},sender_id.eq.${user.id}),category=eq.work`;
    }

    const messagesChannel = supabase
      .channel(`messages-${user.id}-${managedCelebrityId || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: messagesFilter,
        },
        (payload) => {
          // Only refetch on INSERT, UPDATE, DELETE (not on TRUNCATE etc.)
          if (['INSERT', 'UPDATE', 'DELETE'].includes(payload.eventType)) {
            fetchMessages();
          }
        }
      )
      .subscribe();
    channelsRef.current.push(messagesChannel);

    // Cleanup
    return () => {
      channelsRef.current.forEach(channel => {
        void supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [user, role, managedCelebrityId, fetchPendingDeals, fetchMessages]);

  // Window focus listener to refresh data
  useEffect(() => {
    const handleFocus = () => {
      if (user) {
        // Trigger a re-fetch by updating a ref timestamp
        lastFetchRef.current = 0;
        fetchMessages();
        if (role === 'manager' && managedCelebrityId) {
          fetchPendingDeals();
        }
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, role, managedCelebrityId, fetchMessages, fetchPendingDeals]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  // Handle interested (accept in principle)
  const handleInterested = async (deal: PendingDeal) => {
    if (!user) return;
    try {
      // Query for existing root message between user and deal.sender_id with this deal_id
      const query = supabase
        .from('messages')
        .select('id')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${deal.sender_id}),and(sender_id.eq.${deal.sender_id},receiver_id.eq.${user.id})`);
      const { data: rootMessage } = await (query as any)
        .eq('deal_id', deal.id)
        .eq('category', 'work')
        .is('parent_id', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const parentId = rootMessage?.id || null;

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
          deal_id: deal.id,
          parent_id: parentId,
        } as any)
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

  // Handle Ask Talent - open dialog
  const handleAskTalent = (deal: PendingDeal) => {
    setAskTalentDeal(deal);
    setAskTalentQuestion('');
    setAskTalentOpen(true);
  };

  // Handle Ask Talent submit
  const handleAskTalentSubmit = async () => {
    if (!user || !askTalentDeal || !askTalentQuestion.trim()) return;
    
    setIsSubmittingQuestion(true);
    try {
      // Insert message to the celebrity (talent) asking the question
      const { error } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: askTalentDeal.celebrity_id,
          celebrity_id: askTalentDeal.celebrity_id,
          subject: askTalentDeal.deal_type ? `Re: ${askTalentDeal.deal_type}` : null,
          content: askTalentQuestion.trim(),
          category: 'work',
          deal_id: askTalentDeal.id,
        } as any);

      if (error) throw error;

      // Close dialog and reset
      setAskTalentOpen(false);
      setAskTalentDeal(null);
      setAskTalentQuestion('');
      
      toast.success(isRTL ? 'تم إرسال السؤال للموهبة' : 'Question sent to talent');
      
      // Refresh messages to show the new message
      fetchMessages();
    } catch (error) {
      console.error('Error sending question:', error);
      toast.error(isRTL ? 'فشل إرسال السؤال' : 'Failed to send question');
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  // Handle conversation click - navigate to chat page
  const handleConversationClick = useCallback((conversation: ConversationSummary) => {
    navigate(`/chat/${conversation.otherParticipantId}`);
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Find active celebrity for manager badge
  const activeCelebrity = managedCelebrities.find(c => c.id === managedCelebrityId);

  const t = useCallback((ar: string, en: string) => (isRTL ? ar : en), [isRTL]);

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header - Light, centered, small */}
      <header className="fixed top-0 right-0 left-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/30 safe-area-inset-top">
        <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground tracking-wide">
              {isRTL ? 'كل شيء في مكانه — تلقائيًا' : 'Everything in its place — automatically'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto pt-16 pb-28 px-4 space-y-10">
        {/* Celebrity Switcher for Managers - Soft horizontal scroll of circular avatars */}
        {role === 'manager' && managedCelebrities.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-foreground">
                {t('تدير حالياً', 'Currently managing')}
              </h2>
              <span className="text-xs font-medium text-primary px-2 py-0.5 rounded-full bg-primary/10">
                {t('وكيل', 'Manager')}
              </span>
            </div>
            <div className="overflow-x-auto scrollbar-hide pb-3">
              <div className="flex items-center gap-2.5 min-w-max">
                {managedCelebrities.map((c) => {
                  const isActive = c.id === managedCelebrityId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => switchCelebrity(c.id)}
                      className={cn(
                        'flex flex-col items-center gap-2 px-3 py-2.5 rounded-2xl transition-all shrink-0 relative',
                        isActive
                          ? 'bg-primary/5 ring-2 ring-primary/20'
                          : 'bg-muted/30 hover:bg-muted/50'
                      )}
                    >
                      <Avatar className={cn('h-14 w-14 ring-2 transition-all', isActive ? 'ring-primary' : 'ring-transparent')}>
                        <AvatarImage src={c.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-lg">
                          {(c.display_name || c.username || '?')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className={cn('text-xs font-medium truncate max-w-[70px]', isActive ? 'text-primary' : 'text-muted-foreground')}>
                        {c.display_name || c.username || '—'}
                      </span>
                      {isActive && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Pending Deals Section for Manager */}
        {role === 'manager' && pendingDeals.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                {t('عروض العمل', 'Work Offers')}
              </h2>
              <span className="px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                {pendingDeals.length}
              </span>
            </div>
            {isLoadingDeals ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {pendingDeals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-2xl bg-card border border-border/40 shadow-sm p-5 transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base text-foreground truncate">
                          {deal.deal_type || t('عرض غير محدد', 'Untitled Offer')}
                        </h3>
                        {deal.company_name && (
                          <p className="text-sm text-muted-foreground truncate mt-1 flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" />
                            {deal.company_name}
                          </p>
                        )}
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 shrink-0">
                        {t('قيد الانتظار', 'Pending')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {deal.budget_range && (
                        <div className="flex items-center gap-2.5 p-3 bg-muted/50 rounded-xl">
                          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                            <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              {t('الميزانية', 'Budget')}
                            </p>
                            <p className="font-medium text-foreground truncate text-sm">
                              {deal.budget_range}
                            </p>
                          </div>
                        </div>
                      )}
                      {deal.timeline && (
                        <div className="flex items-center gap-2.5 p-3 bg-muted/50 rounded-xl">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                            <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              {t('الجدول الزمني', 'Timeline')}
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
                      <div className="space-y-2.5 mb-4 pt-3 border-t border-border/40">
                        {deal.website_url && (
                          <div className="flex items-center gap-2.5 text-sm">
                            <div className="p-1.5 bg-cyan-100 dark:bg-cyan-900/30 rounded-full">
                              <Globe className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                {t('الموقع الإلكتروني', 'Website')}
                              </p>
                              <a href={deal.website_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary truncate hover:underline">
                                {deal.website_url}
                              </a>
                            </div>
                          </div>
                        )}
                        {deal.budget_cycle && (
                          <div className="flex items-center gap-2.5 text-sm">
                            <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                              <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                {t('دورة الميزانية', 'Budget Cycle')}
                              </p>
                              <p className="font-medium text-foreground truncate">{deal.budget_cycle}</p>
                            </div>
                          </div>
                        )}
                        {deal.exclusivity && (
                          <div className="flex items-center gap-2.5 text-sm">
                            <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                              <Shield className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                {t('الحصرية', 'Exclusivity')}
                              </p>
                              <p className="font-medium text-foreground truncate">{deal.exclusivity}</p>
                            </div>
                          </div>
                        )}
                        {deal.deliverables && (
                          <div className="flex items-center gap-2.5 text-sm">
                            <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-full">
                              <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                {t('المخرجات', 'Deliverables')}
                              </p>
                              <p className="font-medium text-foreground truncate">{deal.deliverables}</p>
                            </div>
                          </div>
                        )}
                        {deal.why_them && (
                          <div className="flex items-center gap-2.5 text-sm">
                            <div className="p-1.5 bg-teal-100 dark:bg-teal-900/30 rounded-full">
                              <UserCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                {t('لماذا هم', 'Why Them')}
                              </p>
                              <p className="font-medium text-foreground truncate">{deal.why_them}</p>
                            </div>
                          </div>
                        )}
                        {deal.details && (
                          <div className="flex items-start gap-2.5 text-sm">
                            <div className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mt-0.5">
                              <FileText className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                {t('التفاصيل', 'Details')}
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
                        className="flex-1 h-10 text-sm rounded-xl touch-feedback border-red-500 text-red-500 hover:bg-red-50/10"
                        onClick={() => handleReject(deal)}
                      >
                        <X className="h-4 w-4 me-1" />
                        {t('غير مناسب', 'Decline')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-10 text-sm rounded-xl touch-feedback border-primary text-primary hover:bg-primary/10"
                        onClick={() => handleAskTalent(deal)}
                      >
                        <MessageSquare className="h-4 w-4 me-1" />
                        {t('اسأل الموهبة', 'Ask Talent')}
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 h-10 text-sm rounded-xl touch-feedback bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => handleInterested(deal)}
                      >
                        <Heart className="h-4 w-4 me-1" />
                        {t('قبول مبدئي', 'Accept')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Inbox Section - Clean conversation rows */}
        <section className="space-y-5">
          <InboxSection
            conversations={conversations}
            isLoading={isLoadingMessages}
            onConversationClick={handleConversationClick}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />
        </section>
      </main>

      {/* Ask Talent Dialog */}
      {askTalentOpen && askTalentDeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setAskTalentOpen(false); setAskTalentDeal(null); setAskTalentQuestion(''); }}>
          <div className="w-full max-w-md bg-card rounded-2xl border border-border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{t('اسأل الموهبة', 'Ask Talent')}</h3>
              <Button variant="ghost" size="icon" onClick={() => { setAskTalentOpen(false); setAskTalentDeal(null); setAskTalentQuestion(''); }} className="h-8 w-8 rounded-xl">
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="mb-4 p-3 bg-muted/50 rounded-xl">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t('العرض', 'Deal')}</p>
              <p className="font-medium text-foreground truncate">{askTalentDeal.deal_type || t('عرض غير محدد', 'Untitled Offer')}</p>
              {askTalentDeal.company_name && (
                <p className="text-sm text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {askTalentDeal.company_name}
                </p>
              )}
            </div>

            <Textarea
              placeholder={t('اكتب سؤالك للموهبة حول هذا العرض...', 'Type your question for the talent about this offer...')}
              value={askTalentQuestion}
              onChange={(e) => setAskTalentQuestion(e.target.value)}
              rows={4}
              className="mb-4 resize-none"
              maxLength={1000}
            />

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-xl"
                onClick={() => { setAskTalentOpen(false); setAskTalentDeal(null); setAskTalentQuestion(''); }}
              >
                {t('إلغاء', 'Cancel')}
              </Button>
              <Button
                className="flex-1 h-11 rounded-xl"
                onClick={handleAskTalentSubmit}
                disabled={isSubmittingQuestion || !askTalentQuestion.trim()}
              >
                {isSubmittingQuestion ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 me-2" />
                    {t('إرسال', 'Send')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <BottomNavigation />
    </div>
  );
}
