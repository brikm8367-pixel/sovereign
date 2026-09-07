import { useLanguage } from '@/i18n/LanguageContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Briefcase, Loader2, User, MessageCircle, ShieldCheck, Building2, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type MessageCategory = 'work';

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  sender_profile?: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
  subject: string | null;
  content: string;
  is_important: boolean;
  is_read: boolean;
  created_at: string;
  category: string;
  parent_id: string | null;
  voice_url?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  deal_id?: string | null;
  sender_role?: string | null;
}

export interface ConversationSummary {
  rootId: string;
  otherParticipantId: string;
  otherParticipantProfile: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
  latestMessageContent: string;
  latestMessageTime: string;
  unreadCount: number;
  hasUnread: boolean;
  deal_id?: string | null;
  deal_status?: string | null;
  latestSenderRole?: string | null;
}

interface InboxSectionProps {
  conversations: ConversationSummary[];
  isLoading: boolean;
  onConversationClick: (conversation: ConversationSummary) => void;
  activeCategory: 'work';
  onCategoryChange: (category: 'work') => void;
}

const categoryConfig = {
  work: {
    icon: Briefcase,
    label: { ar: 'العمل', en: 'Work', fr: 'Travail', es: 'Trabajo' },
  },
};

const ROLE_BADGES: Record<string, { label: { ar: string; en: string }; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  manager: { 
    label: { ar: 'وكيل', en: 'Agent' }, 
    color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    icon: ShieldCheck
  },
  sender: { 
    label: { ar: 'شركة', en: 'Company' }, 
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    icon: Building2
  },
  celebrity: { 
    label: { ar: 'موهبة', en: 'Talent' }, 
    color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    icon: UserCheck
  },
};

const DEAL_STATUS_BADGES: Record<string, { label: { ar: string; en: string }; color: string }> = {
  pending: { label: { ar: 'قيد المراجعة', en: 'Pending' }, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  accepted: { label: { ar: 'مقبول', en: 'Accepted' }, color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' },
  declined: { label: { ar: 'مرفوض', en: 'Declined' }, color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' },
  seen: { label: { ar: 'شوهدت', en: 'Seen' }, color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
};

export default function InboxSection({
  conversations,
  isLoading,
  onConversationClick,
  activeCategory,
  onCategoryChange,
}: InboxSectionProps) {
  const { isRTL, language } = useLanguage();

  return (
    <div className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Category Tabs */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-xl">
        <button
          onClick={() => onCategoryChange('work')}
          className={cn(
            'flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all touch-feedback flex items-center justify-center gap-2',
            'bg-primary text-primary-foreground shadow-sm'
          )}
        >
          <Briefcase className="h-4 w-4" />
          <span>{categoryConfig.work.label[language] || categoryConfig.work.label.en}</span>
          {conversations.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-primary-foreground/20 text-primary-foreground rounded-full">
              {conversations.length}
            </span>
          )}
        </button>
      </div>

      {/* Conversations List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12">
            <div className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3 flex items-center justify-center">
              <MessageCircle className="h-6 w-6" />
            </div>
            <p className="text-muted-foreground">
              {isRTL ? 'لا توجد محادثات' : 'No conversations'}
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {isRTL ? 'ابدأ محادثة جديدة من عرض عمل' : 'Start a conversation from a work offer'}
            </p>
          </div>
        ) : (
          conversations.map((conversation) => {
            const roleBadge = conversation.latestSenderRole ? ROLE_BADGES[conversation.latestSenderRole] : null;
            const dealStatusBadge = conversation.deal_id && conversation.deal_status ? DEAL_STATUS_BADGES[conversation.deal_status] : null;

            return (
              <div
                key={conversation.rootId}
                onClick={() => onConversationClick(conversation)}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-2xl bg-card border border-border touch-feedback cursor-pointer',
                  conversation.hasUnread && 'bg-primary/5 border-primary/20'
                )}
              >
                <Avatar className="h-10 w-10 ring-2 ring-primary/10 shrink-0">
                  <AvatarImage src={conversation.otherParticipantProfile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {conversation.otherParticipantProfile?.display_name?.[0] || 
                     conversation.otherParticipantProfile?.username?.[0] || 
                     <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm truncate">
                      {conversation.otherParticipantProfile?.display_name || 
                       conversation.otherParticipantProfile?.username || 
                       'Unknown'}
                    </p>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {new Date(conversation.latestMessageTime).toLocaleTimeString(isRTL ? 'ar' : 'en', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conversation.latestMessageContent}
                  </p>
                  {/* Role badge and deal status badge */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {roleBadge && (
                      <Badge variant="outline" className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium h-5', roleBadge.color)}>
                        <roleBadge.icon className="h-2.5 w-2.5 mr-1" />
                        {isRTL ? roleBadge.label.ar : roleBadge.label.en}
                      </Badge>
                    )}
                    {dealStatusBadge && (
                      <Badge variant="outline" className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium h-5', dealStatusBadge.color)}>
                        {isRTL ? dealStatusBadge.label.ar : dealStatusBadge.label.en}
                      </Badge>
                    )}
                  </div>
                </div>
                {conversation.hasUnread && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                    {conversation.unreadCount > 1 && (
                      <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
