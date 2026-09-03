'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateIPO, useUpdateIPO } from '@/lib/hooks/use-ipos';

const ipoSchema = z.object({
  name: z.string().min(1, 'IPO name is required'),
  company: z.string().min(1, 'Company Name is required'),
  open_date: z.string().min(1, 'Open date is required'),
  close_date: z.string().min(1, 'Close date is required'),
  listing_date: z.string().optional(),
  price_band_low: z.coerce.number().min(0, 'Price must be non-negative'),
  price_band_high: z.coerce.number().min(0, 'Price must be non-negative'),
  lot_size: z.coerce.number().int().min(1, 'Lot size must be at least 1'),
  status: z.enum(['Upcoming', 'Open', 'Closed', 'Allotted', 'Listed']),
});

type IPOFormValues = z.infer<typeof ipoSchema>;

export function IPOForm({
  initialData,
  onClose,
}: {
  initialData?: any;
  onClose: () => void;
}) {
  const createIPO = useCreateIPO();
  const updateIPO = useUpdateIPO();
  const isEditing = !!initialData?.id;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<IPOFormValues>({
    resolver: zodResolver(ipoSchema),
    defaultValues: {
      name: initialData?.name || '',
      company: initialData?.company || initialData?.company_name || '',
      open_date: initialData?.open_date || new Date().toISOString().split('T')[0],
      close_date: initialData?.close_date || new Date().toISOString().split('T')[0],
      listing_date: initialData?.listing_date || '',
      price_band_low: initialData?.price_band_low || 100,
      price_band_high: initialData?.price_band_high || 108,
      lot_size: initialData?.lot_size || 100,
      status: initialData?.status || 'Upcoming',
    },
  });

  const onSubmit = (data: IPOFormValues) => {
    if (isEditing) {
      updateIPO.mutate(
        { id: initialData.id, ...data },
        { onSuccess: () => onClose() }
      );
    } else {
      createIPO.mutate(data, {
        onSuccess: () => onClose(),
      });
    }
  };

  const isPending = createIPO.isPending || updateIPO.isPending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit IPO Details' : 'Add New IPO'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1 sm:col-span-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">IPO Name *</label>
              <input
                placeholder="e.g. Swiggy Limited IPO"
                {...register('name')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
              {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Company Name *</label>
              <input
                placeholder="e.g. Swiggy Limited"
                {...register('company')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
              {errors.company && <p className="text-destructive text-xs mt-1">{errors.company.message}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Open Date *</label>
              <input
                type="date"
                {...register('open_date')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
              {errors.open_date && <p className="text-destructive text-xs mt-1">{errors.open_date.message}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Close Date *</label>
              <input
                type="date"
                {...register('close_date')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
              {errors.close_date && <p className="text-destructive text-xs mt-1">{errors.close_date.message}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Price Band Low (₹)</label>
              <input
                type="number"
                step="0.01"
                {...register('price_band_low')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Price Band High (₹)</label>
              <input
                type="number"
                step="0.01"
                {...register('price_band_high')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Lot Size (Shares) *</label>
              <input
                type="number"
                {...register('lot_size')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
              {errors.lot_size && <p className="text-destructive text-xs mt-1">{errors.lot_size.message}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Status</label>
              <select
                {...register('status')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              >
                <option value="Upcoming">Upcoming</option>
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
                <option value="Allotted">Allotted</option>
                <option value="Listed">Listed</option>
              </select>
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Listing Date (Optional)</label>
              <input
                type="date"
                {...register('listing_date')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : isEditing ? 'Update IPO' : 'Save IPO'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
