'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateIPOApplication } from '@/lib/hooks/use-ipos';
import { Select } from '@/components/ui/select';

const appSchema = z.object({
  ipo_id: z.string().min(1, 'IPO is required'),
  applicant_name: z.string().min(1, 'Applicant is required'),
  fund_owner: z.string().min(1, 'Fund owner is required'),
  amount: z.coerce.number().min(1),
  category: z.string(),
  status: z.string(),
  outstanding_amount: z.coerce.number()
});

export function IPOApplicationForm({ ipoId, onClose }: { ipoId: string, onClose: () => void }) {
  const createApplication = useCreateIPOApplication();
  
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(appSchema),
    defaultValues: {
      ipo_id: ipoId,
      status: 'Applied',
      category: 'Retail'
    }
  });

  const onSubmit = (data: any) => {
    data.outstanding_amount = data.amount; // initially outstanding is full amount
    createApplication.mutate(data, {
      onSuccess: () => onClose()
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add IPO Application</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <input type="hidden" {...register('ipo_id')} />
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">Applicant Name</label>
              <input {...register('applicant_name')} className="w-full mt-1 p-2 border rounded-md" />
              {errors.applicant_name && <p className="text-red-500 text-xs mt-1">{errors.applicant_name.message as string}</p>}
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Fund Owner</label>
              <input {...register('fund_owner')} className="w-full mt-1 p-2 border rounded-md" placeholder="Personal or Name" />
            </div>
            <div>
              <label className="text-sm font-medium">Amount (₹)</label>
              <input type="number" step="0.01" {...register('amount')} className="w-full mt-1 p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select {...register('category')} className="w-full mt-1 p-2 border rounded-md bg-white">
                <option value="Retail">Retail</option>
                <option value="HNI">HNI</option>
                <option value="SHNI">SHNI</option>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Status</label>
              <Select {...register('status')} className="w-full mt-1 p-2 border rounded-md bg-white">
                <option value="Applied">Applied</option>
                <option value="Allotted">Allotted</option>
                <option value="Not Allotted">Not Allotted</option>
                <option value="Refund Pending">Refund Pending</option>
                <option value="Settled">Settled</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createApplication.isPending}>Save Application</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
