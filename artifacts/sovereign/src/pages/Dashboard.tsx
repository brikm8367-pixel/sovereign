import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BottomNavigation } from '@/components/BottomNavigation';
import { InboxSection } from '@/components/InboxSection';
import { useTheme } from '@/hooks/useTheme';
import { toast } from 'sonner';
import { 
  Loader2, 
  Briefcase, 
  Check, 
  X, 
  MessageCircle, 
  User, 
  Send,
  Sun,
  Moon,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DealCardInline } from '@/components/deals/DealCardInline';
import MessageComposer from '@/components/messaging/MessageComposer';

interface Deal {
  id: string;
  sender_id: string;
  celebrity_id: string;
  company_name: string;
  website_url: string;
  budget_range: string;
  budget_cycle: string;
  deal_type: string;
  details: string;
  deliverables: string | null;
  timeline: string;
  exclusivity: string;
  why_them: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'countered';
  created_at: string;
  updated_at: string;
  message_id: string | null;
  golden_hour: boolean;
  golden_hour_expires_at: string | null;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  category: 'work' | 'audience' | 'direct';
  created_at: string;
  is_read: boolean;
  is_edited: boolean;
  media_url: string | null;
  media_type: string | null;
  voice_url: string | null;
  edited_at: string | null;
  expires_at: string | null;
  is_important: boolean;
}

