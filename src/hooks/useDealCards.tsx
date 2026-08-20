import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type DealStatus = 'pending' | 'accepted' | 'declined' | 'countered' | 'archived';

export interface DealCard {
  id: string;
  celebrity_id: string;
  sender_id: string;
  message_id: string | null;
  deal_type: string;
  budget_range: string | null;
  timeline: string | null;
  details: string | null;
  status: DealStatus;
  golden_hour: boolean;
  golden_hour_expires_at: string | null;
  created_at: string;
  updated_at: string;
  sender_profile?: {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

export function useDealCards(celebrityId?: string | null) {
  const { user } = useAuth();
  const [deals, setDeals] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

  const load = useCallback(async () => {
    if (!user || !celebrityId) {
      setDeals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('deal_cards')
      .select(`
        *,
        sender_profile:profiles!deal_cards_sender_id_fkey(display_name, username, avatar_url)
      `)
      .eq('celebrity_id', celebrityId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading deal cards:', error);
      setDeals([]);
    } else {
      setDeals(data as DealCard[]);
      const pending = (data as DealCard[]).filter(
        d => (d as any).escalated_to_celebrity && (d as any).celebrity_approval_status === 'pending'
      ).length;
      setPendingApprovalCount(pending);
    }
    setLoading(false);
  }, [user, celebrityId]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (id: string, status: DealStatus) => {
    const { error } = await supabase.from('deal_cards').update({ status }).eq('id', id);
    if (error) throw error;
    await load();
  };

  const archiveDeal = async (id: string) => {
    const { error } = await supabase.from('deal_cards').update({ status: 'archived' }).eq('id', id);
    if (error) throw error;
    await load();
  };

  const pinDeal = async (id: string, hours?: number) => {
    const expiresAt = new Date(Date.now() + (hours || 1) * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('deal_cards')
      .update({ golden_hour: true, golden_hour_expires_at: expiresAt })
      .eq('id', id);
    if (error) throw error;
    await load();
  };

  const isGoldenActive = (d: DealCard) => {
    return d.golden_hour && d.golden_hour_expires_at ? new Date(d.golden_hour_expires_at) > new Date() : false;
  };

  const isSticky = (d: DealCard) => {
    return isGoldenActive(d);
  };

  return {
    deals,
    loading,
    refresh: load,
    updateStatus,
    isGoldenActive,
    isSticky,
    archiveDeal,
    pinDeal,
    pendingApprovalCount,
  };
}
