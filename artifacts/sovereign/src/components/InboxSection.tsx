import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import { Briefcase, MessageCircle, Mail } from 'lucide-react';

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

  const getConversationMeta = (conv: Conversation) => {
    if (conv.sender_role === 'manager' && conv.deal_status === 'accepted') {
      return {
        icon: Briefcase,
        iconBg: 'bg-amber-100 dark:bg-amber-900/30',
        iconColor: 'text-amber-600 dark:text-amber-400',
        titleAr: 'تفاوض',
        titleEn: 'Negotiation',
      };
    } else if (conv.sender_role === 'manager') {
      return {
        icon: MessageCircle,
        iconBg: 'bg-purple-100 dark:bg-purple-900/30',
        iconColor: 'text-purple-600 dark:text-purple-400',
        titleAr: 'أسئلة',
        titleEn: 'Questions',
      };
    } else {
      return {
        icon: Mail,
        iconBg: 'bg-gray-100 dark:bg-gray-800',
        iconColor: 'text-gray-600 dark:text-gray-400',
        titleAr: 'رسائل',
        titleEn: 'Messages',
      };
    }
  };

  return (
    <div className="space-y-1.5">
      {conversations.map((conv) => {
        const meta = getConversationMeta(conv);
        const Icon = meta.icon;
        const time = new Date(conv.last_message_time).toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <button
            key={conv.id}
            onClick={() => onConversationClick(conv)}
            className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-card border border-border/40 hover:border-primary/30 hover:bg-muted/20 hover:shadow-sm transition-all duration-200 touch-feedback text-left group"
          >
            <div className={cn('shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center transition-transform duration-200 group-hover:scale-105', meta.iconBg)}>
              <Icon className={cn('h-5 w-5', meta.iconColor)} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-[15px] truncate text-foreground">{conv.display_name}</p>
                <span className="text-[10px] text-muted-foreground/80 whitespace-nowrap shrink-0 font-medium">{time}</span>
              </div>
              <p className={cn('text-[11px] font-medium mt-0.5 tracking-wide', meta.iconColor)}>
                {isRTL ? meta.titleAr : meta.titleEn}
              </p>
              <p className="text-xs text-muted-foreground/70 truncate mt-1 leading-relaxed">{conv.last_message}</p>
            </div>

            {conv.unread_count > 0 && (
              <span className="h-5 min-w-5 rounded-full bg-primary text-[10px] font-semibold text-primary-foreground flex items-center justify-center px-1.5 shrink-0 shadow-sm">
                {conv.unread_count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
