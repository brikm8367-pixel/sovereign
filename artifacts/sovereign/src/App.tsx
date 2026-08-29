import { useState, useEffect, lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "./i18n/LanguageContext";
import { AuthProvider } from "./hooks/useAuth";
import { RoleProvider } from "./hooks/useRole.tsx";
import { ThemeProvider } from "./hooks/useTheme";
import { SplashScreen } from "./components/SplashScreen";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { useAuth } from "./hooks/useAuth";
import { useRegisterSW } from 'virtual:pwa-register/react';

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Install = lazy(() => import("./pages/Install"));
const Profile = lazy(() => import("./pages/Profile"));
const Notifications = lazy(() => import("./pages/Notifications"));
const AdminStats = lazy(() => import("./pages/AdminStats"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PublicProfile = lazy(() => import("./pages/PublicProfile"));
const Launch = lazy(() => import("./pages/Launch"));
const Security = lazy(() => import("./pages/Security"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Subscribe = lazy(() => import("./pages/Subscribe"));
const BugBounty = lazy(() => import("./pages/BugBounty"));
const ComposePage = lazy(() => import("./pages/ComposePage").then(m => ({ default: m.ComposePage })));
const SearchPage = lazy(() => import("./pages/SearchPage"));

const RedeemManagerInvite = lazy(() => import("./pages/RedeemManagerInvite"));
const SlugRedirect = lazy(() => import("./pages/SlugRedirect"));
const Offers = lazy(() => import("./pages/Offers"));
const ChatPage = lazy(() => import("./pages/ChatPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
  </div>
);

const AppRoutes = () => {
  const { loading } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Auth />} />
        <Route path="/home" element={<Dashboard />} />
        <Route path="/welcome" element={<Index />} />
        <Route path="/install" element={<Install />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/admin" element={<AdminStats />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/launch" element={<Launch />} />
        <Route path="/security" element={<Security />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/subscribe" element={<Subscribe />} />
        <Route path="/security/bounty" element={<BugBounty />} />
        <Route path="/compose" element={<ComposePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/offers" element={<Offers />} />
        <Route path="/join-manager/:celebrityId" element={<Navigate to="/home" replace />} />
        <Route path="/m/:token" element={<RedeemManagerInvite />} />
        <Route path="/s/:slug" element={<SlugRedirect />} />
        <Route path="/chat/:userId" element={<ChatPage />} />
        <Route path="/:username" element={<PublicProfile />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  useEffect(() => {
    const visited = sessionStorage.getItem('directly_visited');
    if (!visited) {
      setIsFirstVisit(true);
      sessionStorage.setItem('directly_visited', 'true');
    } else {
      setShowSplash(false);
    }
  }, []);

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Check for updates when user returns to the app
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && r) {
          r.update();
        }
      });
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <RoleProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <PWAInstallPrompt />
                <UpdatePrompt />
                
                {showSplash && isFirstVisit && (
                  <SplashScreen onComplete={() => setShowSplash(false)} />
                )}
                
                <BrowserRouter>
                  <AppRoutes />
                </BrowserRouter>
                
                {needRefresh && (
                  <div className="fixed bottom-0 left-0 right-0 z-50 p-4 safe-area-inset-bottom">
                    <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl shadow-xl p-4 flex flex-col gap-3">
                      <p className="text-center text-sm font-medium text-foreground">
                        يوجد تحديث جديد للتطبيق
                      </p>
                      <button
                        onClick={() => updateServiceWorker(true)}
                        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-medium touch-feedback active:scale-[0.98] transition-transform"
                      >
                        تحديث الآن
                      </button>
                    </div>
                  </div>
                )}
              </TooltipProvider>
            </RoleProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
};

export default App;
