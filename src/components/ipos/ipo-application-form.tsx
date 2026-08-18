'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateIPOApplication } from '@/lib/hooks/use-ipos';
import { useAccounts } from '@/lib/hooks/use-accounts';

const appSchema = z.object({
  ipo_id: z.string().min(1, 'IPO is required'),
  applicant_name: z.string().min(1, 'Applicant name is required'),
  fund_owner: z.enum(['personal', 'third_party']),
  category: z.enum(['retail', 'hni', 'shni']),
  application_amount: z.coerce.number().min(1, 'Amount must be greater than 0'),
  application_number: z.string().optional(),
  demat_account: z.string().optional(),
  upi_mandate_id: z.string().optional(),
  broker: z.string().optional(),
  funding_source_account_id: z.string().optional(),
  status: z.string(),
});

type AppFormValues = z.infer<typeof appSchema>;

export function IPOApplicationForm({
  ipoId,
  ipoName,
  defaultAmount,
  onClose,
}: {
  ipoId: string;
  ipoName?: string;
  defaultAmount?: number;
  onClose: () => void;
}) {
  const createApplication = useCreateIPOApplication();
  const { data: accounts } = useAccounts();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AppFormValues>({
    resolver: zodResolver(appSchema),
    defaultValues: {
      ipo_id: ipoId,
      applicant_name: '',
      fund_owner: 'personal',
      category: 'retail',
      application_amount: defaultAmount || 15000,
      status: 'Applied',
    },
  });

  const onSubmit = (data: AppFormValues) => {
    createApplication.mutate(data, {
      onSuccess: () => onClose(),
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add IPO Application</DialogTitle>
          {ipoName && (
            <DialogDescription className="font-medium text-foreground">
              IPO: {ipoName}
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <input type="hidden" {...register('ipo_id')} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1 sm:col-span-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Applicant Name *</label>
              <input
                placeholder="e.g. Self, Family Member, or Client Name"
                {...register('applicant_name')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
              {errors.applicant_name && <p className="text-destructive text-xs mt-1">{errors.applicant_name.message}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Fund Ownership *</label>
              <select
                {...register('fund_owner')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              >
                <option value="personal">Personal Funds</option>
                <option value="third_party">Third Party / Managed Funds</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Category *</label>
              <select
                {...register('category')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              >
                <option value="retail">Retail (&lt; ₹2 Lakhs)</option>
                <option value="hni">sHNI (₹2L - ₹10L)</option>
                <option value="shni">bHNI (&gt; ₹10L)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Application Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                {...register('application_amount')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm font-semibold"
              />
              {errors.application_amount && <p className="text-destructive text-xs mt-1">{errors.application_amount.message}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Funding Account</label>
              <select
                {...register('funding_source_account_id')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
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
              <label className="text-xs font-semibold uppercase text-muted-foreground">Broker / Platform</label>
              <input
                placeholder="e.g. Zerodha, Groww, AngelOne"
                {...register('broker')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Application Number</label>
              <input
                placeholder="e.g. APP-1092837"
                {...register('application_number')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Demat / DP ID</label>
              <input
                placeholder="e.g. 12081600..."
                {...register('demat_account')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">UPI Mandate ID</label>
              <input
                placeholder="e.g. mandate@okhdfcbank"
                {...register('upi_mandate_id')}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createApplication.isPending}>
              {createApplication.isPending ? 'Saving...' : 'Save Application'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
