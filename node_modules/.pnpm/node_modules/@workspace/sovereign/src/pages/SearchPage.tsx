import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Loader2, User, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * Échappe les caractères spéciaux pour une utilisation sûre dans un motif ILIKE PostgreSQL.
 * Les caractères % _ et , sont échappés avec un backslash.
 * Le caractère d'échappement par défaut dans PostgREST est le backslash.
 */
function escapeIlike(value: string): string {
  return value.replace(/[%_,]/g, (char) => `\\${char}`);
}

export default function SearchPage() {
  const { user, loading: authLoading } = useAuth();
  const { isRTL, language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const type = searchParams.get('type') || 'message'; // 'message' or 'deal'

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate('/');
  }, [user, authLoading, navigate]);

  const searchUsers = useCallback(async () => {
    if (searchQuery.length < 2 || !user) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      // Échapper la requête pour éviter l'injection de wildcards ILIKE
      const safeQuery = escapeIlike(searchQuery);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${safeQuery}%,display_name.ilike.%${safeQuery}%`)
        .neq('id', user.id) // exclude current user
        .limit(20);

      if (error) throw error;
      setSearchResults(data as Profile[] || []);
    } catch (err) {
      console.error('Search error:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(
        isRTL
          ? `خطأ في البحث: ${message}`
          : `Search failed: ${message}`,
      );
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, user, isRTL]);

  useEffect(() => {
    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [searchUsers]);

  const handleResultClick = (profile: Profile) => {
    if (type === 'deal') {
      // Naviguer vers /compose avec celebrityId et type=deal
      navigate(`/compose?celebrityId=${profile.id}&type=deal`);
    } else {
      // Naviguer vers /compose avec recipientId
      navigate(`/compose?recipientId=${profile.id}`);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null; // will redirect
  }

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="fixed top-0 right-0 left-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
        <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
          <h1 className="text-lg font-semibold">
            {type === 'deal'
              ? (isRTL ? 'اختر مشهوراً للصفقة' : 'Select Celebrity for Deal')
              : (isRTL ? 'اختر مستلمًا' : 'Select Recipient')}
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto pt-16 pb-20 px-4">
        <div className="relative mb-4">
          <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder={isRTL ? 'ابحث عن مستخدم...' : 'Search for a user...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ps-12 h-13 text-base rounded-2xl border-2 focus:border-primary"
            autoFocus
          />
          {isSearching && <Loader2 className="absolute end-4 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-primary" />}
        </div>

        {error && (
          <div className="text-center py-4 text-destructive text-sm">{error}</div>
        )}

        {searchQuery.length >= 2 ? (
          <div className="space-y-2">
            {searchResults.length === 0 && !isSearching ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {isRTL ? 'لم نجد أحداً بهذا الاسم' : "We couldn't find anyone with that name"}
                </p>
              </div>
            ) : (
              searchResults.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => handleResultClick(profile)}
                  className="flex items-center gap-3 w-full p-3 rounded-2xl bg-card border border-border touch-feedback text-start"
                >
                  <Avatar className="h-12 w-12 ring-2 ring-primary/10 flex-shrink-0">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {profile.display_name?.[0] || profile.username?.[0] || <User className="h-5 w-5" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{profile.display_name || profile.username}</p>
                    {profile.username && <p className="text-sm text-muted-foreground">@{profile.username}</p>}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center mb-3">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="font-medium mb-1">
              {type === 'deal'
                ? (isRTL ? 'ابحث عن مشهور لإرسال صفقة' : 'Search for a celebrity to send a deal')
                : (isRTL ? 'من تريد أن يسمعك؟' : 'Who do you want to hear you?')}
            </p>
            <p className="text-sm text-muted-foreground">
              {isRTL ? 'اكتب اسم المستخدم أو الاسم المعروض' : 'Type a username or display name'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
