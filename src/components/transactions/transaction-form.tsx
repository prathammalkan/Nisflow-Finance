"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCreateTransaction, useUpdateTransaction } from '@/lib/hooks/use-transactions';
import { useCategories } from '@/lib/hooks/use-categories';
import { useAccounts } from '@/lib/hooks/use-accounts';
import type { Database } from '@/types/database';
import { Sparkles, Loader2 } from 'lucide-react';
import Decimal from 'decimal.js';
import { format } from 'date-fns';
import { toast } from 'sonner';

type TransactionRow = Database['public']['Tables']['transactions']['Row'];

const formSchema = z.object({
  type: z.enum(['Expense', 'Income', 'Transfer']),
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: 'Amount must be greater than 0'
  }),
  account_id: z.string().min(1, 'Account is required'),
  to_account_id: z.string().optional(),
  category_id: z.string().optional(),
  description: z.string().optional(),
  date: z.string(),
  
  // Advanced fields
  ownership: z.enum(['personal', 'third_party']).default('personal'),
  status: z.enum(['draft', 'pending', 'confirmed', 'reconciled']).default('confirmed'),
  notes: z.string().optional(),
  counterparty_id: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'Transfer') {
    if (!data.to_account_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to_account_id'],
        message: 'Destination account is required for transfers',
      });
    }
    if (data.account_id === data.to_account_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to_account_id'],
        message: 'Source and destination accounts must be different',
      });
    }
  }
});

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: TransactionRow | null;
}

