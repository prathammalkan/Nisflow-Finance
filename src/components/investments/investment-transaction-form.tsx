'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateInvestmentTransaction } from '@/lib/hooks/use-investments';
import { Select } from '@/components/ui/select';

const txSchema = z.object({
  investment_id: z.string().min(1, 'Investment is required'),
  type: z.string(),
  transaction_date: z.string().min(1, 'Date is required'),
  quantity: z.coerce.number().optional(),
  price: z.coerce.number().optional(),
  amount: z.coerce.number().min(1, 'Amount is required'),
  fees: z.coerce.number().default(0),
});

export function InvestmentTransactionForm({ investmentId, onClose }: { investmentId: string, onClose: () => void }) {
  const createTx = useCreateInvestmentTransaction();
  
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(txSchema),
    defaultValues: {
      investment_id: investmentId,
      type: 'Buy',
      transaction_date: new Date().toISOString().split('T')[0]
    }
  });

  const onSubmit = (data: any) => {
    createTx.mutate(data, {
      onSuccess: () => onClose()
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <input type="hidden" {...register('investment_id')} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select {...register('type')} className="w-full mt-1 p-2 border rounded-md bg-white">
                <option value="Buy">Buy</option>
                <option value="Sell">Sell</option>
                <option value="Dividend">Dividend</option>
                <option value="Split">Split</option>
                <option value="Bonus">Bonus</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Date</label>
              <input type="date" {...register('transaction_date')} className="w-full mt-1 p-2 border rounded-md" />
              {errors.transaction_date && <p className="text-red-500 text-xs mt-1">{errors.transaction_date.message as string}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">Quantity</label>
              <input type="number" step="0.0001" {...register('quantity')} className="w-full mt-1 p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-sm font-medium">Price (₹)</label>
              <input type="number" step="0.01" {...register('price')} className="w-full mt-1 p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-sm font-medium">Total Amount (₹)</label>
              <input type="number" step="0.01" {...register('amount')} className="w-full mt-1 p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-sm font-medium">Fees/Taxes (₹)</label>
              <input type="number" step="0.01" {...register('fees')} className="w-full mt-1 p-2 border rounded-md" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createTx.isPending}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
