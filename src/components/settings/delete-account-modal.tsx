'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, UserX, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { clearUserFinancialClientState } from '@/lib/client-reset';

const REQUIRED_CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT';

export function DeleteAccountModal() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'warning' | 'confirm' | 'progress'>('warning');
  const [inputPhrase, setInputPhrase] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOpenChange = (open: boolean) => {
    if (isDeleting) return; // Prevent closing while account deletion is in progress
    setIsOpen(open);
    if (open) {
      setInputPhrase('');
      setErrorMessage(null);
      setStep('warning');
    }
  };

  const handleExecuteDelete = async () => {
    if (inputPhrase !== REQUIRED_CONFIRMATION_PHRASE) {
      toast.error(`You must type exactly "${REQUIRED_CONFIRMATION_PHRASE}"`);
      return;
    }

    setIsDeleting(true);
    setStep('progress');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation: REQUIRED_CONFIRMATION_PHRASE,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Account deletion failed on server.');
      }

      // Clear client state
      await clearUserFinancialClientState(queryClient);

      toast.success('Your NisFlow account has been permanently deleted.');

      // Invalidate and redirect to login
      setTimeout(() => {
        setIsOpen(false);
        window.location.href = '/login';
      }, 1000);
    } catch (err: any) {
      console.error('Account deletion error:', err);
      setErrorMessage(err.message || 'Account deletion failed.');
      setStep('confirm');
      toast.error(err.message || 'Account deletion failed.');
    } finally {
      setIsDeleting(false);
    }
  };

  const isPhraseMatching = inputPhrase === REQUIRED_CONFIRMATION_PHRASE;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="gap-2 bg-destructive hover:bg-destructive/90">
          <UserX className="h-4 w-4" />
          Delete Account
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive font-bold text-lg">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle className="text-destructive font-bold">Delete Account</DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground pt-1">
            Permanently delete your NisFlow account, financial records, and login authentication.
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: WARNING */}
        {step === 'warning' && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3 text-xs leading-relaxed text-destructive-foreground">
              <div className="font-semibold flex items-center gap-1.5 text-destructive text-sm">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>IRREVERSIBLE DESTRUCTION WARNING</span>
              </div>
              <p className="text-muted-foreground">
                Deleting your account is <strong>permanent and cannot be undone</strong>. If you proceed:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-1">
                <li>Your entire double-entry accounting ledger will be permanently purged.</li>
                <li>All linked bank accounts, transactions, and categories will be deleted.</li>
                <li>All loans, investments, savings goals, and document attachments will be removed.</li>
                <li>Your profile and Supabase authentication identity will be permanently erased.</li>
                <li>You will immediately be logged out and will never be able to access this data again.</li>
              </ul>
            </div>

            <div className="p-3 bg-muted/40 rounded-lg border text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Need a copy of your records first?</span>
              <p className="mt-0.5">
                We strongly recommend downloading a JSON or SQL backup from the Offline Backups section before deleting your account.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button variant="ghost" onClick={() => setIsOpen(false)}>
                Keep Account
              </Button>
              <Button
                variant="destructive"
                onClick={() => setStep('confirm')}
              >
                I Understand, Continue to Confirmation
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* STEP 2: CONFIRM */}
        {step === 'confirm' && (
          <div className="space-y-4 py-2">
            <div className="p-3 bg-muted/40 rounded-lg border text-xs space-y-2">
              <p className="font-semibold text-foreground">
                To confirm permanent account deletion, please type the confirmation phrase below:
              </p>
              <div className="font-mono text-center font-bold text-sm tracking-wider py-1.5 bg-background rounded border text-destructive select-all">
                {REQUIRED_CONFIRMATION_PHRASE}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Type exact confirmation phrase:
              </label>
              <Input
                value={inputPhrase}
                onChange={(e) => setInputPhrase(e.target.value)}
                placeholder="DELETE MY ACCOUNT"
                className="font-mono text-sm tracking-wider text-center"
                autoFocus
              />
            </div>

            {errorMessage && (
              <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                {errorMessage}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button variant="outline" onClick={() => setStep('warning')} disabled={isDeleting}>
                Back
              </Button>
              <Button
                variant="destructive"
                disabled={!isPhraseMatching || isDeleting}
                onClick={handleExecuteDelete}
                className="gap-2"
              >
                <UserX className="h-4 w-4" />
                Permanently Delete My Account
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* STEP 3: PROGRESS */}
        {step === 'progress' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-destructive" />
            <div className="space-y-1">
              <h3 className="font-bold text-base text-foreground">Deleting your NisFlow account…</h3>
              <p className="text-xs text-muted-foreground font-mono">
                Purging financial ledgers, storage files, and authentication records...
              </p>
            </div>
            <p className="text-xs text-muted-foreground italic max-w-xs">
              Please do not close this browser window.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
