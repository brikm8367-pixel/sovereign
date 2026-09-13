import { useLanguage } from '@/i18n/LanguageContext';
import { Briefcase, MessageCircle, Mail, Users } from 'lucide-react';

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
  sender_role?: string | null;
  deal_status?: string | null;
}

interface InboxSectionProps {
  conversations: Conversation[];
  isLoading: boolean;
  onConversationClick: (conversation: Conversation) => void;
}

export function InboxSection({
  conversations,
  isLoading,
  onConversationClick,
}: InboxSectionProps) {
  const { isRTL } = useLanguage();

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="text-center py-8 bg-card rounded-xl border border-border">
        <MessageCircle className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">لا توجد محادثات</p>
      </div>
    );
  }

  const t = (ar: string, en: string) => (isRTL ? ar : en);

  const getConversationMeta = (conv: Conversation) => {
    if (conv.sender_role === 'manager' && conv.deal_status === 'accepted') {
      return {
        icon: Briefcase,
        iconBg: 'bg-blue-100 dark:bg-blue-900/30',
        iconColor: 'text-blue-600 dark:text-blue-400',
        titleAr: 'تفاوض',
        titleEn: 'Negotiation',
        subtitlePrefixAr: 'مع',
        subtitlePrefixEn: 'with',
      };
    } else if (conv.sender_role === 'manager') {
      return {
        icon: MessageCircle,
        iconBg: 'bg-purple-100 dark:bg-purple-900/30',
        iconColor: 'text-purple-600 dark:text-purple-400',
        titleAr: 'أسئلة',
        titleEn: 'Questions',
        subtitlePrefixAr: 'من',
        subtitlePrefixEn: 'from',
      };
    } else {
      return {
        icon: Mail,
        iconBg: 'bg-gray-100 dark:bg-gray-800',
        iconColor: 'text-gray-600 dark:text-gray-400',
        titleAr: 'رسائل',
        titleEn: 'Messages',
        subtitlePrefixAr: 'من',
        subtitlePrefixEn: 'from',
      };
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('منذ قليل', 'just now');
    if (diffMins < 60) return t(`${diffMins} دقيقة`, `${diffMins}m`);
    if (diffHours < 24) return t(`${diffHours} ساعة`, `${diffHours}h`);
    if (diffDays < 7) return t(`${diffDays} يوم`, `${diffDays}d`);
    return date.toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-1.5">
      {conversations.map((conv) => {
        const meta = getConversationMeta(conv);
        const Icon = meta.icon;
        const time = formatTime(conv.last_message_time);

        return (
          <button
            key={conv.id}
            onClick={() => onConversationClick(conv)}
            className="w-full flex items-start gap-3 p-3.5 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:bg-muted/30 transition-all touch-feedback text-left"
          >
            <div className={`shrink-0 h-11 w-11 rounded-xl flex items-center justify-center ${meta.iconBg}`}>
              <Icon className={`h-5 w-5 ${meta.iconColor}`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="font-bold text-sm truncate">
                  {isRTL ? meta.titleAr : meta.titleEn}
                </h3>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                  {time}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mb-1.5">{conv.display_name}</p>
              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/40">
                <span className="text-[10px] text-muted-foreground/70 truncate">
                  {time}
                </span>
                {conv.unread_count > 0 && (
                  <span className="h-5 min-w-5 rounded-full bg-red-500 text-[10px] font-semibold text-white flex items-center justify-center px-1.5 shrink-0">
                    {conv.unread_count}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
