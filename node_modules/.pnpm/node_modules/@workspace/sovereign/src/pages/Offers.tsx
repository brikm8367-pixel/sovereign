import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { useLanguage } from '@/i18n/LanguageContext';
import { BottomNavigation } from '@/components/BottomNavigation';
import OfferStatusTracker from '@/components/OfferStatusTracker';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

export default function OffersPage() {
  const { user, loading } = useAuth();
  const { role } = useRole();
  const { isRTL } = useLanguage();
  const navigate = useNavigate();

  // Redirect managers to home
  useEffect(() => {
    if (!loading && role === 'manager') {
      navigate('/home', { replace: true });
    }
  }, [loading, role, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Return null for managers (redirecting)
  if (role === 'manager') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="fixed top-0 right-0 left-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border safe-area-inset-top">
        <div className="max-w-lg mx-auto flex h-14 items-center justify-between px-4">
          <h1 className="font-bold text-lg">
            {isRTL ? 'عروضي' : 'My Offers'}
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto pt-16 pb-20 px-4">
        <OfferStatusTracker />
      </main>

      <BottomNavigation />
    </div>
  );
}
