'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUpdateIPOApplication } from '@/lib/hooks/use-ipos';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';

const allotmentSchema = z.object({
  status: z.enum([
    'Applied',
    'Allotted',
    'Not Allotted',
    'Refund Pending',
    'Refund Received',
    'Sold / Listed',
    'Settled',
  ]),
  shares_allotted: z.coerce.number().optional(),
  amount_debited: z.coerce.number().optional(),
  refund_amount: z.coerce.number().optional(),
  refund_date: z.string().optional(),
  sale_proceeds: z.coerce.number().optional(),
  charges: z.coerce.number().optional(),
  amount_returned: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof allotmentSchema>;

export function IPOAllotmentDialog({
  application,
  onClose,
}: {
  application: any | null;
  onClose: () => void;
}) {
  const updateApp = useUpdateIPOApplication();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(allotmentSchema),
    defaultValues: {
      status: application?.status || 'Applied',
      shares_allotted: application?.shares_allotted || 0,
      amount_debited: application?.amount_debited || 0,
      refund_amount: application?.refund_amount || 0,
      refund_date: application?.refund_date || '',
      sale_proceeds: application?.sale_proceeds || 0,
      charges: application?.charges || 0,
      amount_returned: application?.amount_returned || 0,
      notes: application?.notes || '',
    },
  });

  const status = useWatch({ control, name: 'status' });
  const saleProceeds = useWatch({ control, name: 'sale_proceeds' }) || 0;
  const amountDebited = useWatch({ control, name: 'amount_debited' }) || 0;
  const charges = useWatch({ control, name: 'charges' }) || 0;
  const refundAmount = useWatch({ control, name: 'refund_amount' }) || 0;
  const amountReturned = useWatch({ control, name: 'amount_returned' }) || 0;

  if (!application) return null;

  const appAmount = new Decimal(application.application_amount || application.amount || 0);
  
  // Realized P&L is ONLY calculated when a sale is completed (sale_proceeds > 0)
  const hasSaleCompleted = saleProceeds > 0;
  const realizedPnl = hasSaleCompleted
    ? new Decimal(saleProceeds).minus(new Decimal(amountDebited)).minus(new Decimal(charges))
    : null;

  // Outstanding amount calculation
  const outstanding = Decimal.max(
    0,
    appAmount.minus(new Decimal(refundAmount)).minus(new Decimal(amountReturned))
  );

  const onSubmit = (data: FormValues) => {
    updateApp.mutate(
      {
        id: application.id,
        ipo_id: application.ipo_id,
        status: data.status,
        shares_allotted: Number(data.shares_allotted || 0),
        amount_debited: Number(data.amount_debited || 0),
        refund_amount: Number(data.refund_amount || 0),
        refund_date: data.refund_date || null,
        sale_proceeds: Number(data.sale_proceeds || 0),
        charges: Number(data.charges || 0),
        amount_returned: Number(data.amount_returned || 0),
        outstanding_amount: outstanding.toNumber(),
        notes: data.notes || null,
      },
      {
        onSuccess: () => onClose(),
      }
    );
  };

  return (
    <Dialog open={!!application} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Allotment & Financials</DialogTitle>
          <DialogDescription>
            Applicant: <span className="font-semibold text-foreground">{application.applicant_name}</span> • Applied: {formatINR(appAmount.toNumber())}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Status Selection */}
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Application Status *</label>
            <select
              {...register('status')}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm font-medium"
            >
              <option value="Applied">Applied (Mandate Active)</option>
              <option value="Allotted">Allotted (Shares Received)</option>
              <option value="Not Allotted">Not Allotted (Unblocked / Refunded)</option>
              <option value="Refund Pending">Refund Pending</option>
              <option value="Refund Received">Refund Received</option>
              <option value="Sold / Listed">Sold / Listed</option>
              <option value="Settled">Settled (Funds Returned)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Shares Allotted</label>
              <input
                type="number"
                {...register('shares_allotted')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Amount Debited (₹)</label>
              <input
                type="number"
                step="0.01"
                {...register('amount_debited')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Refund Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                {...register('refund_amount')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Refund Date</label>
              <input
                type="date"
                {...register('refund_date')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Sale Proceeds (₹)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00 (when sold)"
                {...register('sale_proceeds')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Brokerage & Charges (₹)</label>
              <input
                type="number"
                step="0.01"
                {...register('charges')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Amount Returned to Counterparty (₹)</label>
              <input
                type="number"
                step="0.01"
                {...register('amount_returned')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Notes / Demat Reference</label>
              <input
                type="text"
                placeholder="e.g. Sold on listing day at ₹142"
                {...register('notes')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>
          </div>

          {/* Financial summary banner */}
          <div className="p-3 bg-muted/40 rounded-xl border space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Outstanding Obligation:</span>
              <span className="font-semibold">{formatINR(outstanding.toNumber())}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Realized P&L:</span>
              {hasSaleCompleted && realizedPnl !== null ? (
                <span className={`font-bold ${realizedPnl.gte(0) ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {realizedPnl.gte(0) ? '+' : ''}{formatINR(realizedPnl.toNumber())}
                </span>
              ) : (
                <span className="text-muted-foreground italic font-normal">N/A (Holding / Unsold)</span>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateApp.isPending}>
              {updateApp.isPending ? 'Saving...' : 'Update Allotment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
