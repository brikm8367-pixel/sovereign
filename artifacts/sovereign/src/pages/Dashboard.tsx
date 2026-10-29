import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BottomNavigation } from '@/components/BottomNavigation';
import { InboxSection } from '@/components/InboxSection';
import { useTheme } from '@/hooks/useTheme';
import { toast } from 'sonner';
import { 
  Loader2, 
  Briefcase, 
  Check, 
  X, 
  MessageCircle, 
  User, 
  Send,
  Sun,
  Moon,
  MessageSquare,
  CheckCheck,
  XCircle,
  Clock,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DealCardInline } from '@/components/deals/DealCardInline';
import MessageComposer from '@/components/messaging/MessageComposer';
import { initE2EKeys, ensureUserE2EReady, decryptFromSender, getOwnMessagePlaintext, isEncryptedMessage, encryptForRecipient } from '@/utils/e2eManager';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getStoredKeysSecure } from '@/utils/encryption';

let lastVerifiedUserId: string | null = null;

interface Deal {
  id: string;
  sender_id: string | null;
  celebrity_id: string | null;
  company_name: string | null;
  website_url: string | null;
  budget_range: string | null;
  budget_cycle: string | null;
  deal_type: string | null;
  details: string | null;
  deliverables: string | null;
  timeline: string | null;
  exclusivity: string | null;
  why_them: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'countered';
  created_at: string;
  updated_at: string;
  message_id: string | null;
  golden_hour: boolean;
  golden_hour_expires_at: string | null;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  is_read: boolean | null;
  category: string;
  parent_id: string | null;
  voice_url?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  is_edited?: boolean | null;
  edited_at?: string | null;
  expires_at?: string | null;
  deal_id?: string | null;
  sender_role?: string | null;
  deal_status?: string | null;
}

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

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { role, managedCelebrityId, managedCelebrities, switchCelebrity, switching } = useRole();
  const { isRTL, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  
  const [pendingDeals, setPendingDeals] = useState<Deal[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingDeals, setIsLoadingDeals] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [askTalentDeal, setAskTalentDeal] = useState<Deal | null>(null);
  const [askTalentQuestion, setAskTalentQuestion] = useState('');
  const [isSubmittingAsk, setIsSubmittingAsk] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDealDetails, setShowDealDetails] = useState<Record<string, boolean>>({});
  const [showDealQuestion, setShowDealQuestion] = useState<string | null>(null);
  const [selectedDealForQuestion, setSelectedDealForQuestion] = useState<Deal | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const isMountedRef = useRef(true);
  const fetchConversationsRef = useRef<((celebIdOverride?: string | null) => Promise<any>) | undefined>(undefined);
  const fetchPendingDealsRef = useRef<((celebIdOverride?: string | null) => Promise<any>) | undefined>(undefined);
  const fetchConversationsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const decryptedCacheRef = useRef<Map<string, string>>(new Map());
  const roleRef = useRef(role);
  const retryTimeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());
  const queryClient = useQueryClient();
  const lastHandledCelebRef = useRef<string | null>(null);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    let mounted = true;

    const initializeE2EKeys = async () => {
      if (!user) return;
      if (lastVerifiedUserId === user.id) return;
      try {
        const hasKeys = await Promise.race([
          ensureUserE2EReady(user.id),
          new Promise<boolean>((_, reject) => 
            setTimeout(() => reject(new Error('E2E initialization timeout')), 10000)
          )
        ]);
        if (!hasKeys) {
          await initE2EKeys(user.id);
        }
        lastVerifiedUserId = user.id;
      } catch (error) {
        console.error('[Dashboard] Failed to initialize E2E keys', error);
      }
    };

    const runDeferred = () => {
      if (mounted && user) {
        initializeE2EKeys();
      }
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(runDeferred, { timeout: 2000 });
    } else {
      setTimeout(runDeferred, 0);
    }

    const handleFocus = () => {
      if (mounted && user) {
        initializeE2EKeys();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      mounted = false;
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  const resolveDisplayContent = useCallback(async (
    msgContent: string,
    senderId: string,
    messageId: string,
    currentUserId: string,
    managedCelebrityId: string | null
  ): Promise<string> => {
    if (typeof msgContent !== 'string') return '';
    if (!isEncryptedMessage(msgContent)) return msgContent;
    if (decryptedCacheRef.current.has(messageId)) {
      return decryptedCacheRef.current.get(messageId)!;
    }
    try {
      if (senderId === currentUserId) {
        const ownPlaintext = await getOwnMessagePlaintext(messageId);
        if (ownPlaintext) {
          decryptedCacheRef.current.set(messageId, ownPlaintext);
          return ownPlaintext;
        }
      }
      const decrypted = await decryptFromSender(msgContent, senderId, currentUserId);
      if (decrypted.success && decrypted.plaintext) {
        decryptedCacheRef.current.set(messageId, decrypted.plaintext);
        return decrypted.plaintext;
      }
      if (managedCelebrityId && managedCelebrityId !== senderId) {
        const decrypted2 = await decryptFromSender(msgContent, managedCelebrityId, currentUserId);
        if (decrypted2.success && decrypted2.plaintext) {
          decryptedCacheRef.current.set(messageId, decrypted2.plaintext);
          return decrypted2.plaintext;
        }
      }
    } catch (e) {
      console.warn('[Dashboard] Decryption failed for message:', messageId, e);
    }
    const timeoutId = setTimeout(() => {
      retryTimeoutsRef.current.delete(timeoutId);
      resolveDisplayContent(msgContent, senderId, messageId, currentUserId, managedCelebrityId).then(fresh => {
        if (fresh && fresh !== '...' && fresh !== '🔒') {
          decryptedCacheRef.current.set(messageId, fresh);
          setConversations(prev => prev.map(c => c.last_message === '...' ? { ...c, last_message: fresh } : c));
        }
      });
    }, 5000);
    retryTimeoutsRef.current.add(timeoutId);
    return '...';
  }, []);

  const fetchPendingDeals = useCallback(async (celebIdOverride?: string | null) => {
    if (!user) return;
    const celebId = celebIdOverride !== undefined ? celebIdOverride : managedCelebrityId;
    if (roleRef.current === 'manager' && !celebId) {
      if (isMountedRef.current && celebIdOverride === undefined) {
        setPendingDeals([]);
        setIsLoadingDeals(false);
      }
      return;
    }
    try {
      const query = supabase.from('deal_cards').select('*').eq('status', 'pending');
      if (roleRef.current === 'manager' && celebId) {
        query.eq('celebrity_id', celebId);
      } else if (roleRef.current === 'sender') {
        query.eq('sender_id', user.id);
      } else {
        query.eq('celebrity_id', user.id);
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      if (isMountedRef.current && celebIdOverride === undefined) {
        setPendingDeals(data as Deal[] || []);
        setIsLoadingDeals(false);
      }
      return data as Deal[] || [];
    } catch (error) {
      console.error('Error fetching pending deals:', error);
      if (isMountedRef.current && celebIdOverride === undefined) {
        setIsLoadingDeals(false);
      }
      throw error;
    }
  }, [user?.id, managedCelebrityId]);

  const fetchConversations = useCallback(async (celebIdOverride?: string | null) => {
    if (!user) return;
    const celebId = celebIdOverride !== undefined ? celebIdOverride : managedCelebrityId;
    if (roleRef.current === 'manager' && !celebId) {
      if (isMountedRef.current && celebIdOverride === undefined) {
        setConversations([]);
        setIsLoadingMessages(false);
      }
      return;
    }
    try {
      const currentUserId = user.id;
      let query = supabase
        .from('messages')
        .select('id, sender_id, receiver_id, content, created_at, is_read, category, deal_id, sender_role, managed_celebrity_id, deal_cards!messages_deal_id_fkey(status)')
        .eq('category', 'work')
        .not('deal_cards.status', 'eq', 'declined')
        .order('created_at', { ascending: false })
        .limit(200);
      if (roleRef.current === 'manager' && celebId) {
        query = query.or(`and(sender_id.eq.${user.id},managed_celebrity_id.eq.${celebId}),and(receiver_id.eq.${user.id},sender_id.eq.${celebId})`);
      } else {
        query = query.or(`receiver_id.eq.${user.id},sender_id.eq.${user.id}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      const messages = (data as any[]) || [];
      const resolvedMap = new Map<string, string>();
      await Promise.all(messages.map(async (msg) => {
        const r = await Promise.race([
          resolveDisplayContent(msg.content || '', msg.sender_id, msg.id, currentUserId, celebId || null),
          new Promise<string>((resolve) => setTimeout(() => resolve('🔒'), 500))
        ]);
        resolvedMap.set(msg.id, r);
      }));
      const otherUserIds = new Set<string>();
      for (const msg of messages) {
        const otherUserId = msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id;
        if (otherUserId) otherUserIds.add(otherUserId);
      }
      const profilesMap = new Map<string, any>();
      if (otherUserIds.size > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_url')
          .in('id', Array.from(otherUserIds));
        if (!profilesError && profiles) {
          for (const profile of profiles) profilesMap.set(profile.id, profile);
        }
      }
      const conversationsMap = new Map<string, Conversation>();
      for (const msg of messages) {
        const otherUserId = msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id;
        if (!otherUserId) continue;
        const convId = msg.deal_id || otherUserId;
        if (!conversationsMap.has(convId)) {
          const profile = profilesMap.get(otherUserId);
          const dealStatus = msg.deal_cards?.status || msg.deal_status || null;
          conversationsMap.set(convId, {
            id: convId,
            user_id: otherUserId,
            display_name: profile?.display_name || profile?.username || 'مستخدم',
            username: profile?.username || '',
            avatar_url: profile?.avatar_url || null,
            last_message: resolvedMap.get(msg.id) || '',
            last_message_time: msg.created_at,
            unread_count: msg.is_read ? 0 : 1,
            deal_id: msg.deal_id || null,
            category: msg.category || 'work',
            sender_role: msg.sender_role || null,
            deal_status: dealStatus
          });
        } else {
          const existing = conversationsMap.get(convId)!;
          if (new Date(msg.created_at) > new Date(existing.last_message_time)) {
            existing.last_message = resolvedMap.get(msg.id) || '';
            existing.last_message_time = msg.created_at;
            existing.sender_role = msg.sender_role || null;
            const dealStatus = msg.deal_cards?.status || msg.deal_status || null;
            existing.deal_status = dealStatus;
          }
          if (!msg.is_read && msg.receiver_id === currentUserId) {
            existing.unread_count += 1;
          }
        }
      }
      const conversationsList = Array.from(conversationsMap.values())
        .sort((a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime());
      if (isMountedRef.current && celebIdOverride === undefined) {
        setConversations(conversationsList);
        setIsLoadingMessages(false);
      }
      return conversationsList;
    } catch (error) {
      console.error('Error fetching conversations:', error);
      if (isMountedRef.current && celebIdOverride === undefined) {
        setIsLoadingMessages(false);
      }
      throw error;
    }
  }, [user?.id, managedCelebrityId, resolveDisplayContent]);

  const { data: conversationsFromQuery, isLoading: isLoadingConversations } = useQuery({
    queryKey: ['conversations', user?.id, managedCelebrityId],
    queryFn: () => fetchConversations(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!user && !(roleRef.current === 'manager' && !managedCelebrityId)
  });

  useEffect(() => {
    if (conversationsFromQuery) {
      setConversations(conversationsFromQuery);
      setIsLoadingMessages(false);
    }
  }, [conversationsFromQuery]);

  const { data: pendingDealsFromQuery, isLoading: isLoadingPendingFromQuery } = useQuery({
    queryKey: ['pendingDeals', user?.id, managedCelebrityId],
    queryFn: () => fetchPendingDeals(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!user
  });

  useEffect(() => {
    if (pendingDealsFromQuery) {
      setPendingDeals(pendingDealsFromQuery);
      setIsLoadingDeals(false);
    }
  }, [pendingDealsFromQuery]);

  useEffect(() => {
    fetchConversationsRef.current = fetchConversations;
  }, [fetchConversations]);

  useEffect(() => {
    fetchPendingDealsRef.current = fetchPendingDeals;
  }, [fetchPendingDeals]);

  useEffect(() => {
    if (role !== 'manager' || !user?.id || managedCelebrities.length === 0) return;
    managedCelebrities.forEach((celeb) => {
      queryClient.prefetchQuery({
        queryKey: ['conversations', user.id, celeb.id],
        queryFn: () => fetchConversations(celeb.id),
        staleTime: 60_000
      });
      queryClient.prefetchQuery({
        queryKey: ['pendingDeals', user.id, celeb.id],
        queryFn: () => fetchPendingDeals(celeb.id),
        staleTime: 60_000
      });
    });
  }, [managedCelebrities, user?.id, role, fetchConversations, fetchPendingDeals, queryClient]);

  useEffect(() => {
    const total = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);
    setUnreadTotal(total);
    if (total > 0) {
      document.title = `(${total}) ${isRTL ? 'مباشر' : 'Directly'}`;
    } else {
      document.title = isRTL ? 'مباشر' : 'Directly';
    }
  }, [conversations, isRTL]);

  const handleInterested = async (dealId: string) => {
    if (!user) return;
    setIsProcessing(true);
    try {
      const { data: deal, error: dealError } = await supabase
        .from('deal_cards')
        .select('*')
        .eq('id', dealId)
        .single();
      if (dealError) throw dealError;
      const celebrityId = managedCelebrityId || deal.celebrity_id;
      if (!celebrityId) throw new Error('No celebrity selected');
      const senderIdForConversation = roleRef.current === 'manager' && managedCelebrityId ? user.id : celebrityId;
      const acceptorName = (user as any).display_name || (roleRef.current === 'manager' ? 'Agent' : 'Talent');
      const acceptorRole = roleRef.current === 'manager' ? 'manager' : 'celebrity';
      const acceptanceMessage = JSON.stringify({
        type: 'offer_accepted',
        dealId: dealId,
        acceptorName: acceptorName,
        acceptorRole: acceptorRole
      });
      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          sender_id: senderIdForConversation,
          receiver_id: deal.sender_id,
          deal_id: dealId,
          content: acceptanceMessage,
          category: 'work',
          sender_role: roleRef.current === 'manager' ? 'manager' : 'celebrity',
          managed_celebrity_id: roleRef.current === 'manager' ? managedCelebrityId : null
        } as any);
      if (msgError) throw msgError;
      const { error: updateError } = await supabase
        .from('deal_cards')
        .update({
          status: 'accepted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', dealId);
      if (updateError) throw updateError;
      if (roleRef.current === 'manager') {
        toast.success(isRTL ? 'تم قبول العرض للموهبة التي تديرها' : 'Offer accepted for talent you manage');
      } else if (roleRef.current === 'sender') {
        toast.success(isRTL ? 'تم تحديث حالة عرضك' : 'Your offer status updated');
      } else {
        toast.success(isRTL ? 'تم قبول العرض' : 'Offer accepted');
      }
      await fetchPendingDeals();
    } catch (error: any) {
      console.error('Error accepting deal:', error);
      toast.error(t.dashboard.acceptFailed + ': ' + (error.message || ''));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (dealId: string) => {
    if (!user) return;
    setIsProcessing(true);
    try {
      const { data: deal, error: dealError } = await supabase
        .from('deal_cards')
        .select('*')
        .eq('id', dealId)
        .single();
      if (dealError) throw dealError;
      const celebrityId = managedCelebrityId || deal.celebrity_id;
      if (!celebrityId) throw new Error('No celebrity selected');
      const { error: updateError } = await supabase
        .from('deal_cards')
        .update({
          status: 'declined',
          updated_at: new Date().toISOString()
        })
        .eq('id', dealId);
      if (updateError) throw updateError;
      if (roleRef.current === 'manager') {
        toast.success(isRTL ? 'تم رفض العرض للموهبة التي تديرها' : 'Offer declined for talent you manage');
      } else if (roleRef.current === 'sender') {
        toast.success(isRTL ? 'تم تحديث حالة عرضك' : 'Your offer status updated');
      } else {
        toast.success(isRTL ? 'تم رفض العرض' : 'Offer declined');
      }
      await fetchPendingDeals();
    } catch (error: any) {
      console.error('Error rejecting deal:', error);
      toast.error(t.dashboard.rejectFailed + ': ' + (error.message || ''));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAskTalentSubmit = async () => {
    if (!user || !askTalentDeal) return;
    const question = askTalentQuestion.trim();
    if (!question) {
      toast.error(t.dashboard.writeQuestion);
      return;
    }
    setIsSubmittingAsk(true);
    try {
      const celebrityId = managedCelebrityId || askTalentDeal.celebrity_id;
      if (!celebrityId) throw new Error('No celebrity selected');
      let localKeys = await getStoredKeysSecure(user.id);
      if (!localKeys && user) {
        await initE2EKeys(user.id);
      }
      let contentToSend = question;
      const enc = await encryptForRecipient(question, celebrityId, user.id);
      if (enc.success) {
        contentToSend = enc.payload;
      } else {
        console.warn('[Dashboard] Encryption failed for Ask Talent question:', (enc as any).reason);
      }
      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: celebrityId,
          deal_id: askTalentDeal.id,
          content: contentToSend,
          category: 'work',
          sender_role: 'manager',
          managed_celebrity_id: managedCelebrityId
        } as any);
      if (msgError) throw msgError;
      if (roleRef.current === 'manager') {
        toast.success(isRTL ? 'تم إرسال السؤال للموهبة التي تديرها' : 'Question sent to talent you manage');
      } else {
        toast.success(isRTL ? 'تم إرسال السؤال' : 'Question sent');
      }
      setAskTalentDeal(null);
      setAskTalentQuestion('');
      await fetchConversations();
    } catch (error: any) {
      console.error('Error sending question:', error);
      toast.error(t.dashboard.questionFailed + ': ' + (error.message || ''));
    } finally {
      setIsSubmittingAsk(false);
    }
  };

  useEffect(() => {
    if (authLoading || !user) return;
    Promise.all([fetchPendingDeals(), fetchConversations()]);
    const subscription = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'deal_cards' },
        (payload) => {
          const newDeal = payload.new as Deal;
          setPendingDeals(prev => [newDeal, ...prev]);
          document.title = `🔔 ${isRTL ? 'عرض جديد' : 'New Offer'} - ${isRTL ? 'مباشر' : 'Directly'}`;
          toast.info(tLocal('عرض جديد', 'New offer'));
          fetchPendingDeals();
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'deal_cards', filter: `status=eq.pending` },
        () => {
          fetchPendingDeals();
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMessage = payload.new as Message;
          if (!newMessage || newMessage.category !== 'work') return;
          const currentUserId = user?.id;
          if (!currentUserId) return;
          const isAgentDecision = typeof newMessage.content === 'string' && newMessage.content.startsWith('{"type":"agent_decision"');
          if (isAgentDecision && newMessage.receiver_id === currentUserId) {
            toast.info(tLocal('قرار من وكيلك', 'Decision from your agent'));
            try {
              import('@/utils/sounds').then(({ resumeAudioContext }) => {
                resumeAudioContext();
              }).catch(() => {});
            } catch (e) {}
            document.title = `🔔 ${tLocal('قرار وكيلك', 'Agent Decision')} - ${isRTL ? 'مباشر' : 'Directly'}`;
          }
          const otherUserId = newMessage.sender_id === currentUserId ? newMessage.receiver_id : newMessage.sender_id;
          if (!otherUserId) return;
          const convId = newMessage.deal_id || otherUserId;
          resolveDisplayContent(newMessage.content || '', newMessage.sender_id, newMessage.id, currentUserId, managedCelebrityId || null).then(resolved => {
            setConversations(prev => {
              const existingIndex = prev.findIndex(c => c.id === convId);
              if (existingIndex === -1) {
                const newConv: Conversation = {
                  id: convId,
                  user_id: otherUserId,
                  display_name: 'مستخدم',
                  username: '',
                  avatar_url: null,
                  last_message: resolved,
                  last_message_time: newMessage.created_at,
                  unread_count: (!newMessage.is_read && newMessage.receiver_id === currentUserId) ? 1 : 0,
                  deal_id: newMessage.deal_id || null,
                  category: newMessage.category || 'work',
                  sender_role: newMessage.sender_role || null,
                  deal_status: newMessage.deal_status || null
                };
                return [newConv, ...prev].sort((a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime());
              }
              const updated = [...prev];
              const conv = { ...updated[existingIndex] };
              if (new Date(newMessage.created_at) > new Date(conv.last_message_time)) {
                conv.last_message = resolved;
                conv.last_message_time = newMessage.created_at;
                conv.sender_role = newMessage.sender_role || null;
                conv.deal_status = newMessage.deal_status || null;
              }
              if (!newMessage.is_read && newMessage.receiver_id === currentUserId) {
                conv.unread_count += 1;
              }
              updated[existingIndex] = conv;
              return updated.sort((a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime());
            });
          });
          if (newMessage.sender_id !== currentUserId && !isAgentDecision) {
            const preview = newMessage.content?.substring(0, 40) || '';
            toast.success(`${tLocal('رسالة جديدة', 'New message')}: ${preview}...`);
            document.title = `💬 ${tLocal('رسالة جديدة', 'New Message')} - ${isRTL ? 'مباشر' : 'Directly'}`;
            try {
              import('@/utils/sounds').then(({ resumeAudioContext }) => {
                resumeAudioContext();
              }).catch(() => {});
            } catch (e) {}
          }
          fetchConversations();
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const updatedMessage = payload.new as Message;
          if (!updatedMessage || updatedMessage.category !== 'work') return;
          const currentUserId = user?.id;
          if (!currentUserId) return;
          const otherUserId = updatedMessage.sender_id === currentUserId ? updatedMessage.receiver_id : updatedMessage.sender_id;
          if (!otherUserId) return;
          const convId = updatedMessage.deal_id || otherUserId;
          setConversations(prev => {
            const existingIndex = prev.findIndex(c => c.id === convId);
            if (existingIndex === -1) {
              if (fetchConversationsTimeoutRef.current) clearTimeout(fetchConversationsTimeoutRef.current);
              fetchConversationsTimeoutRef.current = setTimeout(() => { fetchConversations(); }, 500);
              return prev;
            }
            const updated = [...prev];
            const conv = { ...updated[existingIndex] };
            if (new Date(updatedMessage.created_at) > new Date(conv.last_message_time)) {
              if (fetchConversationsTimeoutRef.current) clearTimeout(fetchConversationsTimeoutRef.current);
              fetchConversationsTimeoutRef.current = setTimeout(() => { fetchConversations(); }, 500);
              return prev;
            }
            if (updatedMessage.is_read && updatedMessage.receiver_id === currentUserId) {
              if (fetchConversationsTimeoutRef.current) clearTimeout(fetchConversationsTimeoutRef.current);
              fetchConversationsTimeoutRef.current = setTimeout(() => { fetchConversations(); }, 500);
              return prev;
            }
            updated[existingIndex] = conv;
            return updated.sort((a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime());
          });
        }
      )
      .subscribe();
    return () => {
      isMountedRef.current = false;
      if (fetchConversationsTimeoutRef.current) clearTimeout(fetchConversationsTimeoutRef.current);
      retryTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      retryTimeoutsRef.current.clear();
      subscription.unsubscribe();
    };
  }, [user, authLoading, managedCelebrityId, fetchPendingDeals, fetchConversations, isRTL]);

  useEffect(() => {
    const handleFocus = () => {
      if (isMountedRef.current && user) {
        fetchPendingDeals();
        fetchConversations();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, fetchPendingDeals, fetchConversations]);

  const memoizedConversations = useMemo(() => conversations, [conversations]);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'accepted':
        return {
          label: t.dashboard.status.accepted,
          icon: CheckCheck,
          bg: 'bg-green-50 dark:bg-green-900/20',
          border: 'border-green-200 dark:border-green-800',
          text: 'text-green-700 dark:text-green-400',
          buttonBg: 'bg-green-600 hover:bg-green-700',
          buttonText: t.dashboard.status.openChat,
          showButton: true
        };
      case 'declined':
        return {
          label: t.dashboard.status.declined,
          icon: XCircle,
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          text: 'text-red-700 dark:text-red-400',
          buttonBg: '',
          buttonText: '',
          showButton: false
        };
      case 'pending':
      default:
        return {
          label: t.dashboard.status.pending,
          icon: Clock,
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-200 dark:border-blue-800',
          text: 'text-blue-700 dark:text-blue-400',
          buttonBg: '',
          buttonText: '',
          showButton: false
        };
    }
  };

  const tLocal = (ar: string, en: string) => isRTL ? ar : en;

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="fixed top-0 right-0 left-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
        <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-lg">
              {roleRef.current === 'manager' ? t.dashboard.agentDashboard : t.dashboard.home}
            </h1>
            {roleRef.current === 'manager' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                <ShieldCheck className="h-3 w-3" />
                {tLocal('وكيل', 'Agent')}
              </span>
            )}
            {unreadTotal > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 font-medium">
                {unreadTotal > 99 ? '99+' : unreadTotal}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-11 w-11 rounded-xl touch-feedback">
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/profile')} className="h-11 w-11 rounded-xl touch-feedback">
              <User className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto pt-16 pb-20 px-4 space-y-6">
        {roleRef.current === 'manager' && managedCelebrities.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider px-1">
              {tLocal('المشاهير الذين تديرهم', 'Celebrities you manage')}
            </p>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
              {managedCelebrities.map((celeb) => (
                <button
                  key={celeb.id}
                  onClick={() => !switching && switchCelebrity(celeb.id)}
                  disabled={switching}
                  className={cn(
                    'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all shrink-0 touch-feedback',
                    celeb.id === managedCelebrityId
                      ? 'bg-primary/10 border border-primary/20'
                      : 'bg-card border border-border/50',
                    switching && 'opacity-50'
                  )}
                >
                  <Avatar className="h-10 w-10 ring-2 ring-primary/10">
                    <AvatarImage src={celeb.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {(celeb.display_name || celeb.username || '?')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-[10px] font-medium truncate max-w-[60px]">
                    {celeb.display_name || celeb.username}
                  </span>
                  {switching && celeb.id === managedCelebrityId && (
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  )}
                </button>
              ))}
            </div>
            {managedCelebrityId && (
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-3">
                <p className="text-sm font-medium text-primary flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  {tLocal('أنت تدير عروض', 'You manage offers for')} {managedCelebrities.find(c => c.id === managedCelebrityId)?.display_name || tLocal('الموهبة', 'Talent')}
                </p>
              </div>
            )}
          </div>
        )}

        {roleRef.current === 'manager' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                {t.dashboard.pendingOffers}
                {pendingDeals.length > 0 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                    {pendingDeals.length}
                  </span>
                )}
              </h2>
            </div>

            {isLoadingDeals ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : pendingDeals.length === 0 ? (
              <div className="p-4 bg-card rounded-2xl border border-border text-center">
                <p className="text-sm text-muted-foreground">
                  {managedCelebrityId ? t.dashboard.noPendingOffers : t.dashboard.selectTalent}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingDeals.map((deal) => (
                  <div key={deal.id} className="bg-card rounded-2xl border border-border p-4 space-y-3">
                    {managedCelebrityId && (
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                          {tLocal('الموهبة', 'Talent')}
                        </p>
                        <p className="font-semibold text-base text-foreground">
                          {managedCelebrities.find(c => c.id === managedCelebrityId)?.display_name || tLocal('الموهبة', 'Talent')}
                        </p>
                      </div>
                    )}
                    <DealCardInline 
                      dealId={deal.id} 
                      isRTL={isRTL} 
                      onToggleDetails={() => setShowDealDetails(prev => ({ ...prev, [deal.id]: !prev[deal.id] }))}
                      showDetails={showDealDetails[deal.id] || false}
                      showStatusBadge={false}
                    />
                    
                    {managedCelebrityId && (
                      <div className="flex items-center gap-2 pt-3 border-t border-border">
                        <Button
                          onClick={() => handleInterested(deal.id)}
                          disabled={isProcessing}
                          className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold touch-feedback"
                        >
                          <MessageCircle className="h-3.5 w-3.5 mr-1" />
                          {tLocal('بدء التفاوض', 'Start Negotiation')}
                        </Button>
                        <Button
                          onClick={() => handleReject(deal.id)}
                          disabled={isProcessing}
                          variant="outline"
                          className="flex-1 h-11 rounded-xl border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold touch-feedback"
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          {t.dashboard.reject}
                        </Button>
                        <Button
                          onClick={() => {
                            setSelectedDealForQuestion(deal);
                            setShowDealQuestion(deal.id);
                          }}
                          disabled={isProcessing}
                          variant="outline"
                          className="flex-1 h-11 rounded-xl border-blue-300 text-blue-600 hover:bg-blue-50 text-xs font-semibold touch-feedback"
                        >
                          <MessageSquare className="h-3.5 w-3.5 mr-1" />
                          {t.dashboard.askTalent}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              {t.dashboard.conversations}
            </h2>
          </div>

          <InboxSection
            conversations={memoizedConversations}
            isLoading={isLoadingMessages}
            onConversationClick={(conv) => {
              if (conv.deal_id) {
                navigate(`/chat/${conv.user_id}?dealId=${conv.deal_id}`);
              } else {
                navigate(`/chat/${conv.user_id}`);
              }
            }}
          />
        </div>
      </main>

      {askTalentDeal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="bg-card rounded-t-2xl max-w-lg w-full max-h-[80vh] p-4 space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base">
                {t.dashboard.questionForTalent} {askTalentDeal.company_name}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setAskTalentDeal(null);
                  setAskTalentQuestion('');
                }}
                className="h-10 w-10 rounded-full touch-feedback"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-muted/30 rounded-xl text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">{t.dashboard.dealDetails}</p>
                <p>{askTalentDeal.company_name} · {askTalentDeal.deal_type}</p>
                <p className="text-[11px] mt-0.5">{askTalentDeal.budget_range}</p>
              </div>

              <Textarea
                value={askTalentQuestion}
                onChange={(e) => setAskTalentQuestion(e.target.value)}
                placeholder={t.dashboard.writeQuestion}
                className="min-h-[100px] rounded-xl resize-none"
                disabled={isSubmittingAsk}
              />

              <Button
                onClick={handleAskTalentSubmit}
                disabled={isSubmittingAsk || !askTalentQuestion.trim()}
                className="w-full h-12 rounded-xl touch-feedback"
              >
                {isSubmittingAsk ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {t.dashboard.sendQuestion}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDealQuestion && selectedDealForQuestion && (
        <MessageComposer
          isOpen={true}
          onClose={() => {
            setShowDealQuestion(null);
            setSelectedDealForQuestion(null);
          }}
          recipient={{
            id: selectedDealForQuestion.celebrity_id,
            username: null,
            display_name: selectedDealForQuestion.company_name,
            avatar_url: null,
          }}
          dealId={selectedDealForQuestion.id}
          dealTitle={selectedDealForQuestion.company_name}
          onMessageSent={() => {
            setShowDealQuestion(null);
            setSelectedDealForQuestion(null);
            fetchConversations();
          }}
        />
      )}

      <BottomNavigation />
    </div>
  );
}
