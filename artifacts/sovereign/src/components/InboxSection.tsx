import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageCircle } from 'lucide-react';

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

  return (
    <div className="space-y-1.5">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onConversationClick(conv)}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors touch-feedback text-left"
        >
          <Avatar className="h-12 w-12 ring-2 ring-primary/10">
            <AvatarImage src={conv.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {conv.display_name?.[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm truncate">{conv.display_name}</p>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {new Date(conv.last_message_time).toLocaleTimeString('ar-SA', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{conv.last_message}</p>
          </div>

          {conv.unread_count > 0 && (
            <span className="h-5 min-w-5 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center px-1.5">
              {conv.unread_count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}