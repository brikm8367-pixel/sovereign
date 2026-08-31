import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(2).max(50),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [emailConfirmSent, setEmailConfirmSent] = useState(false);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const [resending, setResending] = useState(false);
  
  const { signIn, signUp, user, loading } = useAuth();
  const { isRTL } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Where to go after auth: honor a safe in-app ?redirect= path (e.g. manager invite links).
  const rawRedirect = searchParams.get('redirect') || '';
  const redirectTarget = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
    ? rawRedirect
    : '/home';

  useEffect(() => {
    if (!loading && user) {
      // Check for redirect in sessionStorage (from RedeemManagerInvite)
      const storedRedirect = sessionStorage.getItem('redirectAfterAuth');
      if (storedRedirect) {
        sessionStorage.removeItem('redirectAfterAuth');
        navigate(storedRedirect, { replace: true });
      } else if (location.state?.redirect) {
        // Fallback to location.state if set
        navigate(location.state.redirect, { replace: true });
      } else {
        navigate(redirectTarget, { replace: true });
      }
    }
  }, [user, loading, navigate, location.state, redirectTarget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        const validation = loginSchema.safeParse({ email, password });
        if (!validation.success) {
          setError('Please check your email and password');
          setIsLoading(false);
          return;
        }
        const { error: signInError } = await signIn(email, password);
        if (signInError) {
          const msg = signInError.message.toLowerCase();
          if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
            setError(isRTL ? 'كلمة المرور أو البريد غير صحيح.' : 'Email or password is incorrect.');
          } else if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
            setNeedsEmailConfirm(true);
            setError(isRTL ? 'يرجى تأكيد بريدك الإلكتروني أولاً.' : 'Please confirm your email first.');
          } else if (msg.includes('rate') || msg.includes('too many')) {
            setError(isRTL ? 'محاولات كثيرة — انتظر قليلاً.' : 'Too many attempts — please wait.');
          } else {
            setError(isRTL ? 'حدث خطأ — بياناتك آمنة.' : "Something didn't work — your messages are safe.");
          }
        }
      } else {
        const validation = signupSchema.safeParse({ email, password, displayName });
        if (!validation.success) {
          const firstError = validation.error.errors[0];
          if (firstError?.path[0] === 'displayName') {
            setError('Display name must be at least 2 characters');
          } else if (firstError?.path[0] === 'email') {
            setError('Please enter a valid email');
          } else if (firstError?.path[0] === 'password') {
            setError('Password must be at least 6 characters');
          }
          setIsLoading(false);
          return;
        }
        const { error: signUpError } = await signUp(email, password, displayName);
        if (signUpError) {
          if (signUpError.message.includes('already registered') || signUpError.message.includes('User already registered')) {
            setError(isRTL ? 'يبدو أن لديك حساباً بالفعل — سجّل دخولك.' : 'Looks like you already have an account — sign in.');
          } else if (signUpError.message.includes('rate')) {
            setError(isRTL ? 'الرجاء الانتظار قليلاً ثم المحاولة مرة أخرى.' : 'Please wait a moment and try again.');
          } else {
            setError(isRTL ? 'حدث خطأ — بياناتك آمنة.' : "Something didn't work — your messages are safe.");
          }
        } else {
          // Supabase sends a confirmation email; show dedicated screen.
          setEmailConfirmSent(true);
          setError('');
        }
      }
    } catch {
      setError('Something didn\'t work — your messages are safe.');
    } finally {
      setIsLoading(false);
    }
  };

  const resendConfirmation = async () => {
    if (!email.trim()) return;
    setResending(true);
    await supabase.auth.resend({ type: 'signup', email });
    setResending(false);
    setNeedsEmailConfirm(false);
    setEmailConfirmSent(true);
    setError('');
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Please enter your email first');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      setError('');
    } catch {
      setError('Something didn\'t work — try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setIsForgotPassword(false);
    setResetSent(false);
    setEmailConfirmSent(false);
    setNeedsEmailConfirm(false);
    setError('');
    setEmail('');
    setPassword('');
    setDisplayName('');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // ── Email confirmation screen (after sign-up or resend) ──
  if (emailConfirmSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-6">
        <div className="w-full max-w-sm text-center space-y-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mx-auto">
            <span className="text-3xl">📬</span>
          </div>
          <div>
            <h1 className="text-xl font-bold">{isRTL ? 'تحقّق من بريدك' : 'Check your email'}</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              {isRTL
                ? `أرسلنا رابط التأكيد إلى ${email || 'بريدك الإلكتروني'} — انقر عليه لتفعيل حسابك.`
                : `We sent a confirmation link to ${email || 'your email'} — click it to activate your account.`}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {isRTL ? 'لم يصلك البريد؟ تحقّق من مجلد Spam.' : "Didn't receive it? Check your spam folder."}
          </p>
          <button
            onClick={() => { setEmailConfirmSent(false); setIsLogin(true); }}
            className="text-sm text-primary hover:underline"
          >
            {isRTL ? 'العودة لتسجيل الدخول' : 'Back to sign in'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <MessageSquare className="h-7 w-7" />
          </div>
          <span className="text-2xl font-bold text-foreground">Sovereign</span>
          <p className="text-sm text-muted-foreground text-center max-w-[250px]">
            {isRTL ? 'صندوقك، قواعدك' : 'Your inbox, your rules'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl p-6 border border-border shadow-lg">
          <h1 className="text-xl font-semibold text-center mb-1">
            {isLogin
              ? (isRTL ? 'مرحباً بعودتك' : 'Welcome back')
              : (isRTL ? 'ابدأ رحلتك' : 'Start your journey')}
          </h1>
          <p className="text-xs text-muted-foreground text-center mb-6">
            {isLogin
              ? (isRTL ? 'رسائلك بانتظارك — كل شيء في مكانه.' : 'Your messages are waiting — everything in its place.')
              : (isRTL ? 'حسابك على وشك الاكتمال.' : 'Your account is almost ready.')}
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-2">
              <p className="text-sm text-destructive text-center">{error}</p>
              {needsEmailConfirm && (
                <button
                  onClick={resendConfirmation}
                  disabled={resending}
                  className="w-full text-xs text-primary hover:underline flex items-center justify-center gap-1"
                >
                  {resending
                    ? (isRTL ? 'جارٍ الإرسال...' : 'Sending...')
                    : (isRTL ? 'إعادة إرسال رابط التأكيد' : 'Resend confirmation email')}
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-sm font-medium">
                  What name do you want the world to see you by?
                </Label>
                <Input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="John Doe"
                  className="h-11"
                  autoComplete="name"
                  disabled={isLoading}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                {isLogin ? 'Email' : 'Your email — this will be your private gateway.'}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="h-11"
                autoComplete="email"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                {isLogin ? 'Password' : 'Your private key — only you know it.'}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 pe-10"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {isLogin && (
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs text-primary hover:underline mt-1"
                disabled={isLoading}
              >
                Forgot your password?
              </button>
            )}

            {resetSent && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mt-2">
                <p className="text-sm text-emerald-600 dark:text-emerald-400 text-center">
                  Check your email — we sent you a recovery link.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full h-11 font-medium" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                isLogin ? 'Sign In' : 'Start your journey'
              )}
            </Button>
          </form>

          {/* E2E Trust badge */}
          <div className="flex items-center justify-center gap-1.5 mt-6 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">End-to-end encrypted · Zero tracking</span>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            You must be 13 years or older to use Sovereign.
          </p>

          <div className="mt-5 text-center">
            <button type="button" onClick={switchMode} className="text-sm text-muted-foreground hover:text-primary transition-colors" disabled={isLoading}>
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <span className="font-medium text-primary">{isLogin ? 'Sign Up' : 'Sign In'}</span>
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button onClick={() => navigate('/welcome')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            What is Sovereign?
          </button>
        </div>
      </div>
    </div>
  );
}
