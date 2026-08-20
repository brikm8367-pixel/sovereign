import { useState, useEffect } from 'react';
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
import { Send, Loader2, User, Zap, ArrowLeft, ArrowRight, Briefcase, DollarSign, Calendar, FileText, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Message, MessageCategory } from './InboxSection';

interface DealCard {
  id: string;
  deal_type: string | null;
  company_name: string | null;
  budget_range: string | null;
  budget_cycle: string | null;
  timeline: string | null;
  details: string | null;
  exclusivity: string | null;
  deliverables: string | null;
  why_them: string | null;
  status: string;
}

interface MessageViewerProps {
  message: Message | null;
  isOpen: boolean;
  onClose: () => void;
  onMessageRead?: () => void;
}

export function MessageViewer({
  message,
  isOpen,
  onClose,
  onMessageRead,
}: MessageViewerProps) {
  const { isRTL } = useLanguage();
  const [replyContent, setReplyContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [thread, setThread] = useState<Message[]>([]);
  const [deal, setDeal] = useState<DealCard | null>(null);
  const [isLoadingDeal, setIsLoadingDeal] = useState(false);

  // Check if message is a deal card (work category or contains deal keywords)
  const isDealMessage = message && (
    message.category === 'work' ||
    message.content.toLowerCase().includes('deal') ||
    message.subject?.toLowerCase().includes('deal')
  );

  // Mark as read when opened
  useEffect(() => {
    const markAsRead = async () => {
      if (message && !message.is_read) {
        await supabase
          .from('messages')
          .update({ is_read: true })
          .eq('id', message.id);
        onMessageRead?.();
      }
    };

    if (isOpen && message) {
      markAsRead();
      // Load thread
      loadThread();
    }
  }, [isOpen, message?.id]);

  // Fetch associated deal card
  useEffect(() => {
    const fetchDeal = async () => {
      if (!message) return;
      
      setIsLoadingDeal(true);
      try {
        const { data, error } = await supabase
          .from('deal_cards')
          .select('id, deal_type, company_name, budget_range, budget_cycle, timeline, details, exclusivity, deliverables, why_them, status')
          .eq('message_id', message.id)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        setDeal(data as DealCard | null);
      } catch (error) {
        console.error('Error fetching deal:', error);
        setDeal(null);
      } finally {
        setIsLoadingDeal(false);
      }
    };

    if (message) {
      fetchDeal();
    }
  }, [message?.id]);

  const loadThread = async () => {
    if (!message) return;
    
    // For now, just show the current message
    // In future, load parent messages for a full thread
    setThread([message]);
  };

  const handleReply = async () => {
    if (!message || !replyContent.trim()) return;

    setIsSending(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('messages').insert({
        sender_id: user.user?.id,
        receiver_id: message.sender_id,
        subject: message.subject ? `Re: ${message.subject}` : null,
        content: replyContent,
        category: message.category,
        parent_id: message.id,
      });

      if (error) throw error;

      toast.success(isRTL ? 'تم إرسال الرد' : 'Reply sent');
      setReplyContent('');
    } catch (error) {
      console.error('Error sending reply:', error);
      toast.error(isRTL ? 'فشل إرسال الرد' : 'Failed to send reply');
    } finally {
      setIsSending(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(isRTL ? 'ar' : 'en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const categoryLabels = {
    work: { ar: 'العمل', en: 'Work' },
    audience: { ar: 'الجمهور', en: 'Audience' },
    direct: { ar: 'مباشر', en: 'Direct' },
  };

  const categoryColors = {
    work: 'bg-[hsl(var(--work))]',
    audience: 'bg-[hsl(var(--audience))]',
    direct: 'bg-[hsl(var(--others))]',
  };

  const t = (ar: string, en: string) => (isRTL ? ar : en);

  if (!message) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 rounded-3xl">
        {/* Header - Larger, clearer */}
        <DialogHeader className="shrink-0 p-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClose} 
              className="h-11 w-11 rounded-xl touch-feedback"
            >
              {isRTL ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
            </Button>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-bold truncate">
                {message.subject || t('رسالة', 'Message')}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn(
                  'text-sm px-3 py-1 rounded-full text-white font-medium',
                  categoryColors[message.category]
                )}>
                  {categoryLabels[message.category][isRTL ? 'ar' : 'en']}
                </span>
                {message.is_important && (
                  <span className="text-sm px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 font-medium flex items-center gap-1">
                    <Zap className="h-4 w-4" />
                    {t('مهم', 'Important')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Sender info - Larger, more prominent */}
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/50">
            <Avatar className="h-14 w-14 ring-2 ring-primary/10">
              <AvatarImage src={message.sender_profile?.avatar_url || undefined} />
              <AvatarFallback className="text-lg bg-primary/10 text-primary">
                {message.sender_profile?.display_name?.[0] || <User className="h-6 w-6" />}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-lg text-foreground">
                {message.sender_profile?.display_name || message.sender_profile?.username}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatDate(message.created_at)}
              </p>
            </div>
          </div>

          {/* Pinned Deal Card - if deal exists */}
          {deal && (
            <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                  <Briefcase className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-foreground">
                    {t('بطاقة عرض', 'Deal Card')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('عرض احترافي مرسل', 'Professional offer sent')}
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-amber-200 dark:border-amber-800">
                {deal.deal_type && (
                  <div className="flex items-center gap-3 p-3 bg-background/50 rounded-xl">
                    <div className="p-2 bg-primary/10 rounded-full">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {t('نوع العرض', 'Deal Type')}
                      </p>
                      <p className="font-medium text-foreground truncate">
                        {deal.deal_type}
                      </p>
                    </div>
                  </div>
                )}

                {deal.company_name && (
                  <div className="flex items-center gap-3 p-3 bg-background/50 rounded-xl">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                      <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {t('الشركة', 'Company')}
                      </p>
                      <p className="font-medium text-foreground truncate">
                        {deal.company_name}
                      </p>
                    </div>
                  </div>
                )}

                {deal.budget_range && (
                  <div className="flex items-center gap-3 p-3 bg-background/50 rounded-xl">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                      <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {t('الميزانية', 'Budget')}
                      </p>
                      <p className="font-medium text-foreground truncate">
                        {deal.budget_range}
                        {deal.budget_cycle && ` / ${deal.budget_cycle}`}
                      </p>
                    </div>
                  </div>
                )}

                {deal.timeline && (
                  <div className="flex items-center gap-3 p-3 bg-background/50 rounded-xl">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                      <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {t('الجدول الزمني', 'Timeline')}
                      </p>
                      <p className="font-medium text-foreground truncate">
                        {deal.timeline}
                      </p>
                    </div>
                  </div>
                )}

                {deal.details && (
                  <div className="flex items-start gap-3 p-3 bg-background/50 rounded-xl">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full mt-0.5">
                      <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {t('التفاصيل', 'Details')}
                      </p>
                      <p className="font-medium text-foreground whitespace-pre-wrap text-sm">
                        {deal.details}
                      </p>
                    </div>
                  </div>
                )}

                {deal.exclusivity && (
                  <div className="flex items-start gap-3 p-3 bg-background/50 rounded-xl">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-full mt-0.5">
                      <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {t('الحصرية', 'Exclusivity')}
                      </p>
                      <p className="font-medium text-foreground whitespace-pre-wrap text-sm">
                        {deal.exclusivity}
                      </p>
                    </div>
                  </div>
                )}

                {deal.deliverables && (
                  <div className="flex items-start gap-3 p-3 bg-background/50 rounded-xl">
                    <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-full mt-0.5">
                      <FileText className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {t('المخرجات', 'Deliverables')}
                      </p>
                      <p className="font-medium text-foreground whitespace-pre-wrap text-sm">
                        {deal.deliverables}
                      </p>
                    </div>
                  </div>
                )}

                {deal.why_them && (
                  <div className="flex items-start gap-3 p-3 bg-background/50 rounded-xl">
                    <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-full mt-0.5">
                      <FileText className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {t('لماذا هم', 'Why Them')}
                      </p>
                      <p className="font-medium text-foreground whitespace-pre-wrap text-sm">
                        {deal.why_them}
                      </p>
                    </div>
                  </div>
                )}

                {deal.status && (
                  <div className="flex items-center gap-3 p-3 bg-background/50 rounded-xl">
                    <div className="p-2 bg-gray-100 dark:bg-gray-900/30 rounded-full">
                      <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {t('الحالة', 'Status')}
                      </p>
                      <p className="font-medium text-foreground truncate capitalize">
                        {deal.status}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Message content - Deal card fallback or regular message */}
          {!deal && isDealMessage ? (
            <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                  <Briefcase className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-foreground">
                    {t('بطاقة عرض', 'Deal Card')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('عرض احترافي مرسل', 'Professional offer sent')}
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-3 p-3 bg-background/50 rounded-xl">
                  <div className="p-2 bg-primary/10 rounded-full">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {t('نوع العرض', 'Deal Type')}
                    </p>
                    <p className="font-medium text-foreground truncate">
                      {message.subject || message.content.split('\n')[0] || t('غير محدد', 'Not specified')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-background/50 rounded-xl">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                    <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {t('الميزانية', 'Budget')}
                    </p>
                    <p className="font-medium text-foreground truncate">
                      {extractBudget(message.content) || t('غير محدد', 'Not specified')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-background/50 rounded-xl">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                    <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {t('الجدول الزمني', 'Timeline')}
                    </p>
                    <p className="font-medium text-foreground truncate">
                      {extractTimeline(message.content) || t('غير محدد', 'Not specified')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-background/50 rounded-xl">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full mt-0.5">
                    <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {t('التفاصيل', 'Details')}
                    </p>
                    <p className="font-medium text-foreground whitespace-pre-wrap text-sm">
                      {extractDetails(message.content) || message.content}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-card border-2 border-border">
              <p className="text-base leading-relaxed whitespace-pre-wrap">
                {message.content}
              </p>
            </div>
          )}

          {/* Reply section - Larger, more comfortable */}
          <div className="shrink-0 border-t-2 border-border p-5 space-y-4 bg-muted/30">
            <Textarea
              placeholder={t('✍️ اكتب ردك هنا...', '✍️ Write your reply here...')}
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              rows={3}
              className="resize-none text-base rounded-xl border-2 focus:border-primary p-4"
            />
            <Button 
              onClick={handleReply}
              disabled={!replyContent.trim() || isSending}
              size="lg"
              className="w-full h-14 text-lg rounded-xl touch-feedback"
            >
              {isSending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Send className="h-5 w-5 me-2" />
                  {t('إرسال الرد', 'Send Reply')}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper functions to extract deal information from message content
function extractBudget(content: string): string | null {
  const budgetMatch = content.match(/(?:budget|ميزانية)[:\s]*([^\n]+)/i);
  return budgetMatch ? budgetMatch[1].trim() : null;
}

function extractTimeline(content: string): string | null {
  const timelineMatch = content.match(/(?:timeline|دليل|مدة|timeline)[:\s]*([^\n]+)/i);
  return timelineMatch ? timelineMatch[1].trim() : null;
}

function extractDetails(content: string): string | null {
  const detailsMatch = content.match(/(?:details|تفاصيل)[:\s]*([\s\S]+)/i);
  return detailsMatch ? detailsMatch[1].trim() : null;
}
