import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Inbox, Globe, Calendar, FileText, DollarSign, Building2, ExternalLink } from 'lucide-react';

interface DealCard {
  id: string;
  deal_type: string | null;
  budget_range: string | null;
  timeline: string | null;
  details: string | null;
  status: string;
  celebrity_profile?: {
    display_name: string | null;
    username: string | null;
  } | null;
}

export default function OfferStatusTracker() {
  const { user } = useAuth();
  const [offers, setOffers] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOffers = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from('deal_cards')
        .select(`
          id, 
          deal_type, 
          budget_range, 
          timeline,
          details,
          status,
          celebrity_profile:profiles!deal_cards_celebrity_id_fkey(display_name, username)
        `)
        .eq('sender_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching offers:', error);
        setOffers([]);
      } else {
        setOffers(data as DealCard[]);
      }
      setLoading(false);
    };

    fetchOffers();
  }, [user]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'sent':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'viewed':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'declined':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-40 text-muted-foreground">
        <Inbox className="h-8 w-8 mb-2" />
        <p>No offers sent yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {offers.map((offer) => {
        const displayName = offer.deal_type || 'Unknown Deal';
        return (
          <div key={offer.id} className="border border-border rounded-lg p-4 bg-card">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold text-lg">
                  {displayName}
                </h3>
                {offer.celebrity_profile && (
                  <div className="text-sm text-muted-foreground mt-1">
                    <span className="font-medium">
                      {offer.celebrity_profile.display_name || 'Unknown'}
                    </span>
                    {offer.celebrity_profile.username && (
                      <span className="ml-1">@{offer.celebrity_profile.username}</span>
                    )}
                  </div>
                )}
                {offer.deal_type && (
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {offer.deal_type}
                  </p>
                )}
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(offer.status)}`}>
                {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
              </span>
            </div>
            {offer.budget_range && (
              <p className="text-sm mb-2 flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                <span className="font-medium">Budget:</span> {offer.budget_range}
              </p>
            )}
            {offer.timeline && (
              <p className="text-sm mb-2 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                <span className="font-medium">Timeline:</span> {offer.timeline}
              </p>
            )}
            {offer.details && (
              <p className="text-sm text-muted-foreground flex items-start gap-1">
                <FileText className="h-3.5 w-3.5 mt-0.5" />
                <span>{offer.details}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
