import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Send, Loader2, User, ArrowLeft, ArrowRight, Mic, Phone, Video, Image as ImageIcon, X, Check, CheckCheck, Copy, Reply, MoreVertical, Shield, Pencil, Timer, ShieldCheck, UserCheck, Briefcase, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Message, MessageCategory } from './InboxSection';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { encryptForRecipient, decryptFromSender, isEncryptedMessage, storeOwnMessagePlaintext, getOwnMessagePlaintext } from '@/utils/e2eManager';
import { initScreenshotDetection, onScreenshot, notifyScreenshot } from '@/utils/screenshotDetection';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConversationViewProps {
  message: Message | null;
  isOpen: boolean;
  onClose: () => void;
  onMessageRead?: () => void;
  canCall?: boolean;
}

interface ThreadMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  is_read: boolean | null;
  category: MessageCategory;
  parent_id: string | null;
  voice_url?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  is_edited?: boolean | null;
  edited_at?: string | null;
  expires_at?: string | null;
  sender_role?: string | null;
  managed_celebrity_id?: string | null;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  reaction: string;
}

const REACTIONS = ['❤️', '👍', '🔥', '😂', '👎'];
const UNSEND_WINDOW_MS = 5 * 60 * 1000;
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const DISAPPEAR_OPTIONS = [
  { label: '10s', value: 10 * 1000 },
  { label: '1h', value: 60 * 60 * 1000 },
  { label: '24h', value: 24 * 60 * 60 * 1000 },
  { label: '7d', value: 7 * 24 * 60 * 60 * 1000 },
];

const haptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if ('vibrate' in navigator) navigator.vibrate(style === 'light' ? 10 : style === 'medium' ? 20 : 40);
};

function relativeTime(dateStr: string, isRTL: boolean): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return isRTL ? 'الآن' : 'Now';
  if (mins < 60) return isRTL ? `${mins} د` : `${mins}m`;
  if (hours < 24) return isRTL ? `${hours} س` : `${hours}h`;
  if (days === 1) return isRTL ? 'أمس' : 'Yesterday';
  return new Intl.DateTimeFormat(isRTL ? 'ar' : 'en', { dateStyle: 'short' }).format(new Date(dateStr));
}

function dateSeparator(dateStr: string, isRTL: boolean): string {
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diffDays === 0) return isRTL ? 'اليوم' : 'Today';
  if (diffDays === 1) return isRTL ? 'أمس' : 'Yesterday';
  return new Intl.DateTimeFormat(isRTL ? 'ar' : 'en', { dateStyle: 'medium' }).format(new Date(dateStr));
}

