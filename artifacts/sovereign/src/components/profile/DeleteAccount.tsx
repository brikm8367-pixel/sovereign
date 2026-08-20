import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export function DeleteAccount() {
  const { isRTL } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;

      toast.success(isRTL ? 'تم حذف حسابك بنجاح' : 'Your account has been successfully deleted');
      
      // Sign out the user locally and redirect
      await supabase.auth.signOut();
      navigate('/');
    } catch (err: any) {
      console.error('Error deleting account:', err);
      toast.error(isRTL ? 'تعذّر حذف الحساب. حاول مرة أخرى.' : 'Could not delete account. Please try again.');
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Button 
        variant="destructive" 
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto"
      >
        <Trash2 className="h-4 w-4 me-2" />
        {isRTL ? 'حذف الحساب' : 'Delete Account'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {isRTL ? 'تأكيد حذف الحساب' : 'Confirm Account Deletion'}
            </DialogTitle>
            <DialogDescription>
              {isRTL 
                ? 'هذا الإجراء لا يمكن التراجع عنه. سيتم حذف جميع بياناتك بشكل دائم.'
                : 'This action cannot be undone. All your data will be permanently deleted.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={loading}>
                {isRTL ? 'إلغاء' : 'Cancel'}
              </Button>
            </DialogClose>
            <Button 
              variant="destructive" 
              onClick={handleDelete} 
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 me-2" />
              )}
              {isRTL ? 'حذف نهائي' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
