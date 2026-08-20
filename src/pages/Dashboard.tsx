import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, User } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { BottomNavigation } from '@/components/BottomNavigation';
import InboxSection, { MessageCategory, Message } from '@/components/messaging/InboxSection';
import { MessageViewer } from '@/components/messaging/MessageViewer';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const { isRTL, language } = useLanguage();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [activeCategory, setActiveCategory] = useState<MessageCategory>('work');
  const [viewingMessage, setViewingMessage] = useState<Message | null>(null);

  useEffect(() => { if (!loading && !user) navigate('/'); }, [user, loading, navigate]);

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      if (!user) return;
      setIsLoadingMessages(true);
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender_profile:profiles!messages_sender_id_fkey(id, display_name, username, avatar_url)
        `)
        .or(`receiver_id.eq.${user.id},sender_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching messages:', error);
      } else {
        setMessages(data as unknown as Message[] || []);
      }
      setIsLoadingMessages(false);
    };

    if (user) {
      fetchMessages();
    }
  }, [user]);

  // Mark message as read
  const handleMessageRead = useCallback(async (message: Message) => {
    if (!user || message.is_read) return;
    await supabase.from('messages').update({ is_read: true }).eq('id', message.id);
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, is_read: true } : m));
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="fixed top-0 right-0 left-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
        <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {isRTL ? 'كل شيء في مكانه — تلقائيًا' : 'Everything in its place — automatically'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto pt-16 pb-20 px-4">
        {/* Inbox Section */}
        <div className="mb-6">
          <InboxSection
            messages={messages}
            isLoading={isLoadingMessages}
            onMessageClick={(msg) => setViewingMessage(msg)}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />
        </div>
      </main>

      <MessageViewer
        message={viewingMessage}
        isOpen={!!viewingMessage}
        onClose={() => setViewingMessage(null)}
        onMessageRead={() => viewingMessage && handleMessageRead(viewingMessage)}
      />

      <BottomNavigation />
    </div>
  );
}
