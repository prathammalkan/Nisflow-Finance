'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateInvestment } from '@/lib/hooks/use-investments';
import { Select } from '@/components/ui/select';

const investmentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  asset_type: z.string().min(1, 'Type is required'),
  symbol: z.string().optional(),
  total_invested: z.coerce.number().default(0),
  current_value: z.coerce.number().default(0),
});

export function InvestmentForm({ onClose }: { onClose: () => void }) {
  const createInvestment = useCreateInvestment();
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(investmentSchema),
    defaultValues: {
      asset_type: 'Stocks'
    }
  });

  const onSubmit = (data: any) => {
    createInvestment.mutate(data, {
      onSuccess: () => onClose()
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Investment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">Investment Name</label>
              <input {...register('name')} className="w-full mt-1 p-2 border rounded-md" placeholder="e.g. Reliance Industries" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message as string}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">Asset Type</label>
              <Select {...register('asset_type')} className="w-full mt-1 p-2 border rounded-md bg-white">
                <option value="Stocks">Stocks</option>
                <option value="Mutual Fund">Mutual Fund</option>
                <option value="ETF">ETF</option>
                <option value="FD">Fixed Deposit</option>
                <option value="Bonds">Bonds</option>
                <option value="Other">Other</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Symbol/Ticker (Optional)</label>
              <input {...register('symbol')} className="w-full mt-1 p-2 border rounded-md" placeholder="e.g. RELIANCE" />
            </div>
            <div>
              <label className="text-sm font-medium">Initial Invested (₹)</label>
              <input type="number" step="0.01" {...register('total_invested')} className="w-full mt-1 p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-sm font-medium">Current Value (₹)</label>
              <input type="number" step="0.01" {...register('current_value')} className="w-full mt-1 p-2 border rounded-md" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createInvestment.isPending}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
