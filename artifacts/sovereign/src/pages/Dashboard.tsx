import { useState, useEffect, useRef, useCallback } from 'react';
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
import { toast } from 'sonner';
import { 
  Loader2, 
  Briefcase, 
  Check, 
  X, 
  MessageCircle, 
  Users, 
  User, 
  ChevronDown,
  ChevronUp,
  Send,
  ArrowRight,
  ArrowLeft,
  Search,
  Filter,
  Clock,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  created_at: string;
  updated_at: string;
  message_id: string | null;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  category: string;
  deal_id: string | null;
  created_at: string;
  is_read: boolean;
  is_edited: boolean;
  media_url: string | null;
  media_type: string | null;
  voice_url: string | null;
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
  const { role, managedCelebrityId, managedCelebrities, switchCelebrity } = useRole();
  const { isRTL } = useLanguage();
  const navigate = useNavigate();
  
  const [pendingDeals, setPendingDeals] = useState<Deal[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingDeals, setIsLoadingDeals] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'work' | 'private' | 'public'>('work');
  const [askTalentDeal, setAskTalentDeal] = useState<Deal | null>(null);
  const [askTalentQuestion, setAskTalentQuestion] = useState('');
  const [isSubmittingAsk, setIsSubmittingAsk] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const isMountedRef = useRef(true);

  // Fetch pending deals (for managers)
  const fetchPendingDeals = useCallback(async () => {
    if (!user) return;
    
    // For managers: only fetch if managedCelebrityId exists
    if (role === 'manager' && !managedCelebrityId) {
      if (isMountedRef.current) {
        setPendingDeals([]);
        setIsLoadingDeals(false);
      }
      return;
    }

    try {
      const query = supabase
        .from('deal_cards')
        .select('*')
        .eq('status', 'pending');

      // If manager, filter by celebrity_id = managedCelebrityId
      if (role === 'manager' && managedCelebrityId) {
        query.eq('celebrity_id', managedCelebrityId);
      } else if (role === 'sender') {
        query.eq('sender_id', user.id);
      } else {
        // For celebrities, show deals where they are the celebrity
        query.eq('celebrity_id', user.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      
      if (isMountedRef.current) {
        setPendingDeals(data || []);
        setIsLoadingDeals(false);
      }
    } catch (error) {
      console.error('Error fetching pending deals:', error);
      if (isMountedRef.current) {
        setIsLoadingDeals(false);
      }
    }
  }, [user, role, managedCelebrityId]);

  // Fetch conversations (FIXED: includes messages sent by manager)
  const fetchConversations = useCallback(async () => {
    if (!user) return;

    // For managers: only fetch if managedCelebrityId exists
    if (role === 'manager' && !managedCelebrityId) {
      if (isMountedRef.current) {
        setConversations([]);
        setIsLoadingMessages(false);
      }
      return;
    }

    try {
      let query = supabase
        .from('messages')
        .select('*')
        .eq('category', activeCategory)
        .order('created_at', { ascending: false });

      // ✅ FIX: Use or() to get messages where user is either sender or receiver
      if (role === 'manager' && managedCelebrityId) {
        // For managers: get messages involving the managed celebrity or sent/received by the manager
        query = query.or(`receiver_id.eq.${user.id},sender_id.eq.${user.id},receiver_id.eq.${managedCelebrityId}`);
      } else {
        // For regular users: get messages sent to or from the user
        query = query.or(`receiver_id.eq.${user.id},sender_id.eq.${user.id}`);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Group messages by conversation (user or deal)
      const conversationsMap = new Map<string, Conversation>();
      
      for (const msg of data || []) {
        const otherUserId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        
        // Skip if no other user
        if (!otherUserId) continue;

        const convId = msg.deal_id || otherUserId;
        
        if (!conversationsMap.has(convId)) {
          // Fetch user profile for display
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .eq('id', otherUserId)
            .single();

          conversationsMap.set(convId, {
            id: convId,
            user_id: otherUserId,
            display_name: profile?.display_name || profile?.username || 'User',
            username: profile?.username || '',
            avatar_url: profile?.avatar_url || null,
            last_message: msg.content || '',
            last_message_time: msg.created_at,
            unread_count: msg.is_read ? 0 : 1,
            deal_id: msg.deal_id || null,
            category: msg.category || 'work'
          });
        } else {
          // Update last message if newer
          const existing = conversationsMap.get(convId)!;
          if (new Date(msg.created_at) > new Date(existing.last_message_time)) {
            existing.last_message = msg.content || '';
            existing.last_message_time = msg.created_at;
          }
          if (!msg.is_read && msg.receiver_id === user.id) {
            existing.unread_count += 1;
          }
        }
      }

      const conversationsList = Array.from(conversationsMap.values())
        .sort((a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime());

      if (isMountedRef.current) {
        setConversations(conversationsList);
        setIsLoadingMessages(false);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
      if (isMountedRef.current) {
        setIsLoadingMessages(false);
      }
    }
  }, [user, role, managedCelebrityId, activeCategory]);

  // Handle Interested (Accept deal)
  const handleInterested = async (dealId: string) => {
    if (!user) return;
    setIsProcessing(true);

    try {
      // Fetch deal details
      const { data: deal, error: dealError } = await supabase
        .from('deal_cards')
        .select('*')
        .eq('id', dealId)
        .single();

      if (dealError) throw dealError;

      const celebrityId = managedCelebrityId || deal.celebrity_id;
      if (!celebrityId) throw new Error('No celebrity selected');

      console.log('[handleInterested] Starting with:', { dealId, celebrityId });

      // 1. Insert message (as celebrity, not manager)
      const { data: msgData, error: msgError } = await supabase
        .from('messages')
        .insert({
          sender_id: celebrityId, // Changed from user.id to celebrityId
          receiver_id: deal.sender_id,
          deal_id: dealId,
          content: 'تم قبول العرض',
          category: 'work'
        })
        .select('id')
        .single();

      if (msgError) {
        console.error('[handleInterested] Error inserting message:', msgError);
        throw msgError;
      }

      console.log('[handleInterested] Message inserted successfully:', msgData);

      // 2. Update deal status
      const { error: updateError } = await supabase
        .from('deal_cards')
        .update({
          status: 'accepted',
          updated_at: new Date().toISOString()
        })
        .eq('id', dealId);

      if (updateError) {
        console.error('[handleInterested] Error updating deal:', updateError);
        throw updateError;
      }

      console.log('[handleInterested] Deal status updated to accepted');

      toast.success('تم قبول العرض بنجاح');
      
      // Refresh deals list
      await fetchPendingDeals();
      
    } catch (error) {
      console.error('[handleInterested] Full error:', error);
      toast.error('فشل قبول العرض: ' + (error.message || ''));
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Reject
  const handleReject = async (dealId: string) => {
    if (!user) return;
    setIsProcessing(true);

    try {
      // Fetch deal details
      const { data: deal, error: dealError } = await supabase
        .from('deal_cards')
        .select('*')
        .eq('id', dealId)
        .single();

      if (dealError) throw dealError;

      const celebrityId = managedCelebrityId || deal.celebrity_id;
      if (!celebrityId) throw new Error('No celebrity selected');

      // 1. Update deal status
      const { error: updateError } = await supabase
        .from('deal_cards')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString()
        })
        .eq('id', dealId);

      if (updateError) throw updateError;

      // 2. Send rejection message (as celebrity, not manager)
      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          sender_id: celebrityId, // Changed from user.id to celebrityId
          receiver_id: deal.sender_id,
          deal_id: dealId,
          content: 'تم رفض العرض',
          category: 'work'
        });

      if (msgError) {
        console.warn('Failed to send rejection message:', msgError);
        // Don't throw, just log
      }

      toast.success('تم رفض العرض بنجاح');
      
      // Refresh deals list
      await fetchPendingDeals();
      
    } catch (error) {
      console.error('Error rejecting deal:', error);
      toast.error('فشل رفض العرض: ' + (error.message || ''));
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Ask Talent Submit
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

      console.log('[handleAskTalentSubmit] Starting with:', { 
        dealId: askTalentDeal.id,
        question,
        managerId: user.id,
        senderId: celebrityId, // Changed to celebrityId
        receiverId: askTalentDeal.sender_id
      });

      // Insert message (as celebrity, not manager)
      const { data: msgData, error: msgError } = await supabase
        .from('messages')
        .insert({
          sender_id: celebrityId, // Changed from user.id to celebrityId
          receiver_id: askTalentDeal.sender_id,
          deal_id: askTalentDeal.id,
          content: question,
          category: 'work'
        })
        .select('id')
        .single();

      if (msgError) {
        console.error('[handleAskTalentSubmit] Error sending question:', msgError);
        throw msgError;
      }

      console.log('[handleAskTalentSubmit] Question sent successfully:', msgData);

      toast.success('تم إرسال السؤال بنجاح');
      
      // Clear the dialog
      setAskTalentDeal(null);
      setAskTalentQuestion('');
      
      // Refresh conversations
      await fetchConversations();
      
    } catch (error) {
      console.error('[handleAskTalentSubmit] Full error:', error);
      toast.error('فشل إرسال السؤال: ' + (error.message || ''));
    } finally {
      setIsSubmittingAsk(false);
    }
  };

  // Load data on mount and when dependencies change
  useEffect(() => {
    if (authLoading || !user) return;

    fetchPendingDeals();
    fetchConversations();

    // Set up real-time subscriptions
    const subscription = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'deal_cards' },
        () => { fetchPendingDeals(); }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'deal_cards', filter: `status=eq.pending` },
        () => { fetchPendingDeals(); }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { fetchConversations(); }
      )
      .subscribe();

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [user, authLoading, managedCelebrityId, role, fetchPendingDeals, fetchConversations]);

  // Show loader while auth is loading
  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="fixed top-0 right-0 left-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
        <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
          <h1 className="font-bold text-lg">
            {role === 'manager' ? 'لوحة الوكيل' : 'الرئيسية'}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/profile')}
            className="h-10 w-10 rounded-xl touch-feedback"
          >
            <User className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="max-w-lg mx-auto pt-16 pb-20 px-4">
        {/* Manager: Celebrity Switcher */}
        {role === 'manager' && managedCelebrities.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
              {managedCelebrities.map((celeb) => (
                <button
                  key={celeb.id}
                  onClick={() => switchCelebrity(celeb.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all shrink-0',
                    celeb.id === managedCelebrityId
                      ? 'bg-primary/10 border border-primary/20'
                      : 'bg-card border border-border/50'
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
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pending Deals Section (only for managers) */}
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
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm">{deal.company_name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {deal.deal_type} · {deal.budget_range}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {deal.details}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[10px] bg-yellow-500/10 text-yellow-600 px-2 py-0.5 rounded-full">
                            قيد المراجعة
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(deal.created_at).toLocaleDateString('ar-SA')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    {managedCelebrityId && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                        <Button
                          onClick={() => handleInterested(deal.id)}
                          disabled={isProcessing}
                          className="flex-1 h-9 rounded-xl bg-green-600 hover:bg-green-700 text-xs font-semibold"
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          قبول
                        </Button>
                        <Button
                          onClick={() => handleReject(deal.id)}
                          disabled={isProcessing}
                          variant="outline"
                          className="flex-1 h-9 rounded-xl border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold"
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          رفض
                        </Button>
                        <Button
                          onClick={() => setAskTalentDeal(deal)}
                          disabled={isProcessing}
                          variant="outline"
                          className="flex-1 h-9 rounded-xl border-blue-300 text-blue-600 hover:bg-blue-50 text-xs font-semibold"
                        >
                          <MessageCircle className="h-3.5 w-3.5 mr-1" />
                          سؤال
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inbox Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              المحادثات
            </h2>
          </div>

          <InboxSection
            conversations={conversations}
            isLoading={isLoadingMessages}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
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

      {/* Ask Talent Dialog */}
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
                className="h-8 w-8 rounded-full"
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
                className="w-full h-12 rounded-xl"
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

      <BottomNavigation />
    </div>
  );
}
