import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, User, ArrowLeft, ArrowRight, Mic, Image as ImageIcon, X, Shield, Briefcase, ChevronDown, ChevronUp, Globe, Calendar, FileText, Building2, DollarSign, UserCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import VoiceRecorder from '@/components/messaging/VoiceRecorder';
import VoicePlayer from '@/components/messaging/VoicePlayer';
import { encryptForRecipient, decryptFromSender, isEncryptedMessage } from '@/utils/e2eManager';
import { resumeAudioContext } from '@/utils/sounds';

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
}

export default function ChatPage() {
  const { userId } = useParams<{ userId: string }>();
  const [searchParams] = useSearchParams();
  const dealId = searchParams.get('dealId');
  const { user } = useAuth();
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const t = useCallback((ar: string, en: string) => (isRTL ? ar : en), [isRTL]);

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

  // Fetch deal if dealId present
  useEffect(() => {
    if (!dealId) return;
    const fetchDeal = async () => {
      const { data, error } = await supabase
        .from('deal_cards')
        .select('id, deal_type, company_name, budget_range, budget_cycle, timeline, details, website_url, exclusivity, deliverables, why_them, status, celebrity_id')
        .eq('id', dealId)
        .single();
      if (!error && data) {
        setDeal(data as unknown as Deal);
      }
    };
    fetchDeal();
  }, [dealId]);

  // Infer deal from messages when no dealId in URL
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
        .select('id, deal_type, company_name, budget_range, budget_cycle, timeline, details, website_url, exclusivity, deliverables, why_them, status, celebrity_id')
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

  // Fetch messages between current user and recipient
  const loadMessages = useCallback(async () => {
    if (!user || !userId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Decrypt messages
      const decrypted = await Promise.all(((data as Message[]) || []).map(async (msg) => {
        if (isEncryptedMessage(msg.content)) {
          const res = await decryptFromSender(msg.content, msg.sender_id === user.id ? msg.receiver_id : msg.sender_id);
          return { ...msg, content: res.success ? res.plaintext : '🔒' };
        }
        return msg;
      }));

      setMessages(decrypted);

      // Mark as read
      const unreadIds = decrypted.filter(m => m.receiver_id === user.id && !m.is_read).map(m => m.id);
      if (unreadIds.length > 0) {
        await supabase.from('messages').update({ is_read: true }).in('id', unreadIds);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error(t('فشل تحميل الرسائل', 'Failed to load messages'));
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, userId, t]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Realtime subscription
  useEffect(() => {
    if (!user || !userId) return;
    const channel = supabase
      .channel(`chat-${user.id}-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new as any;
        if (msg && ((msg.sender_id === user.id && msg.receiver_id === userId) || (msg.sender_id === userId && msg.receiver_id === user.id))) {
          await loadMessages();
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, userId, loadMessages]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
    
    // Resume audio context on user interaction
    resumeAudioContext();
    
    setIsSending(true);

    // Check if there's a dealId or existing accepted deal between the two users
    let hasDeal = !!dealId;
    
    if (!hasDeal) {
      // Check for accepted deal between these two users
      const { data: acceptedDeal } = await supabase
        .from('deal_cards')
        .select('id')
        .eq('status', 'accepted')
        .or(`and(sender_id.eq.${user.id},celebrity_id.eq.${userId}),and(sender_id.eq.${userId},celebrity_id.eq.${user.id})`)
        .limit(1)
        .maybeSingle();
      
      hasDeal = !!acceptedDeal;
    }

    if (!hasDeal) {
      toast.error(isRTL ? 'لا يمكن بدء محادثة بدون عرض عمل' : 'Cannot start a conversation without a deal');
      setIsSending(false);
      return;
    }

    // Always use 'work' category
    const category = 'work';

    // For deal messages, keep parent_id null until manager accepts
    let parentId: string | null = null;
    if (!deal) {
      // Conversation root logic: find oldest root message (parent_id null) between the two users for 'work' category
      const { data: rootMsg } = await supabase
        .from('messages')
        .select('id')
        .is('parent_id', null)
        .eq('category', 'work')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (rootMsg) {
        parentId = rootMsg.id;
      }
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      sender_id: user.id,
      receiver_id: userId,
      content: text || (voiceUrl ? '🎤' : '📷'),
      created_at: new Date().toISOString(),
      is_read: null,
      category,
      parent_id: parentId,
      voice_url: voiceUrl || null,
      media_url: mediaPreview?.url || null,
      media_type: mediaPreview?.file.type.startsWith('video/') ? 'video' : mediaPreview ? 'image' : null,
    };
    setMessages(prev => [...prev, optimisticMsg]);

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
        console.warn('Encryption failed, sending unencrypted');
      }

      const { error } = await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: userId,
        content: finalContent,
        voice_url: voiceUrl || null,
        media_url: mediaUrl,
        media_type: mediaType,
        category,
        parent_id: parentId,
        celebrity_id: deal?.celebrity_id || null,
      } as any);
      if (error) throw error;

      // Push notification
      const { data: senderProfile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
      supabase.functions.invoke('send-push-notification', {
        body: {
          receiverId: userId,
          senderName: senderProfile?.display_name || 'Someone',
          messageType: voiceUrl ? 'voice' : mediaType || 'text',
          content: text,
        },
      }).catch(() => {});

      setReplyContent('');
      setShowVoice(false);
      await loadMessages();
    } catch (error) {
      console.error('Send error:', error);
      toast.error(t('فشل الإرسال', 'Send failed'));
      setMessages(prev => prev.filter(m => m.id !== tempId));
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

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
        <div className="max-w-lg mx-auto flex h-16 items-center justify-between px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/home')}
            className="h-10 w-10 rounded-xl touch-feedback shrink-0"
          >
            {isRTL ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
          </Button>
          <button className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar className="h-10 w-10 ring-2 ring-primary/10">
              <AvatarImage src={recipient?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                {recipient?.display_name?.[0] || <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
            <div className="text-start min-w-0">
              <p className="font-semibold text-base truncate">
                {recipient?.display_name || recipient?.username || t('جاري التحميل...', 'Loading...')}
              </p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                {recipient?.username && `@${recipient.username}`}
                <Shield className="h-3 w-3 text-emerald-500 inline" />
                <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">E2E</span>
              </p>
            </div>
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto pt-16 pb-20 px-4 max-w-lg mx-auto w-full" ref={scrollRef}>
        {/* Pinned Deal Card */}
        {deal && (
          <div className="mb-4 border border-border rounded-2xl bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="p-2 bg-primary/10 rounded-xl shrink-0">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">
                    {deal.deal_type || (isRTL ? 'عرض غير محدد' : 'Untitled Offer')}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    {deal.company_name && (
                      <>
                        <Building2 className="h-3 w-3" />
                        {deal.company_name}
                      </>
                    )}
                    {deal.budget_range && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <DollarSign className="h-3 w-3" />
                        {deal.budget_range}
                      </>
                    )}
                    {deal.timeline && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <Calendar className="h-3 w-3" />
                        {deal.timeline}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl shrink-0"
                onClick={() => setShowDealDetails(!showDealDetails)}
              >
                {showDealDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>

            {showDealDetails && (
              <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
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
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Send className="h-8 w-8 text-primary" />
            </div>
            <p className="text-muted-foreground">{t('لا توجد رسائل بعد', 'No messages yet')}</p>
            <p className="text-sm text-muted-foreground/70 mt-1">{t('ابدأ المحادثة', 'Start the conversation')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => {
              const isMine = msg.sender_id === user.id;
              const showDateSep = i === 0 || formatDate(msg.created_at) !== formatDate(messages[i - 1].created_at);

              return (
                <div key={msg.id}>
                  {showDateSep && (
                    <div className="text-center my-4">
                      <span className="text-[11px] text-muted-foreground bg-card/80 backdrop-blur-sm px-3 py-1 rounded-full font-medium">
                        {formatDate(msg.created_at)}
                      </span>
                    </div>
                  )}
                  <div className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
                    <div className="max-w-[75%]">
                      <div className={cn(
                        'px-4 py-2 rounded-2xl text-[15px] leading-relaxed',
                        isMine ? 'bg-primary text-primary-foreground rounded-es-sm' : 'bg-card border border-border rounded-ee-sm'
                      )}>
                        {msg.media_url && msg.media_type === 'image' && (
                          <img src={msg.media_url} alt="" className="rounded-xl max-w-full mb-1.5 cursor-pointer" onClick={() => window.open(msg.media_url!, '_blank')} />
                        )}
                        {msg.media_url && msg.media_type === 'video' && (
                          <video src={msg.media_url} controls className="rounded-xl max-w-full mb-1.5" />
                        )}
                        {msg.voice_url ? (
                          <VoicePlayer url={msg.voice_url} isMine={isMine} />
                        ) : msg.content && !['📷', '🎥', '🎤'].includes(msg.content) ? (
                          <p className="whitespace-pre-wrap">{msg.content === '🔒' ? (
                            <span className="flex items-center gap-1 text-muted-foreground/70 italic text-sm">
                              <Shield className="h-3 w-3" /> {t('مشفرة', 'Encrypted')}
                            </span>
                          ) : msg.content}</p>
                        ) : null}
                        <div className={cn('flex items-center gap-1 mt-1', isMine ? 'justify-end' : '')}>
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
          <Button size="icon" variant="destructive" className="absolute top-1 end-1 h-6 w-6 rounded-full" onClick={() => { URL.revokeObjectURL(mediaPreview.url); setMediaPreview(null); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Fixed Bottom Input */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border safe-area-inset-bottom px-4 pb-4 max-w-lg mx-auto">
        <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />
        {showVoice ? (
          <VoiceRecorder
            onRecordComplete={(url) => handleSend('🎤', url)}
            onCancel={() => setShowVoice(false)}
          />
        ) : (
          <div className="flex items-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className="h-12 w-12 rounded-full shrink-0">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </Button>
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                placeholder={t('اكتب رسالة...', 'Message...')}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                rows={1}
                className="w-full resize-none text-[15px] rounded-2xl border border-border bg-muted/30 px-4 py-3 min-h-[48px] max-h-32 focus:outline-none focus:border-primary transition-colors"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(replyContent); } }}
              />
            </div>
            {replyContent.trim() || mediaPreview ? (
              <Button onClick={() => handleSend(replyContent)} disabled={isSending} size="icon" className="h-12 w-12 rounded-full shrink-0 touch-feedback">
                {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            ) : (
              <Button variant="ghost" size="icon" onClick={() => setShowVoice(true)} className="h-12 w-12 rounded-full shrink-0 touch-feedback">
                <Mic className="h-5 w-5 text-muted-foreground" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
