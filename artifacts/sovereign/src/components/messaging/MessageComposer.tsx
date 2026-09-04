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
import { Send, Loader2, User, Mic, Image as ImageIcon, X, Shield, Briefcase, AlertCircle, ShieldCheck, UserCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { encryptForRecipient, ensureUserE2EReady } from '@/utils/e2eManager';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';

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
  const { user } = useAuth();
  const { role, managedCelebrityId } = useRole();
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ file: File; url: string } | null>(null);
  const [recipientReady, setRecipientReady] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [recipient, setRecipient] = useState<Profile | null>(initialRecipient);

  useEffect(() => {
    setRecipient(initialRecipient);
  }, [initialRecipient]);

  useEffect(() => {
    if (!isOpen) {
      setContent('');
      setMediaPreview(null);
      setRecipientReady(null);
    }
  }, [isOpen]);

  // Check recipient E2E readiness when recipient changes or dialog opens
  useEffect(() => {
    if (isOpen && recipient) {
      const checkReady = async () => {
        const ready = await ensureUserE2EReady(recipient.id);
        setRecipientReady(ready);
      };
      checkReady();
    }
  }, [isOpen, recipient]);

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
    
    // Early check: recipient must have E2E keys
    if (recipientReady === false) {
      toast.error(
        isRTL
          ? 'Le destinataire n\'a pas encore configuré le chiffrement. Il doit se connecter une fois pour initialiser ses clés.'
          : 'Recipient has not set up encryption yet. They need to log in once to initialize their keys.',
        { duration: 7000 }
      );
      return;
    }
    
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
      
      // Build sender/receiver filter using only user.id (not managedCelebrityId)
      const senderIds = [senderId];
      const receiverIds = [senderId];
      
      const { data: rootMsg } = await supabase
        .from('messages')
        .select('id')
        .is('parent_id', null)
        .eq('category', 'work')
        .or(
          senderIds.map(sid => 
            receiverIds.map(rid => `and(sender_id.eq.${sid},receiver_id.eq.${rid})`).join(',')
          ).join(',')
        )
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
        let errorMsg = '';
        if (enc.reason === 'recipient_no_e2e') {
          errorMsg = isRTL
            ? 'Le destinataire n\'a pas de clés de chiffrement. Il doit se connecter à l\'application pour initialiser son chiffrement de bout en bout.'
            : 'Recipient has no encryption keys. They need to log into the app to initialize their end-to-end encryption.';
        } else if (enc.reason === 'no_local_keys') {
          errorMsg = isRTL
            ? 'Vos clés de chiffrement ne sont pas initialisées. Veuillez vous déconnecter et vous reconnecter.'
            : 'Your encryption keys are not initialized. Please log out and log back in.';
        } else {
          errorMsg = isRTL ? 'تعذّر التشفير — لم يتم الإرسال' : 'Encryption failed — message not sent';
        }
        toast.error(errorMsg, { duration: 7000 });
        setIsSending(false);
        return;
      }
      const encryptedContent = enc.payload;

      // FIX: Always use user.id as sender_id (agent's own identity for E2E encryption)
      // Add metadata fields: sender_role and managed_celebrity_id
      const senderRole = role === 'manager' ? 'manager' : null;
      const managedCelebrityIdField = role === 'manager' && managedCelebrityId ? managedCelebrityId : null;
      
      // Insert message with deal_id reference if provided
      const { data: insertedMsg, error } = await supabase.from('messages').insert({
        sender_id: senderId, // Always use agent's own user.id
        receiver_id: recipient.id,
        content: encryptedContent,
        voice_url: null,
        media_url: mediaUrl,
        media_type: mediaType,
        category,
        parent_id: parentId,
        deal_id: dealId, // Include deal_id for threading under specific deal card
        sender_role: senderRole,
        managed_celebrity_id: managedCelebrityIdField,
      } as any).select('id').single();
      if (error) throw error;

      // Push notification with conversationId - use agent's own display name for managers
      let senderName = '';
      if (role === 'manager') {
        // Fetch agent's own profile for notification
        const { data: agentProfile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', senderId)
          .single();
        senderName = agentProfile?.display_name || 'Someone';
      } else {
        const { data: senderProfile } = await supabase.from('profiles').select('display_name').eq('id', senderId).single();
        senderName = senderProfile?.display_name || 'Someone';
      }
      
      const notificationType = mediaType ? mediaType : 'work_message';
      
      supabase.functions.invoke('send-push-notification', {
        body: {
          receiverId: recipient.id,
          senderName: senderName,
          messageType: mediaType || 'text',
          content: text,
          notificationType,
          conversationId: insertedMsg?.id || null,
          senderId: senderId,
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
            {/* E2E readiness indicator */}
            {recipientReady === false && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-full">
                <AlertCircle className="h-3 w-3" />
                <span>{isRTL ? 'Chiffrement non prêt' : 'Encryption not ready'}</span>
              </div>
            )}
            {recipientReady === true && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-full">
                <Shield className="h-3 w-3" />
                <span>{isRTL ? 'Prêt pour E2E' : 'E2E Ready'}</span>
              </div>
            )}
          </div>

          {/* Message composition */}
          <Textarea
            placeholder={dealId ? t('اكتب سؤالك حول هذا العرض...', 'Write your question about this deal...') : t('اكتب رسالتك...', 'Write your message...')}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="resize-none text-base rounded-xl border-2 focus:border-primary p-4"
            autoFocus
            disabled={recipientReady === false}
          />

          {recipientReady === false && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
              {isRTL
                ? 'Le destinataire doit se connecter une fois pour activer le chiffrement de bout en bout.'
                : 'Recipient must log in once to activate end-to-end encryption.'}
            </p>
          )}

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
            <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} className="h-13 w-13 rounded-xl touch-feedback" disabled={recipientReady === false}>
              <ImageIcon className="h-5 w-5" />
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1 h-13 text-base rounded-xl touch-feedback">
              {t('إلغاء', 'Cancel')}
            </Button>
            {/* Send button - ALWAYS VISIBLE, only disabled when no content can be sent or recipient not ready */}
            <Button
              onClick={() => sendMessage(content)}
              disabled={(!content.trim() && !mediaPreview) || isSending || recipientReady === false}
              className="flex-1 h-13 text-base rounded-xl touch-feedback bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
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
