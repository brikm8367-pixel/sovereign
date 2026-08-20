import { useLanguage } from '@/i18n/LanguageContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Briefcase, Lock, Users, Loader2, Inbox as InboxIcon, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MessageCategory = 'work' | 'audience' | 'direct';

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
  category: MessageCategory;
  parent_id: string | null;
  voice_url?: string | null;
  media_url?: string | null;
  media_type?: string | null;
}

interface InboxSectionProps {
  messages: Message[];
  isLoading: boolean;
  onMessageClick: (message: Message) => void;
  activeCategory: MessageCategory;
  onCategoryChange: (category: MessageCategory) => void;
  allowedCategories?: MessageCategory[];
}

const tabOrder: MessageCategory[] = ['work', 'direct', 'audience'];

const categoryConfig = {
  work: {
    icon: Briefcase,
    label: { ar: 'العمل', en: 'Work', fr: 'Travail', es: 'Trabajo' },
  },
  direct: {
    icon: Lock,
    label: { ar: 'الخاص', en: 'Private', fr: 'Privé', es: 'Privado' },
  },
  audience: {
    icon: Users,
    label: { ar: 'الجمهور', en: 'Audience', fr: 'Audience', es: 'Audiencia' },
  },
};

export default function InboxSection({
  messages,
  isLoading,
  onMessageClick,
  activeCategory,
  onCategoryChange,
  allowedCategories,
}: InboxSectionProps) {
  const { isRTL, language } = useLanguage();

  const filteredMessages = messages.filter((m) => m.category === activeCategory);

  // Filter tabOrder based on allowedCategories
  const visibleTabs = allowedCategories ? tabOrder.filter(cat => allowedCategories.includes(cat)) : tabOrder;

  return (
    <div className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Category Tabs */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-xl">
        {visibleTabs.map((cat) => {
          const config = categoryConfig[cat];
          const Icon = config.icon;
          const isActive = activeCategory === cat;

          return (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={cn(
                'flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all touch-feedback flex items-center justify-center gap-2',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{config.label[language] || config.label.en}</span>
            </button>
          );
        })}
      </div>

      {/* Messages List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="text-center py-12">
            <InboxIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {isRTL ? 'لا توجد رسائل' : 'No messages'}
            </p>
          </div>
        ) : (
          filteredMessages.map((message) => (
            <div
              key={message.id}
              onClick={() => onMessageClick(message)}
              className={cn(
                'flex items-start gap-3 p-3 rounded-2xl bg-card border border-border touch-feedback cursor-pointer',
                !message.is_read && 'bg-primary/5 border-primary/20'
              )}
            >
              <Avatar className="h-10 w-10 ring-2 ring-primary/10 shrink-0">
                <AvatarImage src={message.sender_profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {message.sender_profile?.display_name?.[0] || <User className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">
                    {message.sender_profile?.display_name || message.sender_profile?.username || 'Unknown'}
                  </p>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {new Date(message.created_at).toLocaleTimeString(isRTL ? 'ar' : 'en', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {message.subject || message.content}
                </p>
              </div>
              {!message.is_read && (
                <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
