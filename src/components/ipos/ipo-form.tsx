'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateIPO } from '@/lib/hooks/use-ipos';
import { Select } from '@/components/ui/select';

const ipoSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  company_name: z.string().min(1, 'Company Name is required'),
  open_date: z.string().min(1, 'Open date is required'),
  close_date: z.string().min(1, 'Close date is required'),
  listing_date: z.string().optional(),
  price_band_low: z.coerce.number().min(1),
  price_band_high: z.coerce.number().min(1),
  lot_size: z.coerce.number().min(1),
  status: z.string().default('Upcoming'),
});

export function IPOForm({ onClose }: { onClose: () => void }) {
  const createIPO = useCreateIPO();
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(ipoSchema),
    defaultValues: {
      status: 'Upcoming'
    }
  });

  const onSubmit = (data: any) => {
    createIPO.mutate(data, {
      onSuccess: () => onClose()
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New IPO</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">IPO Name</label>
              <input {...register('name')} className="w-full mt-1 p-2 border rounded-md" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message as string}</p>}
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Company Name</label>
              <input {...register('company_name')} className="w-full mt-1 p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-sm font-medium">Open Date</label>
              <input type="date" {...register('open_date')} className="w-full mt-1 p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-sm font-medium">Close Date</label>
              <input type="date" {...register('close_date')} className="w-full mt-1 p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-sm font-medium">Price Band Low (₹)</label>
              <input type="number" step="0.01" {...register('price_band_low')} className="w-full mt-1 p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-sm font-medium">Price Band High (₹)</label>
              <input type="number" step="0.01" {...register('price_band_high')} className="w-full mt-1 p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-sm font-medium">Lot Size</label>
              <input type="number" {...register('lot_size')} className="w-full mt-1 p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select {...register('status')} className="w-full mt-1 p-2 border rounded-md bg-white">
                <option value="Upcoming">Upcoming</option>
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
                <option value="Listed">Listed</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createIPO.isPending}>Save IPO</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
