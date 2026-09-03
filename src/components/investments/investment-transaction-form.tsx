'use client';

import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateInvestmentTransaction } from '@/lib/hooks/use-investments';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { toast } from 'sonner';
import Decimal from 'decimal.js';

const txSchema = z.object({
  investment_id: z.string().min(1, 'Investment is required'),
  type: z.enum(['buy', 'sell', 'dividend', 'split', 'bonus']),
  date: z.string().min(1, 'Date is required'),
  quantity: z.coerce.number().optional(),
  price: z.coerce.number().optional(),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  fees: z.coerce.number().optional(),
  taxes: z.coerce.number().optional(),
  account_id: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof txSchema>;

export function InvestmentTransactionForm({
  investmentId,
  investmentName,
  onClose,
}: {
  investmentId: string;
  investmentName?: string;
  onClose: () => void;
}) {
  const createTx = useCreateInvestmentTransaction();
  const { data: accounts } = useAccounts();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(txSchema),
    defaultValues: {
      investment_id: investmentId,
      type: 'buy',
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      fees: 0,
      taxes: 0,
      notes: '',
    },
  });

  const quantity = useWatch({ control, name: 'quantity' });
  const price = useWatch({ control, name: 'price' });
  const txType = useWatch({ control, name: 'type' });

  // Auto-calculate amount if quantity and price are provided
  useEffect(() => {
    if (quantity && price && quantity > 0 && price > 0) {
      const calculatedAmount = new Decimal(quantity).times(new Decimal(price)).toDecimalPlaces(2).toNumber();
      setValue('amount', calculatedAmount, { shouldValidate: true });
    }
  }, [quantity, price, setValue]);

  const onSubmit = (data: FormValues) => {
    createTx.mutate(
      {
        ...data,
        fees: data.fees || 0,
        taxes: data.taxes || 0,
      },
      {
        onSuccess: () => {
          toast.success(
            data.type === 'buy'
              ? 'SIP / Investment contribution recorded successfully'
              : 'Investment transaction recorded successfully'
          );
          onClose();
        },
        onError: (err: any) => {
          toast.error(err.message || 'Failed to record transaction');
        },
      }
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {txType === 'buy' ? 'Record SIP / Add Funds' : 'Add Investment Transaction'}
          </DialogTitle>
          {investmentName && (
            <DialogDescription className="font-medium text-foreground">
              Holding: {investmentName}
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <input type="hidden" {...register('investment_id')} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Transaction Type
              </label>
              <select
                {...register('type')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="buy">Buy / SIP Contribution</option>
                <option value="sell">Sell / Redemption</option>
                <option value="dividend">Dividend</option>
                <option value="split">Stock Split</option>
                <option value="bonus">Bonus Issue</option>
              </select>
              {errors.type && <p className="text-destructive text-xs mt-1">{errors.type.message}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Date
              </label>
              <input
                type="date"
                {...register('date')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.date && <p className="text-destructive text-xs mt-1">{errors.date.message}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Units / Quantity
              </label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 10.5"
                {...register('quantity')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.quantity && <p className="text-destructive text-xs mt-1">{errors.quantity.message}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Price / NAV per Unit (₹)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 150.25"
                {...register('price')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.price && <p className="text-destructive text-xs mt-1">{errors.price.message}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Amount (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 5000"
                {...register('amount')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.amount && <p className="text-destructive text-xs mt-1">{errors.amount.message}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Source / Linked Account
              </label>
              <select
                {...register('account_id')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">-- Optional: Select Account --</option>
                {accounts?.map((acc: any) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.account_number || acc.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Fees / Charges (₹)
              </label>
              <input
                type="number"
                step="0.01"
                defaultValue={0}
                {...register('fees')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Taxes / STT (₹)
              </label>
              <input
                type="number"
                step="0.01"
                defaultValue={0}
                {...register('taxes')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Notes / Reference
              </label>
              <input
                type="text"
                placeholder="e.g. Monthly SIP installment #14"
                {...register('notes')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTx.isPending}>
              {createTx.isPending ? 'Saving...' : 'Record Transaction'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