export default function ConversationView({ message, isOpen, onClose, onMessageRead, canCall }: ConversationViewProps) {
  const { isRTL } = useLanguage();
  const { user } = useAuth();
  const { role, managedCelebrityId } = useRole();
  const navigate = useNavigate();
  const [replyContent, setReplyContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendingMsgId, setSendingMsgId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; isMine: boolean; createdAt: string } | null>(null);
  const [showVoice, setShowVoice] = useState(false);
  const [activeCall, setActiveCall] = useState<{ type: 'audio' | 'video' } | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{ file: File; url: string } | null>(null);
  const [showBlockReport, setShowBlockReport] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ msgId: string; x: number; y: number } | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [isTyping, setIsTyping] = useState(false);
  const [editingMsg, setEditingMsg] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showDisappear, setShowDisappear] = useState(false);
  const [disappearTimer, setDisappearTimer] = useState<number | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [managedCelebrityProfiles, setManagedCelebrityProfiles] = useState<Map<string, Profile>>(new Map());
  const [deal, setDeal] = useState<any>(null);
  const [ownMessagesCache, setOwnMessagesCache] = useState<Map<string, string>>(new Map());

  interface Profile {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  }

  const getRootId = (msg: Message | null): string | null => msg ? (msg.parent_id || msg.id) : null;

  const isInactiveThread = useCallback((threadMsgs: ThreadMessage[]) => {
    if (threadMsgs.length === 0) return true;
    return (Date.now() - new Date(threadMsgs[threadMsgs.length - 1].created_at).getTime()) / 3600000 >= 1;
  }, []);

  // Fetch managed celebrity profile for display
  const fetchManagedCelebrityProfile = useCallback(async (celebrityId: string): Promise<Profile | null> => {
    if (managedCelebrityProfiles.has(celebrityId)) {
      return managedCelebrityProfiles.get(celebrityId) || null;
    }
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', celebrityId)
        .single();
      if (data) {
        const profile = data as Profile;
        setManagedCelebrityProfiles(prev => new Map(prev).set(celebrityId, profile));
        return profile;
      }
    } catch (error) {
      console.error('Error fetching managed celebrity profile:', error);
    }
    return null;
  }, [managedCelebrityProfiles]);

  const decryptThread = async (msgs: ThreadMessage[]): Promise<ThreadMessage[]> => {
    if (!user) return msgs;
    return Promise.all(msgs.map(async (msg) => {
      // For own messages, check IndexedDB cache first
      if (msg.sender_id === user.id) {
        const cached = await getOwnMessagePlaintext(msg.id);
        if (cached) {
          return { ...msg, content: cached };
        }
      }
      
      if (isEncryptedMessage(msg.content)) {
        // FIX: Use message.sender_id as the key owner for decryption
        try {
          const res = await decryptFromSender(msg.content, msg.sender_id);
          if (res.success) {
            return { ...msg, content: res.plaintext };
          }
          // Decryption failed - return readable fallback
          return { 
            ...msg, 
            content: isRTL ? 'رسالة قديمة غير قابلة للقراءة' : 'Old message unreadable',
            _decryptionFailed: true
          };
        } catch (decryptError) {
          console.error('[ConversationView] Decryption failed for message:', msg.id, decryptError);
          return { 
            ...msg, 
            content: isRTL ? 'رسالة قديمة غير قابلة للقراءة' : 'Old message unreadable',
            _decryptionFailed: true
          };
        }
      }
      return msg;
    }));
  };

  const loadThread = useCallback(async () => {
    if (!message || !user) return;
    const rootId = getRootId(message);
    if (!rootId) return;

    setIsLoading(true);
    
    // Add 3-second timeout to prevent stuck loading
    const loadingTimeout = setTimeout(() => {
      console.warn('[ConversationView] loadThread timeout after 3s, setting loading to false');
      setIsLoading(false);
    }, 3000);

    try {
      // FIX: Compute partnerId from the message, then use direct query between user.id and partnerId
      const partnerId = message.sender_id === user.id ? message.receiver_id : message.sender_id;

      const [{ data }, { data: rxns }, { data: delMsgs }] = await Promise.all([
        supabase.from('messages').select('*')
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`)
          .or(`id.eq.${rootId},parent_id.eq.${rootId}`)
          .order('created_at', { ascending: true }),
        supabase.from('message_reactions').select('*'),
        supabase.from('deleted_messages').select('message_id').eq('user_id', user.id),
      ]);

      const deletedSet = new Set((delMsgs || []).map(d => d.message_id));
      setDeletedIds(deletedSet);
      const filtered = ((data as ThreadMessage[]) || []).filter(m => !deletedSet.has(m.id));
      const decrypted = await decryptThread(filtered);
      
      // Fetch managed celebrity profiles for messages that have managed_celebrity_id
      const celebrityIds = new Set<string>();
      decrypted.forEach(msg => {
        if (msg.managed_celebrity_id) {
          celebrityIds.add(msg.managed_celebrity_id);
        }
      });
      
      for (const celebId of celebrityIds) {
        if (!managedCelebrityProfiles.has(celebId)) {
          await fetchManagedCelebrityProfile(celebId);
        }
      }

      setThread(decrypted);
      setReactions((rxns as Reaction[]) || []);
      clearTimeout(loadingTimeout);
      setIsLoading(false);

      // Fetch deal if any message has deal_id
      const dealId = decrypted.find(m => m.deal_id)?.deal_id;
      if (dealId) {
        const { data: dealData } = await supabase
          .from('deal_cards')
          .select('id, deal_type, company_name, budget_range, budget_cycle, timeline, details, website_url, exclusivity, deliverables, why_them, status, celebrity_id, sender_id')
          .eq('id', dealId)
          .single();
        if (dealData) setDeal(dealData);
      }

      if (data) {
        const unreadIds = data.filter(m => m.receiver_id === user.id && !m.is_read).map(m => m.id);
        if (unreadIds.length > 0) {
          await supabase.from('messages').update({ is_read: true }).in('id', unreadIds);
          onMessageRead?.();
        }
      }
    } catch (error) {
      console.error('Error loading thread:', error);
      clearTimeout(loadingTimeout);
      setIsLoading(false);
    }
  }, [message?.id, user?.id, managedCelebrityProfiles, fetchManagedCelebrityProfile, ownMessagesCache, isRTL]);

  useEffect(() => {
    if (isOpen && message) { setIsLoading(true); loadThread(); }
  }, [isOpen, message?.id]);

  // Realtime
  useEffect(() => {
    if (!isOpen || !message || !user) return;
    const rootId = getRootId(message);
    if (!rootId) return;

    const senderIds = [user.id];
    const receiverIds = [user.id];

    const typingChannel = supabase.channel(`typing-${rootId}`);
    typingChannel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload.userId !== user.id) {
        setIsTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
      }
    }).subscribe();

    const msgChannel = supabase.channel(`thread-${rootId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new as any;
        if (msg) {
          // Check if message involves current user (only user.id, not managedCelebrityId)
          const isRelevant = senderIds.some(sid => msg.sender_id === sid) && 
                            receiverIds.some(rid => msg.receiver_id === rid);
          
          if (!isRelevant) return;
          
          if (msg.id === rootId || msg.parent_id === rootId) {
            console.log('[ConversationView] Realtime message received, reloading');
            await loadThread();
          }
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(typingChannel);
      supabase.removeChannel(msgChannel);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setIsTyping(false);
    };
  }, [isOpen, message?.id, user?.id, loadThread]);

  const broadcastTyping = useCallback(() => {
    if (!message || !user) return;
    const rootId = getRootId(message);
    if (!rootId) return;
    const channel = supabase.channel(`typing-${rootId}`);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({ type: 'broadcast', event: 'typing', payload: { userId: user.id } });
      }
    });
  }, [message?.id, user?.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread]);

  // 📸 Screenshot detection — notify the other party in real-time
  useEffect(() => {
    if (!isOpen || !user?.id || !message) return;
    initScreenshotDetection();
    const otherId = message.sender_id === user.id ? message.receiver_id : message.sender_id;
    const off = onScreenshot(() => {
      toast.warning('تم رصد لقطة شاشة — تم إخطار الطرف الآخر');
      notifyScreenshot({
        senderId: user.id,
        receiverId: otherId,
        category: message.category as any,
      });
    });
    return () => { off(); };
  }, [isOpen, user?.id, message?.id]);

  const otherUserId = message?.sender_id === user?.id ? message?.receiver_id : message?.sender_id;
  const isInactive = isInactiveThread(thread);
  const isDealAccepted = deal && deal.status === 'accepted';

  const uploadMedia = async (file: File): Promise<{ url: string; type: string } | null> => {
    const { data: auth } = await supabase.auth.getUser();
    const ext = file.name.split('.').pop();
    const fileName = `${auth.user?.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('media-messages').upload(fileName, file);
    if (error) return null;
    const { data: urlData } = supabase.storage.from('media-messages').getPublicUrl(fileName);
    return { url: urlData.publicUrl, type: file.type.startsWith('video/') ? 'video' : 'image' };
  };

  const handleSendReply = async (text: string, voiceUrl?: string) => {
    if (!message || (!text.trim() && !voiceUrl && !mediaPreview) || !user) return;
    setIsSending(true);

    const tempId = `temp-${Date.now()}`;
    // FIX: isMine check for optimistic message - use user.id only
    const optimisticMsg: ThreadMessage = {
      id: tempId, sender_id: user.id, receiver_id: otherUserId!,
      content: text || (voiceUrl ? '🎤' : '📷'), created_at: new Date().toISOString(),
      is_read: null, category: message.category as MessageCategory, parent_id: getRootId(message),
      voice_url: voiceUrl || null, media_url: mediaPreview?.url || null,
      media_type: mediaPreview?.file.type.startsWith('video/') ? 'video' : mediaPreview ? 'image' : null,
      sender_role: role === 'manager' ? 'manager' : null,
      managed_celebrity_id: role === 'manager' && managedCelebrityId ? managedCelebrityId : null,
    };
    setSendingMsgId(tempId);
    setThread(prev => [...prev, optimisticMsg]);
    haptic('light');

    try {
      const rootId = getRootId(message);
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;

      if (mediaPreview) {
        const result = await uploadMedia(mediaPreview.file);
        if (result) { mediaUrl = result.url; mediaType = result.type; }
        URL.revokeObjectURL(mediaPreview.url);
        setMediaPreview(null);
      }

      // RELAXED VALIDATION: If message has a deal_id (from parent message or current message), skip inbox credit checks
      // Only enforce inbox limits for messages WITHOUT a deal_id (legacy direct messages)
      const currentDealId = message.deal_id;
      const shouldDeductCredit = isInactive && !currentDealId;

      if (shouldDeductCredit) {
        const { data: canReceive } = await supabase.rpc('can_receive_message', { _user_id: otherUserId!, _category: message.category as any });
        if (!canReceive) {
          toast.error(isRTL ? 'صندوق المستلم ممتلئ' : "Recipient's inbox is full");
          setThread(prev => prev.filter(m => m.id !== tempId));
          setIsSending(false); setSendingMsgId(null);
          return;
        }
      }

      let finalCategory = message.category;
      if (shouldDeductCredit && text.trim()) {
        try {
          const { data: classData } = await supabase.functions.invoke('classify-message', {
            body: { content: text, senderId: user.id, receiverId: otherUserId },
          });
          // If blocked by spam/toxicity/filter, silently drop (sender never knows)
          if (classData?.blocked) {
            toast.success(isRTL ? 'تم الإرسال' : 'Sent');
            setThread(prev => prev.filter(m => m.id !== tempId));
            setReplyContent('');
            setIsSending(false); setSendingMsgId(null);
            return;
          }
          if (classData?.category && classData.category === 'work') finalCategory = classData.category;
        } catch { /* keep */ }
      }

      const contentToSend = text || (mediaType === 'video' ? '🎥' : mediaType === 'image' ? '📷' : '🎤');
      const enc = await encryptForRecipient(contentToSend, otherUserId!);
      if (!enc.success) {
        // Gracefully handle missing encryption keys - send unencrypted instead of blocking
        console.warn('Encryption failed, sending unencrypted:', enc.error);
      }
      const encryptedContent = enc.success ? enc.payload : contentToSend;

      // FIX: Always use user.id as sender_id (agent's own identity for E2E encryption)
      // Add metadata fields: sender_role and managed_celebrity_id
      const senderRole = role === 'manager' ? 'manager' : null;
      const managedCelebrityIdField = role === 'manager' && managedCelebrityId ? managedCelebrityId : null;
      
      // FIX: Determine receiver_id: the other party
      // If manager sending as celebrity -> receiver is the company who sent the deal
      let receiverId = otherUserId!;
      if (role === 'manager' && managedCelebrityId && message.deal_id) {
        // Manager sending as celebrity -> receiver is the company who sent the deal
        // We need to fetch the deal to get sender_id
        const { data: dealData } = await supabase
          .from('deal_cards')
          .select('sender_id')
          .eq('id', message.deal_id)
          .single();
        if (dealData) receiverId = dealData.sender_id;
      }

      // Calculate expires_at based on disappear timer
      let expiresAt: string | null = null;
      if (disappearTimer) {
        expiresAt = new Date(Date.now() + disappearTimer).toISOString();
      }

      // Insert message with category 'work' and parent_id pointing to conversation root
      // Include deal_id and celebrity_id from the deal
      // Use .select().single() to get the inserted message back with its ID
      const { data: insertedMsg, error } = await supabase.from('messages').insert({
        sender_id: user.id, // Always use agent's own user.id
        receiver_id: receiverId,
        content: encryptedContent,
        voice_url: voiceUrl || null,
        media_url: mediaUrl,
        media_type: mediaType,
        category: finalCategory,
        parent_id: rootId,
        expires_at: expiresAt,
        deal_id: message.deal_id, // Preserve deal_id from parent message
        sender_role: senderRole,
        managed_celebrity_id: managedCelebrityIdField,
      } as any).select().single();
      if (error) throw error;

      // Cache the plaintext for our own message using the database-generated ID
      if (insertedMsg?.id) {
        await storeOwnMessagePlaintext(insertedMsg.id, contentToSend);
      }

      // Push notification (fire and forget) - use agent's own display name for managers
      let senderName = '';
      if (role === 'manager') {
        // Fetch agent's own profile for notification
        const { data: agentProfile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .single();
        senderName = agentProfile?.display_name || 'Someone';
      } else {
        const { data: senderProfile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
        senderName = senderProfile?.display_name || 'Someone';
      }
      
      supabase.functions.invoke('send-push-notification', {
        body: { receiverId: receiverId, senderName: senderName, messageType: voiceUrl ? 'voice' : mediaType || 'text', content: text },
      }).catch(() => {});

      setReplyContent('');
      setShowVoice(false);
      haptic('medium');
      // Immediately refresh thread so sender sees their message instantly
      await loadThread();
      setSendingMsgId(null);
      onMessageRead?.();
    } catch (error) {
      console.error('Reply error:', error);
      toast.error(isRTL ? 'فشل الإرسال' : 'Send failed');
      setThread(prev => prev.filter(m => m.id !== tempId));
      setSendingMsgId(null);
    } finally {
      setIsSending(false);
    }
  };

  // Edit message
  const handleEditMessage = async (msgId: string) => {
    if (!editContent.trim()) return;
    try {
      const enc = await encryptForRecipient(editContent, otherUserId!);
      if (!enc.success) {
        toast.error(isRTL ? 'تعذّر التشفير' : 'Encryption failed');
        return;
      }
      await supabase.from('messages').update({
        content: enc.payload, is_edited: true, edited_at: new Date().toISOString(),
      }).eq('id', msgId);
      setEditingMsg(null);
      setEditContent('');
      await loadThread();
      toast.success(isRTL ? 'تم تعديل الرسالة' : 'Message edited');
    } catch {
      toast.error(isRTL ? 'فشل التعديل' : 'Edit failed');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const file = files[0];
    if (file.size > 25 * 1024 * 1024) { toast.error(isRTL ? 'الحد الأقصى 25 ميغابايت' : 'Max 25MB'); return; }
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { toast.error(isRTL ? 'صور وفيديوهات فقط' : 'Images and videos only'); return; }
    setMediaPreview({ file, url: URL.createObjectURL(file) });
  };

  const toggleReaction = async (messageId: string, reaction: string) => {
    if (!user) return;
    const existing = reactions.find(r => r.message_id === messageId && r.user_id === user.id && r.reaction === reaction);
    if (existing) {
      await supabase.from('message_reactions').delete().eq('id', existing.id);
      setReactions(prev => prev.filter(r => r.id !== existing.id));
    } else {
      const { data } = await supabase.from('message_reactions').insert({ message_id: messageId, user_id: user.id, reaction } as any).select().single();
      if (data) setReactions(prev => [...prev, data as Reaction]);
    }
    haptic('light');
    setShowReactions(null);
  };

  // Improved swipe — controlled with spring back
  const handleSwipe = (msgId: string, info: PanInfo, isMine: boolean) => {
    const threshold = 50;
    if (Math.abs(info.offset.x) < threshold) return;
    
    // Swipe right (LTR) or left (RTL) = reply
    const isReplySwipe = (!isRTL && info.offset.x > threshold) || (isRTL && info.offset.x < -threshold);
    // Swipe left (LTR) or right (RTL) = delete
    const isDeleteSwipe = (!isRTL && info.offset.x < -threshold) || (isRTL && info.offset.x > threshold);
    
    if (isReplySwipe) {
      const msg = thread.find(m => m.id === msgId);
      if (msg) setReplyContent(`> ${msg.content?.substring(0, 50) || ''}\n`);
      haptic('light');
      inputRef.current?.focus();
    } else if (isDeleteSwipe && isMine) {
      const msg = thread.find(m => m.id === msgId);
      if (msg) setDeleteTarget({ id: msgId, isMine, createdAt: msg.created_at });
      haptic('medium');
    }
  };

  // Long press
  const handleTouchStart = (msgId: string, e: React.TouchEvent | React.MouseEvent) => {
    longPressTimer.current = setTimeout(() => {
      haptic('medium');
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setContextMenu({ msgId, x: rect.left, y: Math.max(rect.top - 160, 60) });
    }, 500);
  };
  const handleTouchEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };

  const copyMessage = (msgId: string) => {
    const msg = thread.find(m => m.id === msgId);
    if (msg?.content) { navigator.clipboard.writeText(msg.content); toast.success(isRTL ? 'تم النسخ' : 'Copied'); }
    setContextMenu(null);
  };

  const fmtTime = (d: string) => new Intl.DateTimeFormat(isRTL ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' }).format(new Date(d));

  if (!message) return null;
  if (activeCall) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Call screen component not available</p>
          <Button onClick={() => setActiveCall(null)} className="mt-4 h-11 rounded-xl">End Call</Button>
        </div>
      </div>
    );
  }

  const senderProfile = message.sender_profile;
  const otherName = senderProfile?.display_name || senderProfile?.username || (isRTL ? 'مجهول' : 'Unknown');

  const categoryBubbleClass = message.category === 'work'
    ? 'bg-[hsl(var(--work))] text-white'
    : 'bg-[hsl(var(--audience))] text-white';

  const t = (ar: string, en: string) => (isRTL ? ar : en);

  return (
    <>
    <Dialog open={isOpen} onOpenChange={() => { setContextMenu(null); onClose(); }}>
      <DialogContent className="w-full max-w-lg h-[100dvh] sm:h-[92vh] flex flex-col p-0 gap-0 sm:rounded-3xl rounded-none border-0 sm:border sm:border-primary/10">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border bg-card sm:rounded-t-3xl">
          <Button variant="ghost" size="icon" onClick={onClose} className="h-11 w-11 rounded-xl touch-feedback shrink-0">
            {isRTL ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
          </Button>
          <button
            onClick={() => { if (senderProfile?.username) { onClose(); navigate(`/@${senderProfile.username}`); } }}
            className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity"
          >
            <Avatar className="h-10 w-10 ring-2 ring-primary/10">
              <AvatarImage src={senderProfile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                {otherName[0] || <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
            <div className="text-start min-w-0">
              <p className="font-semibold text-base truncate leading-tight">{otherName}</p>
              {isTyping ? (
                <p className="text-xs text-primary font-medium animate-pulse">{isRTL ? 'يكتب...' : 'typing...'}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  {senderProfile?.username ? `@${senderProfile.username}` : ''}
                  <Shield className="h-3 w-3 text-emerald-500 inline" />
                  <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">E2E</span>
                </p>
              )}
              {/* Show agent badge in header when conversation partner is a manager */}
              {thread.some(m => m.sender_role === 'manager' && m.sender_id !== user.id && m.managed_celebrity_id) && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                    <UserCheck className="h-2.5 w-2.5" />
                    {t('وكيل مفوض', 'Authorized Agent')}
                  </span>
                  {thread.some(m => m.managed_celebrity_id) && (
                    <span className="text-[10px] text-muted-foreground">
                      {t('يمثل', 'represents')} {thread.find(m => m.managed_celebrity_id)?.managed_celebrity_id && managedCelebrityProfiles.get(thread.find(m => m.managed_celebrity_id)!.managed_celebrity_id!)?.display_name || '...'}
                    </span>
                  )}
                </div>
              )}
              {/* Deal status badge in header when deal is accepted */}
              {isDealAccepted && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                    <CheckCheck className="h-2.5 w-2.5" />
                    {t('تم قبول العرض', 'Deal Accepted')}
                  </span>
                </div>
              )}
            </div>
          </button>
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Disappearing messages toggle */}
            <Button variant="ghost" size="icon" onClick={() => setShowDisappear(!showDisappear)} className={cn("h-10 w-10 rounded-xl", disappearTimer && "text-primary")}>
              <Timer className="h-4 w-4" />
            </Button>
            {canCall && message.category === 'work' && (
              <>
                <Button variant="ghost" size="icon" onClick={() => setActiveCall({ type: 'audio' })} className="h-10 w-10 rounded-xl touch-feedback">
                  <Phone className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setActiveCall({ type: 'video' })} className="h-10 w-10 rounded-xl touch-feedback">
                  <Video className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={() => setShowBlockReport(true)} className="h-10 w-10 rounded-xl touch-feedback">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Pinned Deal Card - Persistent at top when deal is accepted */}
        {isDealAccepted && deal && (
          <div className="sticky top-0 z-10 border-b border-border/50 bg-card/95 backdrop-blur-sm">
            <DealCardInline 
              dealId={deal.id} 
              isRTL={isRTL} 
              onToggleDetails={() => setShowDealDetails(!showDealDetails)} 
              showDetails={showDealDetails} 
            />
            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mx-4" />
          </div>
        )}

        {/* Disappearing messages picker */}
        <AnimatePresence>
          {showDisappear && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-border bg-muted/30"
            >
              <div className="flex items-center justify-center gap-2 px-4 py-2.5">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t('رسائل مؤقتة:', 'Disappearing:')}</span>
                {DISAPPEAR_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => { setDisappearTimer(disappearTimer === opt.value ? null : opt.value); setShowDisappear(false); }}
                    className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors",
                      disappearTimer === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
                {disappearTimer && (
                  <button onClick={() => { setDisappearTimer(null); setShowDisappear(false); }}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive"
                  >
                    {t('إيقاف', 'Off')}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 1-hour inactivity notice */}
        {isInactive && thread.length > 0 && (
          <div className="mx-3 mt-2 flex items-center gap-2 p-2.5 rounded-xl bg-primary/5">
            <p className="text-[11px] text-muted-foreground">
              {t('مضت ساعة — رسالتك التالية ستُخصم من الرصيد', 'Over an hour — next message deducts a credit')}
            </p>
          </div>
        )}

        {/* Messages thread - full height like WhatsApp */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1" onClick={() => { setContextMenu(null); setShowReactions(null); }}
          style={{ backgroundImage: 'var(--gradient-hero)', backgroundSize: 'cover' }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {thread.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Send className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-muted-foreground text-base">{t('لا توجد رسائل بعد', 'No messages yet')}</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">{t('ابدأ المحادثة', 'Start the conversation')}</p>
                </div>
              )}
              
              {thread.map((msg, i) => {
                // FIX: isMine check - only check msg.sender_id === user.id (no managedCelebrityId condition)
                const isMine = msg.sender_id === user?.id;
                const showDateSep = i === 0 || dateSeparator(msg.created_at, isRTL) !== dateSeparator(thread[i - 1]?.created_at, isRTL);
                const isSendingThis = msg.id === sendingMsgId;
                const msgReactions = reactions.filter(r => r.message_id === msg.id);
                const canUnsend = isMine && (Date.now() - new Date(msg.created_at).getTime()) < UNSEND_WINDOW_MS;
                const canEdit = isMine && (Date.now() - new Date(msg.created_at).getTime()) < EDIT_WINDOW_MS && !msg.voice_url && !msg.media_url;

                // Check if message is from a manager (agent)
                const isFromManager = msg.sender_role === 'manager' && msg.managed_celebrity_id;
                const managedCelebrityName = isFromManager && msg.managed_celebrity_id 
                  ? managedCelebrityProfiles.get(msg.managed_celebrity_id)?.display_name 
                  : null;

                const readStatus = isMine ? (
                  isSendingThis ? (
                    <Check className="h-3 w-3 text-white/40" />
                  ) : msg.is_read ? (
                    <CheckCheck className={cn('h-3 w-3', message.category === 'work' ? 'text-blue-300' : 'text-white/70')} />
                  ) : (
                    <CheckCheck className="h-3 w-3 text-white/40" />
                  )
                ) : null;

                return (
                  <div key={msg.id}>
                    {showDateSep && (
                      <div className="text-center my-3">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] text-muted-foreground bg-card/80 backdrop-blur-sm font-medium">
                          {dateSeparator(msg.created_at, isRTL)}
                        </span>
                      </div>
                    )}
                    {/* Deal Card inline above first message of each deal_id group (only if not already pinned at top) */}
                    {msg.deal_id && !isDealAccepted && (
                      i === 0 || thread[i - 1]?.deal_id !== msg.deal_id
                    ) && (
                      <DealCardInline 
                        dealId={msg.deal_id} 
                        isRTL={isRTL} 
                        onToggleDetails={() => setShowDealDetails(!showDealDetails)} 
                        showDetails={showDealDetails} 
                      />
                    )}

                    {/* Editing mode */}
                    {editingMsg === msg.id ? (
                      <div className={cn('flex mb-1', isMine ? 'justify-end' : 'justify-start')}>
                        <div className="max-w-[80%] flex flex-col gap-1">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="text-sm p-2.5 rounded-xl border-2 border-primary bg-card resize-none min-h-[60px]"
                            autoFocus
                          />
                          <div className="flex gap-1.5 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setEditingMsg(null)} className="h-9 text-xs rounded-lg">
                              {t('إلغاء', 'Cancel')}
                            </Button>
                            <Button size="sm" onClick={() => handleEditMessage(msg.id)} className="h-9 text-xs rounded-lg">
                              {t('حفظ', 'Save')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <motion.div
                        drag="x"
                        dragConstraints={{ left: -60, right: 60 }}
                        dragElastic={0.15}
                        dragSnapToOrigin
                        onDragEnd={(_, info) => handleSwipe(msg.id, info, isMine)}
                        className={cn('flex mb-0.5', isMine ? 'justify-end' : 'justify-start')}
                        onTouchStart={(e) => handleTouchStart(msg.id, e)}
                        onTouchEnd={handleTouchEnd}
                        onMouseDown={(e) => handleTouchStart(msg.id, e)}
                        onMouseUp={handleTouchEnd}
                        onMouseLeave={handleTouchEnd}
                      >
                        <div className="relative max-w-[80%]">
                          <div className={cn(
                            'px-3 py-2 rounded-2xl text-[15px] leading-relaxed',
                            isSendingThis ? 'bg-muted text-muted-foreground'
                              : isMine ? `${categoryBubbleClass} rounded-ee-sm` : 'bg-card border border-border rounded-es-sm'
                          )}>
                            {/* Deal context label for messages in a deal thread */}
                            {msg.deal_id && !isDealAccepted && (
                              <div className="absolute -top-2 left-3 right-3 -mx-3 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-t-xl text-[10px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                <Briefcase className="h-3 w-3" />
                                {t('بخصوص هذا العرض', 'Regarding this deal')}
                              </div>
                            )}
                            
                            {/* Agent badge for messages from managers */}
                            {!isMine && isFromManager && (
                              <div className="mb-1.5 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                  <ShieldCheck className="h-2.5 w-2.5" />
                                  {t('وكيل مفوض', 'Authorized Agent')}
                                </span>
                                {managedCelebrityName && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {t('يمثل', 'represents')} {managedCelebrityName}
                                  </span>
                                )}
                              </div>
                            )}
                            {/* Disappearing message indicator */}
                            {msg.expires_at && (
                              <div className={cn("flex items-center gap-1 mb-1", isMine ? "text-white/50" : "text-muted-foreground")}>
                                <Timer className="h-3 w-3" />
                                <span className="text-[10px]">{t('مؤقتة', 'Disappearing')}</span>
                              </div>
                            )}
                            {msg.media_url && msg.media_type === 'image' && (
                              <img src={msg.media_url} alt="" className="rounded-xl max-w-full mb-1.5 cursor-pointer" onClick={() => window.open(msg.media_url!, '_blank')} />
                            )}
                            {msg.media_url && msg.media_type === 'video' && (
                              <video src={msg.media_url} controls className="rounded-xl max-w-full mb-1.5" />
                            )}
                            {msg.voice_url ? (
                              <div className="flex items-center gap-2 p-2 bg-background/50 rounded-xl">
                                <Mic className="h-5 w-5 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">{t('رسالة صوتية', 'Voice message')}</span>
                              </div>
                            ) : msg.content && !['📷', '🎥', '🎤'].includes(msg.content) ? (
                              <p className="whitespace-pre-wrap">
                                {msg._decryptionFailed ? (
                                  <span className="flex items-center gap-1.5 text-muted-foreground/60 italic text-sm">
                                    <Info className="h-3.5 w-3.5 flex-shrink-0" />
                                    {msg.content}
                                  </span>
                                ) : msg.content}
                              </p>
                            ) : null}
                            <div className={cn('flex items-center gap-1 mt-0.5', isMine ? 'justify-end' : '')}>
                              {msg.is_edited && (
                                <span className={cn('text-[10px] italic', isMine ? 'text-white/50' : 'text-muted-foreground')}>
                                  {t('معدّلة', 'Edited')}
                                </span>
                              )}
                              <span className={cn('text-[10px]', isMine ? 'text-white/50' : 'text-muted-foreground')}>
                                {fmtTime(msg.created_at)}
                              </span>
                              {readStatus}
                            </div>
                          </div>

                          {/* Reactions */}
                          {msgReactions.length > 0 && (
                            <div className={cn('flex gap-0.5 mt-0.5', isMine ? 'justify-end' : 'justify-start')}>
                              {[...new Set(msgReactions.map(r => r.reaction))].map(emoji => {
                                const count = msgReactions.filter(r => r.reaction === emoji).length;
                                return (
                                  <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)}
                                    className="px-1.5 py-0.5 rounded-full bg-card/80 border border-border text-xs flex items-center gap-0.5"
                                  >
                                    {emoji}{count > 1 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Reaction picker */}
                          <AnimatePresence>
                            {showReactions === msg.id && (
                              <motion.div initial={{ opacity: 0, scale: 0.8, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}
                                className={cn('absolute -top-10 flex gap-1 bg-card rounded-full shadow-lg border border-border px-2 py-1 z-50', isMine ? 'end-0' : 'start-0')}
                              >
                                {REACTIONS.map(emoji => (
                                  <button key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, emoji); }}
                                    className="text-lg hover:scale-125 transition-transform p-0.5"
                                  >{emoji}</button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </>
          )}
          {/* Typing indicator */}
          {isTyping && (
            <div className="flex justify-start mb-1">
              <div className="px-3 py-2 rounded-2xl rounded-es-sm bg-card border border-border">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Context menu */}
        <AnimatePresence>
          {contextMenu && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="fixed z-[100] bg-card rounded-2xl shadow-xl border border-border py-1.5 min-w-[170px]"
              style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: contextMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => { setShowReactions(contextMenu.msgId); setContextMenu(null); }} className="w-full px-4 py-2 text-sm text-start hover:bg-muted flex items-center gap-3">
                <span>❤️</span> {t('تفاعل', 'React')}
              </button>
              <button onClick={() => { setReplyContent(`> ${thread.find(m => m.id === contextMenu.msgId)?.content?.substring(0, 50) || ''}\n`); setContextMenu(null); inputRef.current?.focus(); }} className="w-full px-4 py-2 text-sm text-start hover:bg-muted flex items-center gap-3">
                <Reply className="h-4 w-4" /> {t('رد', 'Reply')}
              </button>
              <button onClick={() => copyMessage(contextMenu.msgId)} className="w-full px-4 py-2 text-sm text-start hover:bg-muted flex items-center gap-3">
                <Copy className="h-4 w-4" /> {t('نسخ', 'Copy')}
              </button>
              {/* Edit option */}
              {(() => {
                const msg = thread.find(m => m.id === contextMenu.msgId);
                if (msg && msg.sender_id === user?.id && (Date.now() - new Date(msg.created_at).getTime()) < EDIT_WINDOW_MS && !msg.voice_url) {
                  return (
                    <button onClick={() => { setEditingMsg(msg.id); setEditContent(msg.content); setContextMenu(null); }} className="w-full px-4 py-2 text-sm text-start hover:bg-muted flex items-center gap-3">
                      <Pencil className="h-4 w-4" /> {t('تعديل', 'Edit')}
                    </button>
                  );
                }
                return null;
              })()}
              <div className="h-px bg-border mx-3 my-1" />
              <button onClick={() => {
                const msg = thread.find(m => m.id === contextMenu.msgId);
                if (msg) setDeleteTarget({ id: msg.id, isMine: msg.sender_id === user?.id, createdAt: msg.created_at });
                setContextMenu(null);
              }} className="w-full px-4 py-2 text-sm text-start hover:bg-muted flex items-center gap-3 text-destructive">
                <X className="h-4 w-4" /> {t('حذف', 'Delete')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Media preview */}
        {mediaPreview && (
          <div className="mx-3 mb-1 relative">
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

        {/* Disappearing timer indicator */}
        {disappearTimer && (
          <div className="flex items-center justify-center gap-1.5 py-1 bg-primary/5">
            <Timer className="h-3 w-3 text-primary" />
            <span className="text-[11px] text-primary font-medium">
              {t('الرسائل المؤقتة مفعّلة', 'Disappearing messages on')} — {DISAPPEAR_OPTIONS.find(o => o.value === disappearTimer)?.label}
            </span>
          </div>
        )}

        {/* Reply area - WhatsApp style at BOTTOM */}
        <div className="shrink-0 border-t border-border px-2 py-2 bg-card sm:rounded-b-3xl fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFileSelect} className="hidden" />
          {showVoice ? (
            <div className="flex items-center gap-2 p-4 bg-muted/30 rounded-xl">
              <Mic className="h-6 w-6 text-primary" />
              <span className="text-sm text-muted-foreground">{t('تسجيل صوتي غير متاح', 'Voice recording not available')}</span>
              <Button variant="ghost" size="icon" onClick={() => setShowVoice(false)} className="ml-auto">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-end gap-1.5">
              <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className="h-10 w-10 rounded-full shrink-0">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              </Button>
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  placeholder={t('اكتب رسالة...', 'Message...')}
                  value={replyContent}
                  onChange={(e) => { setReplyContent(e.target.value); broadcastTyping(); }}
                  rows={1}
                  className="w-full resize-none text-[15px] rounded-2xl border border-border bg-muted/30 px-4 py-2.5 min-h-11 max-h-28 focus:outline-none focus:border-primary transition-colors"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(replyContent); } }}
                />
              </div>
              {replyContent.trim() || mediaPreview ? (
                <Button onClick={() => handleSendReply(replyContent)} disabled={isSending} size="icon" className="h-10 w-10 rounded-full shrink-0 touch-feedback">
                  {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </Button>
              ) : (
                <Button variant="ghost" size="icon" onClick={() => setShowVoice(true)} className="h-10 w-10 rounded-full shrink-0 touch-feedback">
                  <Mic className="h-5 w-5 text-muted-foreground" />
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Delete dialog */}
    <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('حذف الرسالة', 'Delete message')}</AlertDialogTitle>
          <AlertDialogDescription>{t('كيف تريد حذف هذه الرسالة؟', 'How do you want to delete this message?')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          {deleteTarget?.isMine && (Date.now() - new Date(deleteTarget.createdAt).getTime()) < UNSEND_WINDOW_MS && (
            <AlertDialogAction onClick={async () => {
              await supabase.from('messages').delete().eq('id', deleteTarget.id);
              setThread(prev => prev.filter(m => m.id !== deleteTarget.id));
              setDeleteTarget(null); toast.success(t('تم الحذف للجميع', 'Deleted for everyone'));
            }} className="bg-destructive text-destructive-foreground rounded-xl">
              {t('حذف للجميع', 'Delete for everyone')}
            </AlertDialogAction>
          )}
          <AlertDialogAction onClick={async () => {
            await supabase.from('deleted_messages').insert({ user_id: user!.id, message_id: deleteTarget!.id } as any);
            setDeletedIds(prev => new Set([...prev, deleteTarget!.id]));
            setThread(prev => prev.filter(m => m.id !== deleteTarget!.id));
            setDeleteTarget(null); toast.success(t('تم الحذف', 'Deleted'));
          }} className="rounded-xl">
            {t('حذف لي فقط', 'Delete for me')}
          </AlertDialogAction>
          <AlertDialogCancel className="rounded-xl">{t('إلغاء', 'Cancel')}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {showBlockReport && message && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
        <div className="bg-card rounded-2xl max-w-md w-full mx-4 p-6">
          <h3 className="font-semibold text-lg mb-4">{t('حظر/إبلاغ', 'Block/Report')}</h3>
          <p className="text-muted-foreground mb-6">{t('ميزة الحظر والإبلاغ غير متاحة حالياً', 'Block/Report feature not available')}</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowBlockReport(false)} className="h-11 rounded-xl">{t('إلغاء', 'Cancel')}</Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
