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
import { AlertTriangle, Trash2, Loader2, CheckCircle2, ShieldAlert, FileText, Database } from 'lucide-react';
import { toast } from 'sonner';
import { clearUserFinancialClientState } from '@/lib/client-reset';

const REQUIRED_CONFIRMATION_PHRASE = 'RESET MY DATA';

interface PreviewData {
  totalRecords: number;
  databaseRecords: number;
  storageFilesCount: number;
  breakdown: Record<string, number>;
}

export function ResetDataModal() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'preview' | 'confirm' | 'progress' | 'success'>('preview');
  const [inputPhrase, setInputPhrase] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [lifecycleProgress, setLifecycleProgress] = useState<string>('Preparing reset...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchPreview = async () => {
    setIsLoadingPreview(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/account/reset-data/preview');
      if (!res.ok) {
        throw new Error('Failed to load reset preview counts.');
      }
      const data = await res.json();
      setPreviewData(data);
      setStep('preview');
    } catch (err: any) {
      console.error('Preview error:', err);
      setErrorMessage(err.message || 'Could not fetch data preview.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (isResetting) return; // Prevent closing while destructive reset is executing
    setIsOpen(open);
    if (open) {
      setInputPhrase('');
      setErrorMessage(null);
      setStep('preview');
      fetchPreview();
    }
  };

  const handleExecuteReset = async () => {
    if (inputPhrase !== REQUIRED_CONFIRMATION_PHRASE) {
      toast.error(`You must type exactly "${REQUIRED_CONFIRMATION_PHRASE}"`);
      return;
    }

    setIsResetting(true);
    setStep('progress');
    setLifecycleProgress('1/4 Purging double-entry ledger & financial database...');

    try {
      // 1. Send Reset Request to Server
      const res = await fetch('/api/account/reset-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation: REQUIRED_CONFIRMATION_PHRASE,
        }),
      });

      setLifecycleProgress('2/4 Purging document storage objects...');

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Data reset failed on server.');
      }

      setLifecycleProgress('3/4 Verifying zero-record post-reset state...');

      // 2. Clear all NisFlow client-side caches and persistence
      setLifecycleProgress('4/4 Clearing local client cache and stores...');
      await clearUserFinancialClientState(queryClient);

      setStep('success');
      toast.success('Your NisFlow financial workspace has been completely reset.');

      // Wait briefly so user sees the verified success state, then redirect to clean dashboard
      setTimeout(() => {
        setIsOpen(false);
        router.push('/dashboard');
        router.refresh();
      }, 1800);
    } catch (err: any) {
      console.error('Reset execution failed:', err);
      setErrorMessage(err.message || 'Reset failed.');
      setStep('confirm');
      toast.error(err.message || 'Reset failed.');
    } finally {
      setIsResetting(false);
    }
  };

  const isPhraseMatching = inputPhrase === REQUIRED_CONFIRMATION_PHRASE;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="gap-2">
          <Trash2 className="h-4 w-4" />
          Reset All Financial Data
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive font-bold text-lg">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle className="text-destructive font-bold">Reset All Financial Data</DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground pt-1">
            This permanently deletes all your financial records, double-entry ledger history, and uploaded files.
          </DialogDescription>
        </DialogHeader>

        {/* ========================================================================= */}
        {/* STEP: PREVIEW                                                             */}
        {/* ========================================================================= */}
        {step === 'preview' && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 space-y-2 text-xs leading-relaxed text-destructive-foreground">
              <div className="font-semibold flex items-center gap-1.5 text-destructive">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>HIGH-RISK DESTRUCTIVE OPERATION</span>
              </div>
              <p className="text-muted-foreground">
                This action is <strong>permanent and irreversible</strong>. It will completely purge your accounts, transactions, double-entry journal entries, loans, investments, people balances, uploaded documents, and budget targets.
              </p>
              <p className="text-muted-foreground">
                Your <strong>NisFlow login and profile identity will remain active</strong>. After the reset, your financial workspace will be freshly initialized.
              </p>
            </div>

            {isLoadingPreview ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-2 text-muted-foreground text-sm">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span>Auditing user records...</span>
              </div>
            ) : previewData ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase border-b pb-1">
                  <span>Data Domain</span>
                  <span>Records Affected</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs max-h-48 overflow-y-auto p-1 border rounded-md bg-muted/20">
                  <div className="flex justify-between py-1 px-2 border-b">
                    <span className="text-muted-foreground">Accounts:</span>
                    <span className="font-semibold">{previewData.breakdown.accounts || 0}</span>
                  </div>
                  <div className="flex justify-between py-1 px-2 border-b">
                    <span className="text-muted-foreground">Transactions:</span>
                    <span className="font-semibold">{previewData.breakdown.transactions || 0}</span>
                  </div>
                  <div className="flex justify-between py-1 px-2 border-b">
                    <span className="text-muted-foreground">Journal Entries:</span>
                    <span className="font-semibold">{previewData.breakdown.journal_entries || 0}</span>
                  </div>
                  <div className="flex justify-between py-1 px-2 border-b">
                    <span className="text-muted-foreground">Journal Lines:</span>
                    <span className="font-semibold">{previewData.breakdown.journal_lines || 0}</span>
                  </div>
                  <div className="flex justify-between py-1 px-2 border-b">
                    <span className="text-muted-foreground">Ledger Accounts:</span>
                    <span className="font-semibold">{previewData.breakdown.ledger_accounts || 0}</span>
                  </div>
                  <div className="flex justify-between py-1 px-2 border-b">
                    <span className="text-muted-foreground">People & Counterparties:</span>
                    <span className="font-semibold">{previewData.breakdown.counterparties || 0}</span>
                  </div>
                  <div className="flex justify-between py-1 px-2 border-b">
                    <span className="text-muted-foreground">Loans:</span>
                    <span className="font-semibold">{previewData.breakdown.loans || 0}</span>
                  </div>
                  <div className="flex justify-between py-1 px-2 border-b">
                    <span className="text-muted-foreground">Investments & Portfolios:</span>
                    <span className="font-semibold">{previewData.breakdown.investments || 0}</span>
                  </div>
                  <div className="flex justify-between py-1 px-2 border-b">
                    <span className="text-muted-foreground">Budgets & Allocations:</span>
                    <span className="font-semibold">{previewData.breakdown.budgets || 0}</span>
                  </div>
                  <div className="flex justify-between py-1 px-2 border-b">
                    <span className="text-muted-foreground">Savings Goals:</span>
                    <span className="font-semibold">{previewData.breakdown.savings_goals || 0}</span>
                  </div>
                  <div className="flex justify-between py-1 px-2 border-b">
                    <span className="text-muted-foreground">Uploaded Documents:</span>
                    <span className="font-semibold">{previewData.breakdown.storage_documents || 0}</span>
                  </div>
                  <div className="flex justify-between py-1 px-2 border-b">
                    <span className="text-muted-foreground">Recurring Schedules:</span>
                    <span className="font-semibold">{previewData.breakdown.recurring_transactions || 0}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-sm font-semibold text-destructive">
                  <span>Total Records to Purge:</span>
                  <span>{previewData.totalRecords} records</span>
                </div>
              </div>
            ) : null}

            {errorMessage && (
              <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                {errorMessage}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button variant="ghost" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => setStep('confirm')}
                disabled={isLoadingPreview}
              >
                Proceed to Confirmation
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP: CONFIRM (TYPED CONFIRMATION)                                        */}
        {/* ========================================================================= */}
        {step === 'confirm' && (
          <div className="space-y-4 py-2">
            <div className="p-3 bg-muted/40 rounded-lg border text-xs space-y-2">
              <p className="font-semibold text-foreground">
                To confirm permanent reset, please type the confirmation phrase below:
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
                placeholder="RESET MY DATA"
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
              <Button variant="outline" onClick={() => setStep('preview')} disabled={isResetting}>
                Back to Preview
              </Button>
              <Button
                variant="destructive"
                disabled={!isPhraseMatching || isResetting}
                onClick={handleExecuteReset}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Permanently Reset My Data
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP: PROGRESS (LIFECYCLE FEEDBACK)                                       */}
        {/* ========================================================================= */}
        {step === 'progress' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-destructive" />
            <div className="space-y-1">
              <h3 className="font-bold text-base text-foreground">Resetting your NisFlow workspace…</h3>
              <p className="text-xs text-muted-foreground font-mono">{lifecycleProgress}</p>
            </div>
            <p className="text-xs text-muted-foreground italic max-w-xs">
              Please do not close or refresh this browser window while the reset operation is completing.
            </p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP: SUCCESS                                                             */}
        {/* ========================================================================= */}
        {step === 'success' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 animate-in zoom-in" />
            <h3 className="font-bold text-lg text-foreground">Financial Workspace Reset Complete</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              All financial records, ledger transactions, and document files have been completely purged. Redirecting to your clean dashboard...
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
