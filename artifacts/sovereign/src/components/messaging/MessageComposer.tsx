import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Send, Loader2, User, Mic, Image as ImageIcon, X, Shield, Briefcase } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { encryptForRecipient } from '@/utils/e2eManager';

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
}

interface MessageComposerProps {
  isOpen: boolean;
  onClose: () => void;
  recipient: Profile | null;
  onMessageSent?: () => void;
  dealId?: string | null; // Added dealId prop for deal card reference
  dealTitle?: string | null; // Added dealTitle for display context
}

export default function MessageComposer({ 
  isOpen, 
  onClose, 
  recipient: initialRecipient, 
  onMessageSent,
  dealId,
  dealTitle
}: MessageComposerProps) {
  const { isRTL } = useLanguage();
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ file: File; url: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [recipient, setRecipient] = useState<Profile | null>(initialRecipient);

  useEffect(() => {
    setRecipient(initialRecipient);
  }, [initialRecipient]);

  useEffect(() => {
    if (!isOpen) {
      setContent('');
      setMediaPreview(null);
    }
  }, [isOpen]);

  const uploadMedia = async (file: File): Promise<{ url: string; type: string } | null> => {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    const ext = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('media-messages').upload(fileName, file);
    if (error) return null;
    const { data: urlData } = supabase.storage.from('media-messages').getPublicUrl(fileName);
    return { url: urlData.publicUrl, type: file.type.startsWith('video/') ? 'video' : 'image' };
  };

  const sendMessage = async (text: string) => {
    if (!recipient || (!text.trim() && !mediaPreview)) return;
    setIsSending(true);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const senderId = auth.user?.id;
      if (!senderId) throw new Error('Not authenticated');

      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(30);

      let mediaUrl: string | null = null;
      let mediaType: string | null = null;
      if (mediaPreview) {
        const result = await uploadMedia(mediaPreview.file);
        if (result) { mediaUrl = result.url; mediaType = result.type; }
        URL.revokeObjectURL(mediaPreview.url);
        setMediaPreview(null);
      }

      // Only 'work' category is allowed
      const category = 'work';

      // Conversation root logic: find oldest root message (parent_id null) between the two users for 'work' category
      // This ensures each pair of users has exactly ONE work conversation
      let parentId: string | null = null;
      const { data: rootMsg } = await supabase
        .from('messages')
        .select('id')
        .is('parent_id', null)
        .eq('category', 'work')
        .or(`and(sender_id.eq.${senderId},receiver_id.eq.${recipient.id}),and(sender_id.eq.${recipient.id},receiver_id.eq.${senderId})`)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (rootMsg) {
        parentId = rootMsg.id;
      }

      // RELAXED VALIDATION: If message has a dealId, skip inbox mode/limit checks entirely
      // Only validate inbox mode for messages WITHOUT a dealId (legacy direct messages)
      let shouldDeductCredit = true;

      if (parentId) {
        // Check last message time in this conversation thread
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('created_at')
          .or(`id.eq.${parentId},parent_id.eq.${parentId}`)
          .order('created_at', { ascending: false })
          .limit(1);

        const lastTime = lastMsg?.[0]?.created_at;
        if (lastTime) {
          const hoursSince = (Date.now() - new Date(lastTime).getTime()) / 3600000;
          if (hoursSince < 1) {
            shouldDeductCredit = false;
          }
        }
      }

      // Only check inbox mode/limits if NO dealId is present (legacy behavior)
      // Messages with dealId are ALWAYS allowed regardless of inbox settings
      if (shouldDeductCredit && !dealId) {
        // Check recipient inbox mode (closed / limited) for 'work' category
        const { data: limitRow } = await supabase
          .from('message_limits')
          .select('inbox_mode, max_messages')
          .eq('user_id', recipient.id)
          .eq('category', 'work')
          .maybeSingle();

        if (limitRow?.inbox_mode === 'closed' || limitRow?.max_messages === 0) {
          toast.error(
            isRTL
              ? 'لم تصل رسالتك — المستلم أغلق صندوق العمل.'
              : 'Your message was not delivered — recipient closed their work inbox.',
            { duration: 5000 }
          );
          setIsSending(false);
          return;
        }

        // Skip can_receive check if unlimited
        if (limitRow?.inbox_mode !== 'unlimited') {
          const { data: canReceive } = await supabase.rpc('can_receive_message', {
            _user_id: recipient.id, _category: 'work',
          });
          if (!canReceive) {
            toast.error(isRTL ? 'صندوق المستلم ممتلئ' : "Recipient's inbox is full. They need to increase their limit.");
            setIsSending(false);
            return;
          }
        }
      }

      // Encrypt the message content — encryption MUST succeed, no unencrypted fallback
      const contentToSend = text || (mediaType === 'video' ? '🎥' : mediaType === 'image' ? '📷' : '');
      const enc = await encryptForRecipient(contentToSend, recipient.id);
      if (!enc.success) {
        // Encryption failed — block sending with clear error (no silent plaintext fallback)
        const errorMsg = enc.reason === 'recipient_no_e2e'
          ? (isRTL ? 'المستلم غير جاهز للتشيفر — يرجى المحاولة لاحقاً' : 'Recipient not ready for encryption — please try again later')
          : enc.reason === 'no_local_keys'
            ? (isRTL ? 'مفاتيحك غير مهيأة — أعد تسجيل الدخول' : 'Your keys not initialized — please re-login')
            : (isRTL ? 'تعذّر التشفير — لم يتم الإرسال' : 'Encryption failed — message not sent');
        toast.error(errorMsg, { duration: 5000 });
        setIsSending(false);
        return;
      }
      const encryptedContent = enc.payload;

      // Insert message with deal_id reference if provided
      const { data: insertedMsg, error } = await supabase.from('messages').insert({
        sender_id: senderId,
        receiver_id: recipient.id,
        content: encryptedContent,
        voice_url: null,
        media_url: mediaUrl,
        media_type: mediaType,
        category,
        parent_id: parentId,
        deal_id: dealId, // Include deal_id for threading under specific deal card
      } as any).select('id').single();
      if (error) throw error;

      // Push notification with conversationId
      const { data: senderProfile } = await supabase.from('profiles').select('display_name').eq('id', senderId).single();
      const notificationType = mediaType ? mediaType : 'work_message';
      
      supabase.functions.invoke('send-push-notification', {
        body: {
          receiverId: recipient.id,
          senderName: senderProfile?.display_name || 'Someone',
          messageType: mediaType || 'text',
          content: text,
          notificationType,
          conversationId: insertedMsg?.id || null,
          senderId,
          dealId: dealId, // Include dealId in notification
        },
      }).catch(() => {});

      toast.success(isRTL ? 'تم الإرسال ✨' : 'Sent ✨');
      setContent('');
      onClose();
      onMessageSent?.();
    } catch (error) {
      console.error('Send error:', error);
      toast.error(isRTL ? 'فشل الإرسال' : 'Send failed');
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { toast.error(isRTL ? 'الحد الأقصى 25 ميغابايت' : 'Max 25MB'); return; }
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { toast.error(isRTL ? 'صور وفيديوهات فقط' : 'Images and videos only'); return; }
    setMediaPreview({ file, url: URL.createObjectURL(file) });
  };

  // If no recipient is provided, show nothing (component should only be used with a recipient)
  if (!recipient) {
    return null;
  }

  const t = (ar: string, en: string) => (isRTL ? ar : en);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-3xl p-0 gap-0 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <DialogHeader className="p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-lg font-bold flex-1 truncate">
              {dealId ? t('سؤال حول العرض', 'Question about Deal') : t('رسالة عمل جديدة', 'New Work Message')}
            </DialogTitle>
          </div>
          {/* Deal card context indicator */}
          {dealId && dealTitle && (
            <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                <Briefcase className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  {t('بطاقة العرض', 'Deal Card')}
                </p>
                <p className="font-medium text-foreground truncate text-sm">
                  {dealTitle}
                </p>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* Recipient preview card */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/50 relative">
            <Avatar className="h-12 w-12 ring-2 ring-primary/10">
              <AvatarImage src={recipient.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {recipient.display_name?.[0] || <User className="h-5 w-5" />}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base truncate">{recipient.display_name || recipient.username}</p>
              {recipient.username && <p className="text-sm text-muted-foreground">@{recipient.username}</p>}
            </div>
          </div>

          {/* Message composition */}
          <Textarea
            placeholder={dealId ? t('اكتب سؤالك حول هذا العرض...', 'Write your question about this deal...') : t('اكتب رسالتك...', 'Write your message...')}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="resize-none text-base rounded-xl border-2 focus:border-primary p-4"
            autoFocus
          />

          {mediaPreview && (
            <div className="relative inline-block">
              {mediaPreview.file.type.startsWith('video/') ? (
                <video src={mediaPreview.url} className="h-24 rounded-xl" />
              ) : (
                <img src={mediaPreview.url} className="h-24 rounded-xl object-cover" alt="" />
              )}
              <Button size="icon" variant="destructive" className="absolute top-1 end-1 h-6 w-6 rounded-full" onClick={() => { URL.revokeObjectURL(mediaPreview.url); setMediaPreview(null); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />

          <div className="flex gap-3">
            <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} className="h-13 w-13 rounded-xl touch-feedback">
              <ImageIcon className="h-5 w-5" />
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1 h-13 text-base rounded-xl touch-feedback">
              {t('إلغاء', 'Cancel')}
            </Button>
            {/* Send button - ALWAYS VISIBLE, only disabled when no content can be sent */}
            <Button
              onClick={() => sendMessage(content)}
              disabled={(!content.trim() && !mediaPreview) || isSending}
              className="flex-1 h-13 text-base rounded-xl touch-feedback bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Send className="h-5 w-5 me-2" />
                  {dealId ? t('إرسال السؤال', 'Send Question') : t('إرسال', 'Send')}
                </>
              )}
            </Button>
          </div>

          {/* E2E badge */}
          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
            <Shield className="h-3 w-3 text-emerald-500" />
            {t('مشفّر من طرف إلى طرف', 'End-to-end encrypted')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
