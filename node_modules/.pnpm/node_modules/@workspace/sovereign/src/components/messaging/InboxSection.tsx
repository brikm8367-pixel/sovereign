import { useLanguage } from '@/i18n/LanguageContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Briefcase, Loader2, User, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

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
          conversations.map((conversation) => (
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
          ))
        )}
      </div>
    </div>
  );
}
