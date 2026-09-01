import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MessageCircle, Users, Lock } from 'lucide-react';

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
  activeCategory: 'work' | 'audience' | 'direct';
  onCategoryChange: (category: 'work' | 'audience' | 'direct') => void;
  onConversationClick: (conversation: Conversation) => void;
}

export function InboxSection({
  conversations,
  isLoading,
  activeCategory,
  onCategoryChange,
  onConversationClick,
}: InboxSectionProps) {
  const categories = [
    { id: 'work' as const, label: 'عمل', icon: MessageCircle },
    { id: 'audience' as const, label: 'جمهور', icon: Users },
    { id: 'direct' as const, label: 'مباشر', icon: Lock },
  ];

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
        <p className="text-sm text-muted-foreground">لا توجد محادثات</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Category Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                activeCategory === cat.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Conversations List */}
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
    </div>
  );
}