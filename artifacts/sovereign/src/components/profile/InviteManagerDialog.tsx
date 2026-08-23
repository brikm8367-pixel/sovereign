import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, Copy, Check, Link2, ShieldCheck, Clock, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { buildShareLink } from '@/lib/appUrl';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface Invite {
  code: string;
  token: string;
  expires_at: string;
}

export function InviteManagerDialog({ open, onOpenChange }: Props) {
  const { isRTL } = useLanguage();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const inviteLink = invite ? buildShareLink(`/m/${invite.token}?code=${invite.code}`) : '';

  // Countdown to expiry.
  useEffect(() => {
    if (!invite) return;
    const tick = () => {
      const ms = new Date(invite.expires_at).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [invite]);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setPassword(''); setInvite(null); setLoading(false);
      setCopiedLink(false); setCopiedCode(false);
    }
  }, [open]);

  const generate = async () => {
    if (!password) { toast.error(isRTL ? 'أدخل كلمة المرور' : 'Enter your password'); return; }
    setLoading(true);
    console.log('[InviteManagerDialog] Attempting to generate invitation...');
    
    const attemptInvite = async (attempt: number): Promise<{ data: any; error: any }> => {
      console.log(`[InviteManagerDialog] Invoking Supabase function: create-manager-invite (attempt ${attempt})`);
      const { data, error } = await supabase.functions.invoke('create-manager-invite', {
        body: JSON.stringify({ password }),
        headers: { 'Content-Type': 'application/json' },
      });
      console.log(`[InviteManagerDialog] Supabase response data (attempt ${attempt}):`, data);
      console.log(`[InviteManagerDialog] Supabase response error (attempt ${attempt}):`, error);
      return { data, error };
    };

    let lastError: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { data, error } = await attemptInvite(attempt);

        if (error) {
          console.error(`Supabase function invocation error (attempt ${attempt}):`, error);
          // Check if it's a non-2xx error (FunctionsHttpError) or network error
          const isHttpError = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' && error.status >= 400;
          const isNetworkError = error && (error.name === 'TypeError' || error.message?.includes('network') || error.message?.includes('fetch'));
          const shouldRetry = attempt === 1 && (isHttpError || isNetworkError || (error.status === 403));
          
          if (shouldRetry) {
            console.log('[InviteManagerDialog] Retrying in 1 second...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue; // retry
          }
          throw error;
        }
        if (data?.error) {
          console.error('Edge function returned an error:', data.error);
          throw new Error(data.error);
        }

        console.log('[InviteManagerDialog] Invitation generated successfully:', data);
        setInvite(data as Invite);
        setPassword('');
        return; // success, exit function
      } catch (err: any) {
        lastError = err;
        console.error(`Attempt ${attempt} failed:`, err);
        // If this was the last attempt, break to show toast
        if (attempt === 2) break;
        // Otherwise, wait and retry (but only if it's a retryable error)
        // The retry logic is already handled above with continue, so we only reach here for non-retryable errors on first attempt
        // For non-retryable errors on first attempt, we break and show toast
        break;
      }
    }

    // If we reach here, both attempts failed (or first attempt failed with non-retryable error)
    console.error('Failed to create manager invitation after retries. Full error details:', lastError);
    console.error('Error message:', lastError?.message);
    console.error('Error name:', lastError?.name);
    console.error('Error stack:', lastError?.stack);
    const msg = lastError?.message || '';
    toast.error(
      msg.toLowerCase().includes('password')
        ? (isRTL ? 'كلمة المرور غير صحيحة' : 'Invalid password')
        : (isRTL ? 'تعذّر إنشاء الدعوة' : 'Could not create invitation'),
    );
    finally {
      setLoading(false);
    }
  };

  const expired = invite && remaining <= 0;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  const handleShare = async () => {
    if (!invite) return;
    const shareText = isRTL 
      ? `دعوة لإدارة صندوق العمل. الرابط: ${inviteLink} الكود: ${invite.code}` 
      : `Manager invitation. Link: ${inviteLink} Code: ${invite.code}`;
    
    try {
      if (navigator.share) {
        await navigator.share({ 
          title: 'Sovereign', 
          text: shareText, 
          url: inviteLink 
        });
      } else {
        await navigator.clipboard.writeText(`${shareText}`);
        toast.success(isRTL ? 'تم نسخ الرابط والكود' : 'Link and code copied');
      }
      setCopiedLink(true); 
      setTimeout(() => setCopiedLink(false), 2000);
    } catch { /* cancelled */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-500" />
            {isRTL ? 'دعوة وكيل' : 'Invite Manager'}
          </DialogTitle>
          <DialogDescription>
            {isRTL
              ? 'أكّد كلمة مرورك لإنشاء كود ورابط صالحين لمدة 15 دقيقة.'
              : 'Confirm your password to generate a code & link valid for 15 minutes.'}
          </DialogDescription>
        </DialogHeader>

        {!invite ? (
          <div className="space-y-3 py-2">
            <Input
              type="password"
              autoComplete="current-password"
              placeholder={isRTL ? 'كلمة المرور' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generate()}
              className="rounded-xl h-12"
            />
            <Button onClick={generate} disabled={loading} className="w-full h-12 rounded-xl">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <><ShieldCheck className="h-4 w-4 me-2" />{isRTL ? 'إنشاء الدعوة' : 'Generate Invitation'}</>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className={`flex items-center justify-center gap-2 text-sm font-medium ${expired ? 'text-destructive' : 'text-amber-600'}`}>
              <Clock className="h-4 w-4" />
              {expired
                ? (isRTL ? 'انتهت صلاحية الدعوة' : 'Invitation expired')
                : `${mins}:${secs.toString().padStart(2, '0')}`}
            </div>

            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground">{isRTL ? 'الكود' : 'Code'}</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-bold tracking-[0.3em] font-mono">{invite.code}</span>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                  navigator.clipboard.writeText(invite.code);
                  setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000);
                }}>
                  {copiedCode ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button
              variant="default"
              className="w-full rounded-xl"
              disabled={!!expired}
              onClick={handleShare}
            >
              {copiedLink ? <Check className="h-4 w-4 me-2 text-emerald-500" /> : <Link2 className="h-4 w-4 me-2" />}
              {isRTL ? 'مشاركة الدعوة' : 'Share Invitation'}
            </Button>

            {expired && (
              <Button onClick={() => setInvite(null)} className="w-full rounded-xl h-11">
                {isRTL ? 'إنشاء دعوة جديدة' : 'Generate new invitation'}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
