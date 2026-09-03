'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Decimal from 'decimal.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { useRecordLoanEMI } from '@/lib/hooks/use-loans';
import { formatINR } from '@/lib/finance/money';
import { calculateEMI } from '@/lib/finance/loans';
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

const emiSchema = z.object({
  accountId: z.string().min(1, 'Payment account is required'),
  principalAmount: z.number().min(0, 'Principal cannot be negative'),
  interestAmount: z.number().min(0, 'Interest cannot be negative'),
  totalAmount: z.number().positive('Total EMI must be strictly greater than ₹0.00'),
  date: z.string().min(1, 'Payment date is required'),
  description: z.string().optional(),
  notes: z.string().optional(),
});

type EMIFormValues = z.infer<typeof emiSchema>;

interface EmiPaymentDialogProps {
  loan: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmiPaymentDialog({ loan, open, onOpenChange }: EmiPaymentDialogProps) {
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { mutateAsync: recordEMI, isPending } = useRecordLoanEMI();

  const outstandingPrincipal = loan?.authoritativeRemainingPrincipal !== undefined
    ? Number(loan.authoritativeRemainingPrincipal)
    : Number(loan?.remaining_principal ?? loan?.principal_amount ?? 0);

  const interestRate = Number(loan?.interest_rate || 0);
  const tenureMonths = Number(loan?.tenure_months || 12);
  const initialPrincipal = Number(loan?.principal_amount || outstandingPrincipal);

  // Compute estimated standard EMI and interest/principal split
  const standardEMI = calculateEMI(initialPrincipal, interestRate, tenureMonths);
  const monthlyRate = new Decimal(interestRate).dividedBy(12).dividedBy(100);
  const estimatedInterest = new Decimal(outstandingPrincipal).times(monthlyRate).toDecimalPlaces(2);
  const estimatedPrincipal = Decimal.min(
    outstandingPrincipal,
    Decimal.max(0, standardEMI.minus(estimatedInterest))
  ).toDecimalPlaces(2);
  const estimatedTotal = estimatedPrincipal.plus(estimatedInterest);

  const form = useForm<EMIFormValues>({
    resolver: zodResolver(emiSchema),
    defaultValues: {
      accountId: '',
      principalAmount: estimatedPrincipal.toNumber(),
      interestAmount: estimatedInterest.toNumber(),
      totalAmount: estimatedTotal.toNumber(),
      date: new Date().toISOString().split('T')[0],
      description: '',
      notes: '',
    },
  });

  // Update defaults when loan changes
  useEffect(() => {
    if (loan && open) {
      const p = estimatedPrincipal.toNumber();
      const i = estimatedInterest.toNumber();
      form.reset({
        accountId: accounts && accounts.length > 0 ? accounts[0].id : '',
        principalAmount: p,
        interestAmount: i,
        totalAmount: Number(new Decimal(p).plus(i).toFixed(2)),
        date: new Date().toISOString().split('T')[0],
        description: `EMI Payment for ${loan.name}`,
        notes: '',
      });
    }
  }, [loan, open, accounts]);

  const watchedPrincipal = form.watch('principalAmount') || 0;
  const watchedInterest = form.watch('interestAmount') || 0;
  const watchedTotal = form.watch('totalAmount') || 0;

  const sumCheck = new Decimal(watchedPrincipal).plus(watchedInterest);
  const isSumMatched = sumCheck.equals(new Decimal(watchedTotal || 0));
  const isOverpayingPrincipal = new Decimal(watchedPrincipal).gt(outstandingPrincipal);
  const projectedRemainingPrincipal = Decimal.max(0, new Decimal(outstandingPrincipal).minus(watchedPrincipal));

  const handleApplySplit = (principal: number, interest: number) => {
    const total = Number(new Decimal(principal).plus(interest).toFixed(2));
    form.setValue('principalAmount', principal, { shouldValidate: true });
    form.setValue('interestAmount', interest, { shouldValidate: true });
    form.setValue('totalAmount', total, { shouldValidate: true });
  };

  const onSubmit = async (values: EMIFormValues) => {
    if (!loan) return;

    if (isOverpayingPrincipal) {
      form.setError('principalAmount', {
        message: `Principal exceeds remaining balance of ${formatINR(outstandingPrincipal)}`,
      });
      return;
    }

    if (!isSumMatched) {
      form.setError('totalAmount', {
        message: `Total EMI must equal Principal (${formatINR(watchedPrincipal)}) + Interest (${formatINR(watchedInterest)})`,
      });
      return;
    }

    try {
      await recordEMI({
        loanId: loan.id,
        loanName: loan.name,
        accountId: values.accountId,
        principalAmount: values.principalAmount,
        interestAmount: values.interestAmount,
        totalAmount: values.totalAmount,
        date: values.date,
        description: values.description || `EMI Payment for ${loan.name}`,
        notes: values.notes,
      });
      onOpenChange(false);
    } catch {
      // Error handled by hook toast
    }
  };

  if (!loan) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center justify-between">
            <span>Record Loan EMI Payment</span>
          </DialogTitle>
          <DialogDescription>
            {loan.name} • {loan.lender_name || 'Lender'} • {loan.interest_rate}% p.a.
          </DialogDescription>
        </DialogHeader>

        {/* Balance Status Banner */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-xl border">
          <div>
            <span className="text-xs text-muted-foreground uppercase font-semibold">
              Current Outstanding Principal
            </span>
            <div className="text-lg font-bold text-foreground mt-0.5">
              {formatINR(outstandingPrincipal)}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground uppercase font-semibold">
              Projected Balance After EMI
            </span>
            <div className={`text-lg font-bold mt-0.5 ${
              projectedRemainingPrincipal.isZero() ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
            }`}>
              {formatINR(projectedRemainingPrincipal.toNumber())}
            </div>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs gap-1 flex-1"
            onClick={() => handleApplySplit(estimatedPrincipal.toNumber(), estimatedInterest.toNumber())}
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" /> Standard EMI ({formatINR(estimatedTotal.toNumber())})
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs gap-1 flex-1"
            onClick={() => handleApplySplit(outstandingPrincipal, 0)}
          >
            Full Payoff ({formatINR(outstandingPrincipal)})
          </Button>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Account Selector */}
            <FormField
              control={form.control}
              name="accountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paying From (Bank / Cash Account)</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={accountsLoading}
                      {...field}
                    >
                      <option value="">Select source account...</option>
                      {accounts?.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({formatINR(acc.balance || 0)})
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Split Amounts: Principal & Interest */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="principalAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Principal Repayment (₹)</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={field.value}
                        onChange={(val) => {
                          field.onChange(val);
                          form.setValue(
                            'totalAmount',
                            Number(new Decimal(val || 0).plus(watchedInterest).toFixed(2))
                          );
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="interestAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interest Paid (₹)</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={field.value}
                        onChange={(val) => {
                          field.onChange(val);
                          form.setValue(
                            'totalAmount',
                            Number(new Decimal(watchedPrincipal).plus(val || 0).toFixed(2))
                          );
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Total EMI & Date */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="totalAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total EMI Deducted (₹)</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={field.value}
                        onChange={(val) => field.onChange(val)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Overpayment Warning */}
            {isOverpayingPrincipal && (
              <div className="flex items-center gap-2 p-3 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  Principal amount ({formatINR(watchedPrincipal)}) exceeds remaining loan principal ({formatINR(outstandingPrincipal)}).
                </span>
              </div>
            )}

            {/* Sum check warning */}
            {!isSumMatched && (
              <div className="flex items-center gap-2 p-3 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  Principal ({formatINR(watchedPrincipal)}) + Interest ({formatINR(watchedInterest)}) = {formatINR(sumCheck.toNumber())}, which differs from Total EMI ({formatINR(watchedTotal)}).
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || isOverpayingPrincipal || !isSumMatched || watchedTotal <= 0}
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Posting to Ledger...
                  </>
                ) : (
                  'Confirm & Post EMI'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
