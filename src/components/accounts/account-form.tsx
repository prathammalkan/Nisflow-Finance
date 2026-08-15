"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useCreateAccount, useUpdateAccount } from '@/lib/hooks/use-accounts';
import type { Database } from '@/types/database';
import { Decimal } from 'decimal.js';

type Account = Database['public']['Tables']['accounts']['Row'];

const accountTypes = [
  'Bank Account', 'Cash', 'UPI Wallet', 'Credit Card', 'Debit Card', 
  'Broker Account', 'Demat Account', 'Mutual Fund Account', 'Fixed Deposit', 
  'Investment Account', 'Other'
];

const typeMapping: Record<string, string> = {
  'Bank Account': 'bank',
  'Cash': 'cash',
  'UPI Wallet': 'wallet',
  'Credit Card': 'credit_card',
  'Debit Card': 'bank',
  'Broker Account': 'investment',
  'Demat Account': 'investment',
  'Mutual Fund Account': 'investment',
  'Fixed Deposit': 'investment',
  'Investment Account': 'investment',
  'Other': 'other'
};

const purposes = ['Master', 'Spending', 'Savings', 'Investment', 'Other'];

const accountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  institution: z.string().optional(),
  purpose: z.string().optional(),
  opening_balance: z.string().refine(val => !isNaN(Number(val)), 'Must be a valid number'),
  color: z.string().optional(),
});

type AccountFormValues = z.infer<typeof accountSchema>;

interface AccountFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account | null;
}

export function AccountForm({ open, onOpenChange, account }: AccountFormProps) {
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  
  const isEditing = !!account;

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      type: 'Bank Account',
      institution: '',
      purpose: 'Spending',
      opening_balance: '0',
      color: '#000000',
    }
  });

  React.useEffect(() => {
    if (account && open) {
      reset({
        name: account.name,
        type: account.type,
        institution: (account as any).institution || '',
        purpose: (account as any).purpose || 'Spending',
        opening_balance: ((account as any).opening_balance || account.balance).toString(),
        color: (account as any).color || '#000000',
      });
    } else if (!account && open) {
      reset({
        name: '',
        type: 'Bank Account',
        institution: '',
        purpose: 'Spending',
        opening_balance: '0',
        color: '#000000',
      });
    }
  }, [account, open, reset]);

  const onSubmit = async (data: AccountFormValues) => {
    try {
      const balanceDecimal = new Decimal(data.opening_balance);
      
      if (isEditing && account) {
        await updateAccount.mutateAsync({
          id: account.id,
          name: data.name,
          type: (typeMapping[data.type] || 'other') as any,
        } as any);
      } else {
        await createAccount.mutateAsync({
          name: data.name,
          type: (typeMapping[data.type] || 'other') as any,
          balance: balanceDecimal.toNumber(),
          is_active: true,
        } as any);
      }
      onOpenChange(false);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Account' : 'Add New Account'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Account Name <span className="text-destructive">*</span></Label>
            <Input id="name" {...register('name')} placeholder="e.g. HDFC Salary Account" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Account Type <span className="text-destructive">*</span></Label>
              <Select value={watch('type')} onChange={(e) => setValue('type', e.target.value)}>
                <option value="" disabled>Select type</option>
                {accountTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </Select>
              {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose</Label>
              <Select value={watch('purpose')} onChange={(e) => setValue('purpose', e.target.value)}>
                <option value="" disabled>Select purpose</option>
                {purposes.map(purpose => (
                  <option key={purpose} value={purpose}>{purpose}</option>
                ))}
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="institution">Institution</Label>
            <Input id="institution" {...register('institution')} placeholder="e.g. HDFC Bank, Zerodha" />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="opening_balance">Opening Balance (₹)</Label>
            <Input 
              id="opening_balance" 
              type="number" 
              step="0.01" 
              disabled={isEditing} 
              {...register('opening_balance')} 
            />
            {isEditing && <p className="text-xs text-muted-foreground">Opening balance cannot be changed after creation.</p>}
            {errors.opening_balance && <p className="text-sm text-destructive">{errors.opening_balance.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <div className="flex gap-2">
              <Input id="color" type="color" className="w-12 h-10 p-1" {...register('color')} />
              <Input type="text" className="flex-1" value={watch('color')} readOnly />
            </div>
          </div>
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || createAccount.isPending || updateAccount.isPending}>
              {isSubmitting ? 'Saving...' : 'Save Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
