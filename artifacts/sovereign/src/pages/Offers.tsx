import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { useLanguage } from '@/i18n/LanguageContext';
import { BottomNavigation } from '@/components/BottomNavigation';
import OfferStatusTracker from '@/components/OfferStatusTracker';
import { Loader2, Briefcase } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

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
        {/* Create Offer CTA Button */}
        <Button
          onClick={() => navigate('/search?type=deal')}
          className="w-full h-12 rounded-2xl shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all touch-feedback flex items-center justify-center gap-2 font-medium"
        >
          <Briefcase className="h-5 w-5" />
          {isRTL ? 'إنشاء عرض' : 'Create Offer'}
        </Button>

        <OfferStatusTracker />
      </main>

      <BottomNavigation />
    </div>
  );
}
