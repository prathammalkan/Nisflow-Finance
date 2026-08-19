'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useRecordRepayment, usePersonLedger, usePeople } from '@/lib/hooks/use-people';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { formatINR } from '@/lib/finance/money';
import { toast } from 'sonner';
import Decimal from 'decimal.js';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';

const formSchema = z.object({
  direction: z.enum(['in', 'out']),
  counterpartyId: z.string().min(1, 'Person is required'),
  accountId: z.string().min(1, 'Account is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than ₹0.00'),
  date: z.string().min(1, 'Date is required'),
  description: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface RepaymentDialogProps {
  trigger?: React.ReactNode;
  personId?: string;
  defaultDirection?: 'in' | 'out';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function RepaymentDialog({
  trigger,
  personId: initialPersonId,
  defaultDirection = 'in',
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: RepaymentDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = setControlledOpen || setInternalOpen;

  const { data: people } = usePeople();
  const { data: accounts } = useAccounts();
  const recordRepaymentMutation = useRecordRepayment();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      direction: defaultDirection,
      counterpartyId: initialPersonId || '',
      accountId: '',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      description: '',
      notes: '',
    },
  });

  const selectedPersonId = form.watch('counterpartyId') || initialPersonId;
  const selectedDirection = form.watch('direction');
  const enteredAmount = form.watch('amount');

  // Fetch live authoritative balances for selected person
  const { data: personLedger } = usePersonLedger(selectedPersonId || '');

  // Set default account when accounts load
  useEffect(() => {
    if (accounts && accounts.length > 0 && !form.getValues('accountId')) {
      form.setValue('accountId', accounts[0].id);
    }
  }, [accounts, form]);

  useEffect(() => {
    if (initialPersonId) {
      form.setValue('counterpartyId', initialPersonId);
    }
  }, [initialPersonId, form]);

  const maxOutstanding = personLedger
    ? selectedDirection === 'in'
      ? personLedger.balances.receivableBalance
      : personLedger.balances.payableBalance
    : 0;

  const isOverpaid = new Decimal(enteredAmount || 0).gt(new Decimal(maxOutstanding || 0));

  const handleSetFullSettlement = () => {
    if (maxOutstanding > 0) {
      form.setValue('amount', maxOutstanding);
    }
  };

  async function onSubmit(data: FormValues) {
    if (isOverpaid) {
      toast.error(
        `Overpayment Error: Amount of ₹${data.amount} exceeds outstanding balance of ₹${maxOutstanding}.`
      );
      return;
    }

    try {
      await recordRepaymentMutation.mutateAsync({
        counterpartyId: data.counterpartyId,
        accountId: data.accountId,
        amount: data.amount,
        direction: data.direction,
        date: data.date,
        description: data.description || (data.direction === 'in' ? 'Repayment received' : 'Repayment made'),
        notes: data.notes || null,
      });

      toast.success(
        data.direction === 'in'
          ? `Recorded ₹${data.amount} repayment received!`
          : `Recorded ₹${data.amount} debt repayment made!`
      );
      setOpen(false);
      form.reset({
        direction: defaultDirection,
        counterpartyId: initialPersonId || '',
        accountId: accounts?.[0]?.id || '',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        description: '',
        notes: '',
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to record repayment');
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Record Repayment
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Direction Toggle */}
            <FormField
              control={form.control}
              name="direction"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Repayment Type</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={`flex items-center justify-center gap-2 border rounded-lg p-3 cursor-pointer transition-colors text-xs font-medium ${
                          field.value === 'in'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold'
                            : 'border-border text-muted-foreground hover:bg-muted/50'
                        }`}
                        onClick={() => field.onChange('in')}
                      >
                        <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
                        They Pay Me
                      </button>

                      <button
                        type="button"
                        className={`flex items-center justify-center gap-2 border rounded-lg p-3 cursor-pointer transition-colors text-xs font-medium ${
                          field.value === 'out'
                            ? 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 font-semibold'
                            : 'border-border text-muted-foreground hover:bg-muted/50'
                        }`}
                        onClick={() => field.onChange('out')}
                      >
                        <ArrowUpRight className="h-4 w-4 text-red-600" />
                        I Pay Them
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Person selector if not fixed */}
            {!initialPersonId && (
              <FormField
                control={form.control}
                name="counterpartyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Person / Counterparty *</FormLabel>
                    <FormControl>
                      <Select value={field.value} onChange={(e) => field.onChange(e.target.value)}>
                        <option value="">Select person</option>
                        {people?.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Outstanding Balance Banner */}
            {selectedPersonId && personLedger && (
              <div
                className={`p-3 rounded-lg border text-xs flex justify-between items-center ${
                  selectedDirection === 'in'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-500/10 border-red-500/20 text-red-800 dark:text-red-300'
                }`}
              >
                <div>
                  <span className="font-semibold uppercase tracking-wider block text-[10px]">
                    {selectedDirection === 'in' ? 'Outstanding Receivable' : 'Outstanding Debt (Payable)'}
                  </span>
                  <span className="text-base font-bold">{formatINR(maxOutstanding)}</span>
                </div>
                {maxOutstanding > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleSetFullSettlement}
                  >
                    Full Settle
                  </Button>
                )}
              </div>
            )}

            {/* Account Selector */}
            <FormField
              control={form.control}
              name="accountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{selectedDirection === 'in' ? 'Deposit Account *' : 'Payment Account *'}</FormLabel>
                  <FormControl>
                    <Select value={field.value} onChange={(e) => field.onChange(e.target.value)}>
                      <option value="">Select account</option>
                      {accounts?.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type}) - Balance: {formatINR(acc.balance || 0)}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (₹) *</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  {isOverpaid && (
                    <div className="flex items-center gap-1 text-destructive text-xs font-medium mt-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>Overpayment error: Amount exceeds outstanding balance of {formatINR(maxOutstanding)}</span>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date */}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Transaction Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes / Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Additional details..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={recordRepaymentMutation.isPending || isOverpaid || Number(enteredAmount) <= 0}
              >
                {recordRepaymentMutation.isPending ? 'Posting to Ledger...' : 'Confirm Repayment'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
