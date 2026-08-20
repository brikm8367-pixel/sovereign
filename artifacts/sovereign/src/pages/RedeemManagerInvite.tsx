import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole.tsx';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Crown, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function RedeemManagerInvite() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const { isRTL } = useLanguage();
  const { switchCelebrity } = useRole();
  const navigate = useNavigate();
  const [code, setCode] = useState(searchParams.get('code') || '');
  const [joining, setJoining] = useState(false);
  const [done, setDone] = useState(false);

  const redeem = async () => {
    if (!user) return;
    if (code.length < 8) { toast.error(isRTL ? 'أدخل الكود كاملاً' : 'Enter the full code'); return; }
    setJoining(true);
    const { data, error } = await supabase.functions.invoke('redeem-manager-invite', {
      body: { token, code },
    });
    setJoining(false);
    if (error || data?.error) {
      const serverError = (data?.error || (error && (error.message || error.context)) || 'Error').toString();
      toast.error(isRTL ? `خطأ: ${serverError}` : `Error: ${serverError}`);
      return;
    }
    setDone(true);
    // Auto-switch to the newly managed celebrity
    if (data?.celebrity_id) {
      await switchCelebrity(data.celebrity_id);
    }
    toast.success(isRTL ? 'أصبحت وكيلاً الآن' : 'You are now a manager');
    setTimeout(() => navigate('/home'), 1200);
  };

  // If not authenticated, show sign-in card
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="h-16 w-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto">
            <Crown className="h-8 w-8 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{isRTL ? 'دعوة لتكون وكيلاً' : 'Manager Invitation'}</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {isRTL ? 'يجب تسجيل الدخول لقبول الدعوة' : 'Sign in to accept the invitation'}
            </p>
          </div>
          <Button
            onClick={() => navigate(`/?redirect=/m/${token}`)}
            className="w-full h-12 rounded-2xl"
          >
            {isRTL ? 'تسجيل الدخول للمتابعة' : 'Sign in to continue'}
          </Button>
        </div>
      </div>
    );
  }

  // Authenticated user flow
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="h-16 w-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto">
          <Crown className="h-8 w-8 text-amber-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{isRTL ? 'دعوة لتكون وكيلاً' : 'Manager Invitation'}</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {isRTL ? 'أدخل الكود المكوّن من 8 أرقام لتأكيد الدعوة' : 'Enter the 8-digit code to confirm'}
          </p>
        </div>

        {done ? (
          <div className="flex items-center justify-center gap-2 text-emerald-600">
            <Check className="h-5 w-5" /> {isRTL ? 'تم!' : 'Done!'}
          </div>
        ) : (
          <>
            <div className="flex justify-center" dir="ltr">
              <InputOTP maxLength={8} value={code} onChange={(v) => setCode(v.toUpperCase())}>
                <InputOTPGroup>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} className="w-9 h-11 text-base font-mono" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button onClick={redeem} disabled={joining || loading} className="w-full h-12 rounded-2xl">
              {joining ? <Loader2 className="h-5 w-5 animate-spin" /> : isRTL ? 'تأكيد وأصبحت وكيلاً' : 'Accept & Become Manager'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
