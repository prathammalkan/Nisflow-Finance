"use client";

import { useState } from 'react';
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
import { useCreateTransaction } from '@/lib/hooks/use-transactions';
import { useCategories } from '@/lib/hooks/use-categories';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { Sparkles, Loader2 } from 'lucide-react';
import Decimal from 'decimal.js';
import { format } from 'date-fns';

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

export function TransactionForm({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  
  const createTransaction = useCreateTransaction();
  const { data: categories } = useCategories();
  const { data: accounts } = useAccounts(false);

  const form = useForm<any>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: 'Expense',
      amount: '',
      account_id: '',
      date: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
      ownership: 'personal',
      status: 'confirmed'
    }
  });

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
      if (values.type === 'Transfer' && values.to_account_id) {
        // Handle transfer - two transactions
        const outTx = await createTransaction.mutateAsync({
          amount: new Decimal(values.amount).toNumber(),
          type: 'Transfer',
          direction: 'out',
          account_id: values.account_id,
          date: values.date,
          description: values.description || 'Transfer out',
          ownership: values.ownership || 'personal',
          status: values.status
        });
        
        const inTx = await createTransaction.mutateAsync({
          amount: new Decimal(values.amount).toNumber(),
          type: 'Transfer',
          direction: 'in',
          account_id: values.to_account_id,
          date: values.date,
          description: values.description || 'Transfer in',
          ownership: values.ownership || 'personal',
          status: values.status,
          linked_transaction_id: (outTx as any).id
        });
        
        // Link them together - we'd need another call or it's handled in a trigger/RPC ideally
        // In a real app we would use an RPC or server action to ensure transactionality.
      } else {
        // Normal transaction
        await createTransaction.mutateAsync({
          amount: new Decimal(values.amount).toNumber(),
          type: values.type,
          direction: values.type === 'Expense' ? 'out' : 'in',
          account_id: values.account_id,
          category_id: values.category_id,
          description: values.description,
          date: values.date,
          ownership: values.ownership || 'personal',
          status: values.status,
          notes: values.notes,
          counterparty_id: values.counterparty_id
        });
      }
      onOpenChange(false);
      form.reset();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-4">
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

          <div className="space-y-4 py-4">
            <div>
              <Input
                type="number"
                step="0.01"
                placeholder="₹ 0.00"
                className="text-3xl h-16 text-center font-bold"
                {...form.register('amount')}
              />
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
                >
                  <option value="" disabled>Select account...</option>
                  {accounts?.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </Select>
                {form.formState.errors.account_id && (
                  <p className="text-sm text-red-500">{form.formState.errors.account_id.message as string}</p>
                )}
              </div>

              {transactionType === 'Transfer' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">To Account</label>
                  <Select 
                    value={form.watch('to_account_id') || ''} 
                    onChange={(e) => form.setValue('to_account_id', e.target.value)}
                  >
                    <option value="" disabled>Select account...</option>
                    {accounts?.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
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
                    <label className="text-sm font-medium">Date</label>
                    <Input type="datetime-local" {...form.register('date')} />
                  </div>
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
            <Button type="submit" disabled={createTransaction.isPending}>
              {createTransaction.isPending ? 'Saving...' : 'Save Transaction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
