import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, User, ArrowLeft, ArrowRight, Mic, Image as ImageIcon, X, Shield, Briefcase, ChevronDown, ChevronUp, Globe, Calendar, FileText, Building2, DollarSign, UserCheck, MoreHorizontal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { encryptForRecipient, decryptFromSender, isEncryptedMessage } from '@/utils/e2eManager';
import { resumeAudioContext } from '@/utils/sounds';
import { DealCardInline } from '@/components/deals/DealCardInline';

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  is_read: boolean | null;
  category: string;
  parent_id: string | null;
  voice_url?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  is_edited?: boolean | null;
  edited_at?: string | null;
  expires_at?: string | null;
  deal_id?: string | null;
}

interface Deal {
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
  status: string;
  celebrity_id: string | null;
  sender_id: string | null;
}

export default function ChatPage() {
  const { userId } = useParams<{ userId: string }>();
  const [searchParams] = useSearchParams();
  const dealId = searchParams.get('dealId');
  const { user } = useAuth();
  const { role, managedCelebrityId } = useRole();
  const { isRTL } = useLanguage();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyContent, setReplyContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ file: File; url: string } | null>(null);
  const [recipient, setRecipient] = useState<Profile | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [showDealDetails, setShowDealDetails] = useState(false);
  const [celebrityProfile, setCelebrityProfile] = useState<Profile | null>(null);
  const [dealCache, setDealCache] = useState<Map<string, Deal>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isMountedRef = useRef(true);
  const loadMessagesRef = useRef<() => Promise<void>>();

  const t = useCallback((ar: string, en: string) => (isRTL ? ar : en), [isRTL]);

  // Determine the effective sender ID: if manager, use managedCelebrityId; otherwise user.id
  const effectiveSenderId = role === 'manager' && managedCelebrityId ? managedCelebrityId : user?.id;

  // Determine display profile based on role and deal context
  const getDisplayProfile = useCallback((): Profile | null => {
    if (!dealId || !deal) return recipient;
    
    // If current user is the deal sender (company), show celebrity profile
    if (user && deal.sender_id === user.id) {
      return celebrityProfile;
    }
    
    // Agent side: show company profile (recipient)
    // Celebrity side (Ask Talent): show agent profile (recipient)
    return recipient;
  }, [dealId, deal, user, recipient, celebrityProfile]);

  // Fetch recipient profile
  useEffect(() => {
    if (!userId) return;
    const fetchRecipient = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', userId)
        .single();
      if (data) setRecipient(data as Profile);
    };
    fetchRecipient();
  }, [userId]);

  // Fetch celebrity profile when dealId is present and user is company
  useEffect(() => {
    if (!dealId || !deal || !user || deal.sender_id !== user.id) {
      setCelebrityProfile(null);
      return;
    }
    
    const fetchCelebrity = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', deal.celebrity_id)
        .single();
      if (data) setCelebrityProfile(data as Profile);
    };
    fetchCelebrity();
  }, [dealId, deal, user]);

  // Fetch deal if dealId present (for URL-based deal)
  useEffect(() => {
    if (!dealId) return;
    const fetchDeal = async () => {
      const { data, error } = await supabase
        .from('deal_cards')
        .select('id, deal_type, company_name, budget_range, budget_cycle, timeline, details, website_url, exclusivity, deliverables, why_them, status, celebrity_id, sender_id')
        .eq('id', dealId)
        .single();
      if (!error && data) {
        setDeal(data as unknown as Deal);
      }
    };
    fetchDeal();
  }, [dealId]);

  // Fetch deal details for a given deal_id and cache it
  const fetchDealForMessage = useCallback(async (dealId: string): Promise<Deal | null> => {
    // Check cache first
    if (dealCache.has(dealId)) {
      return dealCache.get(dealId) || null;
    }

    try {
      const { data, error } = await supabase
        .from('deal_cards')
        .select('id, deal_type, company_name, budget_range, budget_cycle, timeline, details, website_url, exclusivity, deliverables, why_them, status, celebrity_id, sender_id')
        .eq('id', dealId)
        .single();

      if (!error && data) {
        const dealData = data as unknown as Deal;
        setDealCache(prev => new Map(prev).set(dealId, dealData));
        return dealData;
      }
    } catch (error) {
      console.error('Error fetching deal for message:', error);
    }
    return null;
  }, [dealCache]);

  // Infer deal from messages when no dealId in URL (for backward compatibility)
  useEffect(() => {
    if (dealId) return;
    if (messages.length === 0) return;

    const validUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const inferDeal = async () => {
      const messageIds = messages.map(m => m.id).filter(validUuid);
      if (messageIds.length === 0) {
        setDeal(null);
        return;
      }

      const { data, error } = await supabase
        .from('deal_cards')
        .select('id, deal_type, company_name, budget_range, budget_cycle, timeline, details, website_url, exclusivity, deliverables, why_them, status, celebrity_id, sender_id')
        .in('message_id', messageIds)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        setDeal(data[0] as unknown as Deal);
      }
    };

    inferDeal();
  }, [messages, dealId]);

  // Fetch all messages between current user and recipient (full thread)
  const loadMessages = useCallback(async () => {
    if (!user || !userId) return;
    setIsLoading(true);
    try {
      let query = supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`);

      // Only apply deal_id filter when dealId exists in the URL
      if (dealId) {
        query = (query as any).eq('deal_id', dealId);
      }

      const { data, error } = await query.order('created_at', { ascending: true }).limit(100);

      if (error) throw error;

      // Decrypt messages
      const decrypted = await Promise.all(((data as Message[]) || []).map(async (msg) => {
        if (isEncryptedMessage(msg.content)) {
          const res = await decryptFromSender(msg.content, msg.sender_id === user.id ? msg.receiver_id : msg.sender_id);
          return { ...msg, content: res.success ? res.plaintext : '🔒' };
        }
        return msg;
      }));

      if (isMountedRef.current) {
        setMessages(decrypted);

        // Mark as read
        const unreadIds = decrypted.filter(m => m.receiver_id === user.id && !m.is_read).map(m => m.id);
        if (unreadIds.length > 0) {
          await supabase.from('messages').update({ is_read: true }).in('id', unreadIds);
        }
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error(t('فشل تحميل الرسائل', 'Failed to load messages'));
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [user?.id, userId, dealId, t]);

  // Store ref for use in effects
  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Realtime subscription
  useEffect(() => {
    if (!user || !userId) return;
    const channel = supabase
      .channel(`chat-${user.id}-${userId}-${dealId || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new as any;
        if (msg && ((msg.sender_id === user.id && msg.receiver_id === userId) || (msg.sender_id === userId && msg.receiver_id === user.id))) {
          // If dealId is present, only reload if message matches deal_id
          if (dealId && msg.deal_id !== dealId) return;
          // If no dealId but we have an inferred deal, only reload if message matches that deal_id
          if (!dealId && deal && msg.deal_id !== deal.id) return;
          console.log('[ChatPage] Realtime message received, reloading');
          await loadMessages();
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, userId, dealId, deal, loadMessages]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Refresh on window focus
  useEffect(() => {
    const handleFocus = () => {
      if (isMountedRef.current && user) {
        console.log('[ChatPage] Window focus, refreshing messages');
        loadMessages();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, loadMessages]);

  const uploadMedia = async (file: File): Promise<{ url: string; type: string } | null> => {
    const { data: auth } = await supabase.auth.getUser();
    const ext = file.name.split('.').pop();
    const fileName = `${auth.user?.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('media-messages').upload(fileName, file);
    if (error) return null;
    const { data: urlData } = supabase.storage.from('media-messages').getPublicUrl(fileName);
    return { url: urlData.publicUrl, type: file.type.startsWith('video/') ? 'video' : 'image' };
  };

  const handleSend = async (text: string, voiceUrl?: string) => {
    if (!user || !userId || (!text.trim() && !voiceUrl && !mediaPreview)) return;
    
    // Guard: manager must have a managed celebrity selected
    if (role === 'manager' && !managedCelebrityId) {
      toast.error(isRTL ? 'يجب اختيار موهبة أولاً' : 'Must select a talent first');
      setIsSending(false);
      return;
    }
    
    // Resume audio context on user interaction
    resumeAudioContext();
    
    setIsSending(true);

    // GUARD: User can only send a work message if they have an accepted Deal Card with the other participant
    let hasDeal = false;
    let foundDeal: Deal | null = null;

    if (dealId) {
      // 1. If dealId is in the URL, allow sending
      hasDeal = true;
      if (!deal) {
        // Fetch deal details for pinned card display
        const { data: dealData } = await supabase
          .from('deal_cards')
          .select('id, deal_type, company_name, budget_range, budget_cycle, timeline, details, website_url, exclusivity, deliverables, why_them, status, celebrity_id, sender_id')
          .eq('id', dealId)
          .single();
        if (dealData) {
          foundDeal = dealData as unknown as Deal;
          setDeal(foundDeal);
        }
      } else {
        foundDeal = deal;
      }
    } else {
      // 2. If dealId is NOT in the URL, first check if any message in THIS conversation
      // has a related accepted deal via deal_cards.message_id
      const validMessageIds = messages
        .map(m => m.id)
        .filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

      if (validMessageIds.length > 0) {
        const { data: dealFromMessage } = await supabase
          .from('deal_cards')
          .select('id, deal_type, company_name, budget_range, budget_cycle, timeline, details, website_url, exclusivity, deliverables, why_them, status, celebrity_id, sender_id')
          .in('message_id', validMessageIds)
          .eq('status', 'accepted')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (dealFromMessage) {
          hasDeal = true;
          foundDeal = dealFromMessage as unknown as Deal;
          setDeal(foundDeal);
        }
      }

      // 3. If not found via message_id, directly search for an accepted deal where the current user
      // is either the sender (company) OR the celebrity, and the deal involves the other participant
      if (!hasDeal) {
        const managedCelebId = managedCelebrityId || '00000000-0000-0000-0000-000000000000';
        
        const { data: acceptedDeal } = await supabase
          .from('deal_cards')
          .select('id, deal_type, company_name, budget_range, budget_cycle, timeline, details, website_url, exclusivity, deliverables, why_them, status, celebrity_id, sender_id')
          .eq('status', 'accepted')
          .not('message_id', 'is', null)
          .or(`and(sender_id.eq.${user.id},celebrity_id.eq.${userId}),and(sender_id.eq.${userId},celebrity_id.eq.${user.id}),and(sender_id.eq.${userId},celebrity_id.eq.${managedCelebId})`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (acceptedDeal) {
          hasDeal = true;
          foundDeal = acceptedDeal as unknown as Deal;
          // Update local deal state so pinned card displays
          setDeal(foundDeal);
        }
      }
    }

    if (!hasDeal) {
      toast.error(isRTL ? 'لا يمكن بدء محادثة بدون عرض عمل' : 'Cannot start a conversation without a deal');
      setIsSending(false);
      return;
    }

    // Always use 'work' category
    const category = 'work';

    // Conversation root logic: find oldest root message (parent_id null) between the two users for 'work' category
    // This ensures each pair of users has exactly ONE work conversation per deal
    let parentId: string | null = null;
    let rootQuery = supabase
      .from('messages')
      .select('id')
      .is('parent_id', null)
      .eq('category', 'work')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`);

    // Scope root message to the deal: use dealId from URL, or foundDeal.id if inferred
    const effectiveDealId = dealId || foundDeal?.id;
    if (effectiveDealId) {
      rootQuery = (rootQuery as any).eq('deal_id', effectiveDealId);
    }

    const { data: rootMsg } = await rootQuery
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (rootMsg) {
      parentId = rootMsg.id;
    }

    try {
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;

      if (mediaPreview) {
        const result = await uploadMedia(mediaPreview.file);
        if (result) { mediaUrl = result.url; mediaType = result.type; }
        URL.revokeObjectURL(mediaPreview.url);
        setMediaPreview(null);
      }

      const contentToSend = text || (mediaType === 'video' ? '🎥' : mediaType === 'image' ? '📷' : '🎤');
      const enc = await encryptForRecipient(contentToSend, userId);
      const finalContent = enc.success ? enc.payload : contentToSend;
      if (!enc.success) {
        console.debug('Encryption failed, sending unencrypted');
      }

      // Determine sender_id: if manager, use managedCelebrityId; otherwise user.id
      const senderId = effectiveSenderId;
      
      // Determine receiver_id: the other party (company/sender)
      // If manager is sending as celebrity, receiver is the company (deal.sender_id)
      // If company is sending, receiver is the celebrity (deal.celebrity_id or managedCelebrityId)
      let receiverId = userId;
      if (role === 'manager' && managedCelebrityId && foundDeal) {
        // Manager sending as celebrity -> receiver is the company who sent the deal
        receiverId = foundDeal.sender_id;
      } else if (role !== 'manager' && foundDeal) {
        // Company sending -> receiver is the celebrity
        receiverId = foundDeal.celebrity_id || userId;
      }

      // Insert message with category 'work' and parent_id pointing to conversation root
      // Include deal_id and celebrity_id from the deal
      const { error } = await supabase.from('messages').insert({
        sender_id: senderId,
        receiver_id: receiverId,
        content: finalContent,
        voice_url: voiceUrl || null,
        media_url: mediaUrl,
        media_type: mediaType,
        category,
        parent_id: parentId,
        celebrity_id: (foundDeal || deal)?.celebrity_id || managedCelebrityId || null,
        deal_id: dealId || foundDeal?.id || null,
      } as any);
      
      if (error) throw error;

      // Push notification - use celebrity name for manager actions
      let senderName = '';
      if (role === 'manager' && managedCelebrityId) {
        // Fetch celebrity profile for notification
        const { data: celebProfile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', managedCelebrityId)
          .single();
        senderName = celebProfile?.display_name || 'Someone';
      } else {
        const { data: senderProfile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
        senderName = senderProfile?.display_name || 'Someone';
      }
      
      supabase.functions.invoke('send-push-notification', {
        body: {
          receiverId: receiverId,
          senderName: senderName,
          messageType: voiceUrl ? 'voice' : mediaType || 'text',
          content: text,
        },
      }).catch(() => {});

      // Only clear input and reset state AFTER successful insert
      setReplyContent('');
      setShowVoice(false);
      await loadMessages();
    } catch (error) {
      console.error('Send error:', error);
      toast.error(t('فشل الإرسال', 'Send failed'));
      // Keep message in input - do not clear replyContent
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { toast.error(t('الحد الأقصى 25 ميغابايت', 'Max 25MB')); return; }
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { toast.error(t('صور وفيديوهات فقط', 'Images and videos only')); return; }
    setMediaPreview({ file, url: URL.createObjectURL(file) });
  };

  const formatTime = (dateStr: string) => {
    return new Intl.DateTimeFormat(isRTL ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' }).format(new Date(dateStr));
  };

  const formatDate = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return t('اليوم', 'Today');
    if (days === 1) return t('أمس', 'Yesterday');
    return new Intl.DateTimeFormat(isRTL ? 'ar' : 'en', { dateStyle: 'medium' }).format(new Date(dateStr));
  };

  const displayProfile = getDisplayProfile();

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Minimal Header - Apple Messages Style */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/50 safe-area-inset-top">
        <div className="max-w-lg mx-auto flex h-16 items-center justify-between px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/home')}
            className="h-10 w-10 rounded-xl touch-feedback shrink-0"
            aria-label={t('العودة', 'Back')}
          >
            {isRTL ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
          </Button>
          <button className="flex items-center gap-3 flex-1 min-w-0" onClick={() => setShowDealDetails(!showDealDetails)}>
            <Avatar className="h-10 w-10 ring-2 ring-primary/10">
              <AvatarImage src={displayProfile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                {displayProfile?.display_name?.[0] || <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
            <div className="text-start min-w-0">
              <p className="font-semibold text-base truncate">
                {displayProfile?.display_name || displayProfile?.username || t('جاري التحميل...', 'Loading...')}
              </p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                {displayProfile?.username && `@${displayProfile.username}`}
                <Shield className="h-3 w-3 text-emerald-500 inline" />
                <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">E2E</span>
              </p>
            </div>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl touch-feedback shrink-0"
            aria-label={t('المزيد', 'More')}
          >
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto pt-16 pb-20 px-4 max-w-lg mx-auto w-full" ref={scrollRef}>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => {
              const isMine = msg.sender_id === effectiveSenderId;
              const showDateSep = i === 0 || formatDate(msg.created_at) !== formatDate(messages[i - 1]?.created_at);
              
              // Check if this message has a deal_id and it's the first message with this deal_id
              const hasDealId = !!msg.deal_id;
              const isFirstInDealGroup = hasDealId && (
                i === 0 || messages[i - 1]?.deal_id !== msg.deal_id
              );

              return (
                <div key={msg.id}>
                  {showDateSep && (
                    <div className="text-center my-4">
                      <span className="text-[11px] text-muted-foreground bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full font-medium">
                        {formatDate(msg.created_at)}
                      </span>
                    </div>
                  )}
                  
                  {/* Deal Card inline above first message of each deal_id group */}
                  {isFirstInDealGroup && msg.deal_id && (
                    <DealCardInline 
                      dealId={msg.deal_id} 
                      isRTL={isRTL} 
                      onToggleDetails={() => setShowDealDetails(!showDealDetails)} 
                      showDetails={showDealDetails} 
                    />
                  )}

                  <div className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
                    <div className="max-w-[75%]">
                      <div className={cn(
                        'px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed shadow-sm',
                        isMine 
                          ? 'bg-primary text-primary-foreground rounded-es-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)]' 
                          : 'bg-card border border-border/50 rounded-ee-sm shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
                      )}>
                        {msg.media_url && msg.media_type === 'image' && (
                          <img src={msg.media_url} alt="" className="rounded-xl max-w-full mb-1.5 cursor-pointer" onClick={() => window.open(msg.media_url!, '_blank')} />
                        )}
                        {msg.media_url && msg.media_type === 'video' && (
                          <video src={msg.media_url} controls className="rounded-xl max-w-full mb-1.5" />
                        )}
                        {msg.voice_url ? (
                          <div className="flex items-center gap-2 p-2 bg-background/50 rounded-xl">
                            <Mic className="h-5 w-5 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">{isRTL ? 'رسالة صوتية' : 'Voice message'}</span>
                          </div>
                        ) : msg.content && !['📷', '🎥', '🎤'].includes(msg.content) ? (
                          <p className="whitespace-pre-wrap">{msg.content === '🔒' ? (
                            <span className="flex items-center gap-1 text-muted-foreground/70 italic text-sm">
                              <Shield className="h-3 w-3" /> {t('مشفرة', 'Encrypted')}
                            </span>
                          ) : msg.content}</p>
                        ) : null}
                        <div className={cn('flex items-center gap-1.5 mt-1.5', isMine ? 'justify-end' : '')}>
                          {msg.is_edited && (
                            <span className={cn('text-[10px] italic', isMine ? 'text-primary-foreground/50' : 'text-muted-foreground')}>
                              {t('معدّلة', 'Edited')}
                            </span>
                          )}
                          <span className={cn('text-[10px]', isMine ? 'text-primary-foreground/50' : 'text-muted-foreground')}>
                            {formatTime(msg.created_at)}
                          </span>
                          {isMine && msg.is_read !== null && (
                            <span className={cn('h-3 w-3', msg.is_read ? 'text-blue-300' : 'text-primary-foreground/40')}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 6 22 10 18 14" /></svg>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {messages.length === 0 && !deal && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Send className="h-8 w-8 text-primary" />
                </div>
                <p className="text-muted-foreground">{t('لا توجد رسائل بعد', 'No messages yet')}</p>
                <p className="text-sm text-muted-foreground/70 mt-1">{t('ابدأ المحادثة', 'Start the conversation')}</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Media Preview */}
      {mediaPreview && (
        <div className="mx-4 mb-2 relative">
          {mediaPreview.file.type.startsWith('video/') ? (
            <video src={mediaPreview.url} className="h-20 rounded-xl" />
          ) : (
            <img src={mediaPreview.url} className="h-20 rounded-xl object-cover" />
          )}
          <Button size="icon" variant="destructive" className="absolute top-1 end-1 h-6 w-6 rounded-full touch-feedback" onClick={() => { URL.revokeObjectURL(mediaPreview.url); setMediaPreview(null); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Fixed Bottom Input - Apple Messages Style */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border/50 safe-area-inset-bottom px-4 pb-4 max-w-lg mx-auto">
        <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />
        {showVoice ? (
          <div className="flex items-center gap-2 p-4 bg-muted/30 rounded-xl">
            <Mic className="h-6 w-6 text-primary" />
            <span className="text-sm text-muted-foreground">{isRTL ? 'تسجيل صوتي غير متاح' : 'Voice recording not available'}</span>
            <Button variant="ghost" size="icon" onClick={() => setShowVoice(false)} className="ml-auto">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className="h-12 w-12 rounded-full shrink-0 touch-feedback" aria-label={t('إرفاق وسائط', 'Attach media')}>
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </Button>
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                placeholder={t('اكتب رسالة...', 'Message...')}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                rows={1}
                className="w-full resize-none text-[15px] rounded-2xl border border-border/50 bg-card px-4 py-3 min-h-[48px] max-h-32 focus:outline-none focus:border-primary/50 transition-colors"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(replyContent); } }}
              />
            </div>
            {replyContent.trim() || mediaPreview ? (
              <Button onClick={() => handleSend(replyContent)} disabled={isSending} size="icon" className="h-12 w-12 rounded-full shrink-0 touch-feedback" aria-label={t('إرسال', 'Send')}>
                {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            ) : (
              <Button variant="ghost" size="icon" onClick={() => setShowVoice(true)} className="h-12 w-12 rounded-full shrink-0 touch-feedback" aria-label={t('رسالة صوتية', 'Voice message')}>
                <Mic className="h-5 w-5 text-muted-foreground" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