interface Conversation {
  id: string;
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  last_message: string;
  last_message_time: string;
  unread_count: number;
  deal_id: string | null;
  category: string;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { role, managedCelebrityId, managedCelebrities, switchCelebrity, switching } = useRole();
  const { isRTL } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  
  const [pendingDeals, setPendingDeals] = useState<Deal[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingDeals, setIsLoadingDeals] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [askTalentDeal, setAskTalentDeal] = useState<Deal | null>(null);
  const [askTalentQuestion, setAskTalentQuestion] = useState('');
  const [isSubmittingAsk, setIsSubmittingAsk] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDealDetails, setShowDealDetails] = useState<Record<string, boolean>>({});
  const [showDealQuestion, setShowDealQuestion] = useState<string | null>(null);
  const [selectedDealForQuestion, setSelectedDealForQuestion] = useState<Deal | null>(null);
  const isMountedRef = useRef(true);
  const fetchConversationsRef = useRef<() => Promise<void>>();
  const fetchPendingDealsRef = useRef<() => Promise<void>>();

  // Reset data when managedCelebrityId changes
  useEffect(() => {
    if (role === 'manager' && managedCelebrityId) {
      console.log('[Dashboard] Celebrity changed, resetting data for:', managedCelebrityId);
      setPendingDeals([]);
      setConversations([]);
      setIsLoadingDeals(true);
      setIsLoadingMessages(true);
      fetchPendingDeals();
      fetchConversations();
    }
  }, [managedCelebrityId, role]);

  const fetchPendingDeals = useCallback(async () => {
    if (!user) return;
    
    if (role === 'manager' && !managedCelebrityId) {
      if (isMountedRef.current) {
        setPendingDeals([]);
        setIsLoadingDeals(false);
      }
      return;
    }

    try {
      console.log('[Dashboard] Fetching pending deals for:', role === 'manager' ? managedCelebrityId : user.id);
      const query = supabase
        .from('deal_cards')
        .select('*')
        .eq('status', 'pending');

      if (role === 'manager' && managedCelebrityId) {
        query.eq('celebrity_id', managedCelebrityId);
      } else if (role === 'sender') {
        query.eq('sender_id', user.id);
      } else {
        query.eq('celebrity_id', user.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      
      if (isMountedRef.current) {
        setPendingDeals(data as Deal[] || []);
        setIsLoadingDeals(false);
        console.log('[Dashboard] Fetched pending deals:', data?.length || 0);
      }
    } catch (error) {
      console.error('Error fetching pending deals:', error);
      if (isMountedRef.current) {
        setIsLoadingDeals(false);
      }
    }
  }, [user, role, managedCelebrityId]);

  const fetchConversations = useCallback(async () => {
    if (!user) return;

    if (role === 'manager' && !managedCelebrityId) {
      if (isMountedRef.current) {
        setConversations([]);
        setIsLoadingMessages(false);
      }
      return;
    }

    try {
      // Determine the current user ID for messaging (celebrity ID for managers, own user ID for others)
      const currentUserId = role === 'manager' && managedCelebrityId ? managedCelebrityId : user.id;

      console.log('[Dashboard] Fetching conversations for:', currentUserId, 'role:', role);

      let query = supabase
        .from('messages')
        .select('*')
        .eq('category', 'work')
        .order('created_at', { ascending: false })
        .limit(50); // Limit to 50 most recent messages per conversation

      if (role === 'manager' && managedCelebrityId) {
        // For managers, fetch messages where the manager is involved (user.id) OR the managed celebrity is involved
        query = query.or(
          `receiver_id.eq.${user.id},sender_id.eq.${user.id},receiver_id.eq.${managedCelebrityId},sender_id.eq.${managedCelebrityId}`
        );
      } else {
        // For celebrities and senders, fetch messages where they are sender or receiver
        query = query.or(`receiver_id.eq.${user.id},sender_id.eq.${user.id}`);
      }

      const { data, error } = await query;

      if (error) throw error;

      const conversationsMap = new Map<string, Conversation>();
      
      for (const msg of (data as any[]) || []) {
        const otherUserId = msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id;
        if (!otherUserId) continue;

        const convId = msg.deal_id || otherUserId;
        
        if (!conversationsMap.has(convId)) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .eq('id', otherUserId)
            .single();

          conversationsMap.set(convId, {
            id: convId,
            user_id: otherUserId,
            display_name: profile?.display_name || profile?.username || 'مستخدم',
            username: profile?.username || '',
            avatar_url: profile?.avatar_url || null,
            last_message: msg.content || '',
            last_message_time: msg.created_at,
            unread_count: msg.is_read ? 0 : 1,
            deal_id: msg.deal_id || null,
            category: msg.category || 'work'
          });
        } else {
          const existing = conversationsMap.get(convId)!;
          if (new Date(msg.created_at) > new Date(existing.last_message_time)) {
            existing.last_message = msg.content || '';
            existing.last_message_time = msg.created_at;
          }
          if (!msg.is_read && msg.receiver_id === currentUserId) {
            existing.unread_count += 1;
          }
        }
      }

      const conversationsList = Array.from(conversationsMap.values())
        .sort((a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime());

      if (isMountedRef.current) {
        setConversations(conversationsList);
        setIsLoadingMessages(false);
        console.log('[Dashboard] Fetched conversations:', conversationsList.length);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
      if (isMountedRef.current) {
        setIsLoadingMessages(false);
      }
    }
  }, [user, role, managedCelebrityId]);

  // Store refs for use in effects
  useEffect(() => {
    fetchConversationsRef.current = fetchConversations;
  }, [fetchConversations]);

  useEffect(() => {
    fetchPendingDealsRef.current = fetchPendingDeals;
  }, [fetchPendingDeals]);

  const handleInterested = async (dealId: string) => {
    if (!user) return;
    setIsProcessing(true);

    try {
      console.log('[Dashboard] Accepting deal:', dealId);
      const { data: deal, error: dealError } = await supabase
        .from('deal_cards')
        .select('*')
        .eq('id', dealId)
        .single();

      if (dealError) throw dealError;

      const celebrityId = managedCelebrityId || deal.celebrity_id;
      if (!celebrityId) throw new Error('No celebrity selected');

      // @ts-ignore
      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          sender_id: celebrityId,
          receiver_id: deal.sender_id,
          deal_id: dealId,
          content: 'تم قبول العرض',
          category: 'work'
        });

      if (msgError) throw msgError;

      const { error: updateError } = await supabase
        .from('deal_cards')
        .update({
          status: 'accepted',
          updated_at: new Date().toISOString()
        })
        .eq('id', dealId);

      if (updateError) throw updateError;

      toast.success('تم قبول العرض بنجاح');
      console.log('[Dashboard] Deal accepted successfully');
      await fetchPendingDeals();
      
    } catch (error: any) {
      console.error('Error accepting deal:', error);
      toast.error('فشل قبول العرض: ' + (error.message || ''));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (dealId: string) => {
    if (!user) return;
    setIsProcessing(true);

    try {
      console.log('[Dashboard] Rejecting deal:', dealId);
      const { data: deal, error: dealError } = await supabase
        .from('deal_cards')
        .select('*')
        .eq('id', dealId)
        .single();

      if (dealError) throw dealError;

      const celebrityId = managedCelebrityId || deal.celebrity_id;
      if (!celebrityId) throw new Error('No celebrity selected');

      const { error: updateError } = await supabase
        .from('deal_cards')
        .update({
          status: 'declined',
          updated_at: new Date().toISOString()
        })
        .eq('id', dealId);

      if (updateError) throw updateError;

      // @ts-ignore
      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          sender_id: celebrityId,
          receiver_id: deal.sender_id,
          deal_id: dealId,
          content: 'تم رفض العرض',
          category: 'work'
        });

      if (msgError) throw msgError;

      toast.success('تم رفض العرض بنجاح');
      console.log('[Dashboard] Deal rejected successfully');
      await fetchPendingDeals();
      
    } catch (error: any) {
      console.error('Error rejecting deal:', error);
      toast.error('فشل رفض العرض: ' + (error.message || ''));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAskTalentSubmit = async () => {
    if (!user || !askTalentDeal) return;
    
    const question = askTalentQuestion.trim();
    if (!question) {
      toast.error('الرجاء كتابة سؤال');
      return;
    }

    setIsSubmittingAsk(true);

    try {
      const celebrityId = managedCelebrityId || askTalentDeal.celebrity_id;
      if (!celebrityId) throw new Error('No celebrity selected');

      console.log('[Dashboard] Sending Ask Talent question for deal:', askTalentDeal.id);

      // @ts-ignore
      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          sender_id: celebrityId,
          receiver_id: askTalentDeal.sender_id,
          deal_id: askTalentDeal.id,
          content: question,
          category: 'work'
        });

      if (msgError) throw msgError;

      toast.success('تم إرسال السؤال بنجاح');
      console.log('[Dashboard] Ask Talent question sent successfully');
      setAskTalentDeal(null);
      setAskTalentQuestion('');
      await fetchConversations();
      
    } catch (error: any) {
      console.error('Error sending question:', error);
      toast.error('فشل إرسال السؤال: ' + (error.message || ''));
    } finally {
      setIsSubmittingAsk(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    if (authLoading || !user) return;

    fetchPendingDeals();
    fetchConversations();

    const subscription = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'deal_cards' },
        (payload) => {
          console.log('[Dashboard] Realtime: New deal inserted', payload);
          fetchPendingDeals();
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'deal_cards', filter: `status=eq.pending` },
        (payload) => {
          console.log('[Dashboard] Realtime: Deal updated', payload);
          fetchPendingDeals();
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          console.log('[Dashboard] Realtime: New message inserted', payload);
          fetchConversations();
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          console.log('[Dashboard] Realtime: Message updated', payload);
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [user, authLoading, managedCelebrityId, role, fetchPendingDeals, fetchConversations]);

  // Refresh when navigating back to dashboard
  useEffect(() => {
    const handleFocus = () => {
      if (isMountedRef.current && user) {
        console.log('[Dashboard] Window focus, refreshing data');
        fetchPendingDeals();
        fetchConversations();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, fetchPendingDeals, fetchConversations]);

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Memoize conversations to prevent unnecessary re-renders
  const memoizedConversations = useMemo(() => conversations, [conversations]);

  const t = (ar: string, en: string) => (isRTL ? ar : en);

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="fixed top-0 right-0 left-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
        <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
          <h1 className="font-bold text-lg">
            {role === 'manager' ? 'لوحة الوكيل' : 'الرئيسية'}
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-10 w-10 rounded-xl touch-feedback"
            >
              {theme === 'dark' ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/profile')}
              className="h-10 w-10 rounded-xl touch-feedback"
            >
              <User className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto pt-16 pb-20 px-4">
        {role === 'manager' && managedCelebrities.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
              {managedCelebrities.map((celeb) => (
                <button
                  key={celeb.id}
                  onClick={() => !switching && switchCelebrity(celeb.id)}
                  disabled={switching}
                  className={cn(
                    'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all shrink-0 touch-feedback',
                    celeb.id === managedCelebrityId
                      ? 'bg-primary/10 border border-primary/20'
                      : 'bg-card border border-border/50',
                    switching && 'opacity-50'
                  )}
                >
                  <Avatar className="h-10 w-10 ring-2 ring-primary/10">
                    <AvatarImage src={celeb.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {(celeb.display_name || celeb.username || '?')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-[10px] font-medium truncate max-w-[60px]">
                    {celeb.display_name || celeb.username}
                  </span>
                  {switching && celeb.id === managedCelebrityId && (
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {role === 'manager' && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                العروض المعلقة
                {pendingDeals.length > 0 && (
                  <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
                    {pendingDeals.length}
                  </span>
                )}
              </h2>
            </div>

            {isLoadingDeals ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : pendingDeals.length === 0 ? (
              <div className="text-center py-8 bg-card rounded-xl border border-border">
                <p className="text-sm text-muted-foreground">
                  {managedCelebrityId ? 'لا توجد عروض معلقة' : 'اختر موهبة لعرض عروضها'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingDeals.map((deal) => (
                  <div key={deal.id} className="bg-card rounded-xl border border-border p-4">
                    <DealCardInline 
                      dealId={deal.id} 
                      isRTL={isRTL} 
                      onToggleDetails={() => setShowDealDetails(prev => ({ ...prev, [deal.id]: !prev[deal.id] }))}
                      showDetails={showDealDetails[deal.id] || false}
                    />
                    
                    {managedCelebrityId && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                        <Button
                          onClick={() => handleInterested(deal.id)}
                          disabled={isProcessing}
                          className="flex-1 h-9 rounded-xl bg-green-600 hover:bg-green-700 text-xs font-semibold touch-feedback"
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          قبول
                        </Button>
                        <Button
                          onClick={() => handleReject(deal.id)}
                          disabled={isProcessing}
                          variant="outline"
                          className="flex-1 h-9 rounded-xl border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold touch-feedback"
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          رفض
                        </Button>
                        <Button
                          onClick={() => {
                            setSelectedDealForQuestion(deal);
                            setShowDealQuestion(deal.id);
                          }}
                          disabled={isProcessing}
                          variant="outline"
                          className="flex-1 h-9 rounded-xl border-blue-300 text-blue-600 hover:bg-blue-50 text-xs font-semibold touch-feedback"
                        >
                          <MessageSquare className="h-3.5 w-3.5 mr-1" />
                          {t('سؤال الموهبة', 'Ask Talent')}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              المحادثات
            </h2>
          </div>

          <InboxSection
            conversations={memoizedConversations}
            isLoading={isLoadingMessages}
            onConversationClick={(conv) => {
              if (conv.deal_id) {
                navigate(`/chat/${conv.user_id}?dealId=${conv.deal_id}`);
              } else {
                navigate(`/chat/${conv.user_id}`);
              }
            }}
          />
        </div>
      </main>

      {askTalentDeal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="bg-card rounded-t-2xl max-w-lg w-full max-h-[80vh] p-4 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">
                سؤال للموهبة: {askTalentDeal.company_name}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setAskTalentDeal(null);
                  setAskTalentQuestion('');
                }}
                className="h-8 w-8 rounded-full touch-feedback"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-xl text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">تفاصيل العرض:</p>
                <p>{askTalentDeal.company_name} · {askTalentDeal.deal_type}</p>
                <p className="text-[11px] mt-0.5">{askTalentDeal.budget_range}</p>
              </div>

              <Textarea
                value={askTalentQuestion}
                onChange={(e) => setAskTalentQuestion(e.target.value)}
                placeholder="اكتب سؤالك للموهبة..."
                className="min-h-[100px] rounded-xl resize-none"
                disabled={isSubmittingAsk}
              />

              <Button
                onClick={handleAskTalentSubmit}
                disabled={isSubmittingAsk || !askTalentQuestion.trim()}
                className="w-full h-12 rounded-xl touch-feedback"
              >
                {isSubmittingAsk ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    إرسال السؤال
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MessageComposer for Ask Talent Question */}
      {showDealQuestion && selectedDealForQuestion && (
        <MessageComposer
          isOpen={true}
          onClose={() => {
            setShowDealQuestion(null);
            setSelectedDealForQuestion(null);
          }}
          recipient={{
            id: selectedDealForQuestion.celebrity_id,
            username: null,
            display_name: selectedDealForQuestion.company_name,
            avatar_url: null,
          }}
          dealId={selectedDealForQuestion.id}
          dealTitle={selectedDealForQuestion.company_name}
          onMessageSent={() => {
            setShowDealQuestion(null);
            setSelectedDealForQuestion(null);
            fetchConversations();
          }}
        />
      )}

      <BottomNavigation />
    </div>
  );
}