export function TransactionForm({ open, onOpenChange, transaction }: TransactionFormProps) {
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const { data: categories } = useCategories();
  const { data: accounts } = useAccounts(false);

  const isEditing = !!transaction;

  const form = useForm<any>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: 'Expense',
      amount: '',
      account_id: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      ownership: 'personal',
      status: 'confirmed',
      notes: '',
      description: '',
      category_id: '',
      counterparty_id: '',
    }
  });

  useEffect(() => {
    if (transaction && open) {
      const typeUpper = String(transaction.type || '').toUpperCase();
      const mappedType = typeUpper.includes('INCOME') ? 'Income' : typeUpper.includes('TRANSFER') ? 'Transfer' : 'Expense';

      form.reset({
        type: mappedType as 'Expense' | 'Income' | 'Transfer',
        amount: Math.abs(Number(transaction.amount || 0)).toString(),
        account_id: transaction.account_id || '',
        category_id: transaction.category_id || '',
        description: transaction.description || '',
        date: transaction.date ? format(new Date(transaction.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        ownership: (transaction as any).ownership || 'personal',
        status: transaction.status || 'confirmed',
        notes: transaction.notes || '',
        counterparty_id: (transaction as any).counterparty_id || '',
      });
      if (transaction.notes || (transaction as any).counterparty_id) {
        setIsAdvanced(true);
      }
    } else if (!transaction && open) {
      form.reset({
        type: 'Expense',
        amount: '',
        account_id: '',
        category_id: '',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        ownership: 'personal',
        status: 'confirmed',
        notes: '',
        counterparty_id: '',
      });
      setIsAdvanced(false);
    }
  }, [transaction, open, form]);

  const transactionType = form.watch('type');

  const suggestCategory = async () => {
    const description = form.getValues('description');
    if (!description) return;
    
    setIsSuggesting(true);
    try {
      const res = await fetch('/api/ai/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.categoryId) {
          form.setValue('category_id', data.categoryId);
        }
      }
    } catch (e) {
      console.error('Failed to suggest category', e);
    } finally {
      setIsSuggesting(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      if (isEditing && transaction) {
        await updateTransaction.mutateAsync({
          id: transaction.id,
          description: values.description || null,
          category_id: values.category_id || null,
          notes: values.notes || null,
          ownership: values.ownership || 'personal',
          counterparty_id: values.counterparty_id || null,
        } as any);
        toast.success('Transaction updated successfully');
      } else if (values.type === 'Transfer' && values.to_account_id) {
        // Handle transfer - two transactions
        const outTx = await createTransaction.mutateAsync({
          amount: new Decimal(values.amount).toNumber(),
          type: 'Transfer',
          direction: 'out',
          account_id: values.account_id,
          date: new Date(values.date).toISOString(),
          description: values.description || 'Transfer out',
          ownership: values.ownership || 'personal',
          status: values.status
        });
        
        await createTransaction.mutateAsync({
          amount: new Decimal(values.amount).toNumber(),
          type: 'Transfer',
          direction: 'in',
          account_id: values.to_account_id,
          date: new Date(values.date).toISOString(),
          description: values.description || 'Transfer in',
          ownership: values.ownership || 'personal',
          status: values.status,
          linked_transaction_id: (outTx as any).id
        });
        toast.success('Transfer recorded');
      } else {
        // Normal transaction
        await createTransaction.mutateAsync({
          amount: new Decimal(values.amount).toNumber(),
          type: values.type,
          direction: values.type === 'Expense' ? 'out' : 'in',
          account_id: values.account_id,
          category_id: values.category_id,
          description: values.description,
          date: new Date(values.date).toISOString(),
          ownership: values.ownership || 'personal',
          status: values.status,
          notes: values.notes,
          counterparty_id: values.counterparty_id
        });
        toast.success('Transaction saved');
      }
      onOpenChange(false);
      form.reset();
    } catch (e) {
      console.error(e);
      toast.error('Failed to save transaction');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-4">
          {!isEditing && (
            <Tabs 
              value={transactionType} 
              onValueChange={(v) => form.setValue('type', v as any)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="Expense">Expense</TabsTrigger>
                <TabsTrigger value="Income">Income</TabsTrigger>
                <TabsTrigger value="Transfer">Transfer</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <div className="space-y-4 py-4">
            <div>
              <Input
                type="number"
                step="0.01"
                placeholder="₹ 0.00"
                className="text-3xl h-16 text-center font-bold"
                disabled={isEditing}
                {...form.register('amount')}
              />
              {isEditing && (
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  Amount & account cannot be changed directly to preserve ledger audit trail.
                </p>
              )}
              {form.formState.errors.amount && (
                <p className="text-sm text-red-500 mt-1 text-center">{form.formState.errors.amount.message as string}</p>
              )}
            </div>

            <div className={transactionType === 'Transfer' ? 'grid grid-cols-2 gap-4' : ''}>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {transactionType === 'Transfer' ? 'From Account' : 'Account'}
                </label>
                <Select 
                  value={form.watch('account_id')} 
                  onChange={(e) => form.setValue('account_id', e.target.value)}
                  disabled={isEditing}
                >
                  <option value="" disabled>Select account</option>
                  {accounts?.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name} (₹{acc.balance})</option>
                  ))}
                </Select>
              </div>

              {transactionType === 'Transfer' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">To Account</label>
                  <Select 
                    value={form.watch('to_account_id')} 
                    onChange={(e) => form.setValue('to_account_id', e.target.value)}
                    disabled={isEditing}
                  >
                    <option value="" disabled>Select destination</option>
                    {accounts?.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.name} (₹{acc.balance})</option>
                    ))}
                  </Select>
                  {form.formState.errors.to_account_id && (
                    <p className="text-sm text-red-500">{form.formState.errors.to_account_id.message as string}</p>
                  )}
                </div>
              )}
            </div>

            {transactionType !== 'Transfer' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Category</label>
                  {form.watch('description') && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      onClick={suggestCategory}
                      disabled={isSuggesting}
                      className="h-6 px-2 text-xs text-primary"
                    >
                      {isSuggesting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                      Suggest
                    </Button>
                  )}
                </div>
                <Select 
                  value={form.watch('category_id') || ''} 
                  onChange={(e) => form.setValue('category_id', e.target.value)}
                >
                  <option value="" disabled>Select category...</option>
                  {categories?.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input placeholder="What was this for?" {...form.register('description')} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Input type="date" {...form.register('date')} />
            </div>

            {!isAdvanced ? (
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full text-sm text-muted-foreground"
                onClick={() => setIsAdvanced(true)}
              >
                More details
              </Button>
            ) : (
              <div className="space-y-4 pt-4 border-t">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Ownership</label>
                    <Select 
                      value={form.watch('ownership')} 
                      onChange={(e: any) => form.setValue('ownership', e.target.value)}
                    >
                      <option value="personal">Personal</option>
                      <option value="third_party">Third Party</option>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Input placeholder="Additional details..." {...form.register('notes')} />
                </div>
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="w-full text-sm text-muted-foreground"
                  onClick={() => setIsAdvanced(false)}
                >
                  Less details
                </Button>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isEditing ? updateTransaction.isPending : createTransaction.isPending}
            >
              {isEditing
                ? (updateTransaction.isPending ? 'Saving...' : 'Save Changes')
                : (createTransaction.isPending ? 'Saving...' : 'Save Transaction')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
