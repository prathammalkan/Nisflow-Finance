'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { useCreateRecurring, useUpdateRecurring } from '@/lib/hooks/use-recurring';
import { format } from 'date-fns';
import Decimal from 'decimal.js';

interface RecurringFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialData?: any;
}

const FREQUENCIES = ['daily','weekly','monthly','quarterly','yearly'];
const TYPES = ['income','expense','transfer'] as const;

export function RecurringForm({ open, onOpenChange, initialData }: RecurringFormProps) {
  const { data: accounts } = useAccounts();
  const create = useCreateRecurring();
  const update = useUpdateRecurring();
  const isEdit = !!initialData?.id;

  const [form, setForm] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income'|'expense'|'transfer',
    account_id: '',
    frequency: 'monthly',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    next_due_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: '',
    notes: '',
    ownership: 'personal',
  });

  useEffect(() => {
    if (initialData) {
      setForm({
        description: initialData.description || '',
        amount: String(initialData.amount || ''),
        type: initialData.type || 'expense',
        account_id: initialData.account_id || '',
        frequency: initialData.frequency || 'monthly',
        start_date: initialData.start_date || format(new Date(), 'yyyy-MM-dd'),
        next_due_date: initialData.next_due_date || format(new Date(), 'yyyy-MM-dd'),
        end_date: initialData.end_date || '',
        notes: initialData.notes || '',
        ownership: initialData.ownership || 'personal',
      });
    }
  }, [initialData]);

  if (!open) return null;

  const direction = form.type === 'income' ? 'in' : 'out';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = new Decimal(form.amount || 0);
    if (amount.lte(0)) return;
    const payload = { ...form, amount: amount.toNumber(), direction };
    if (isEdit) {
      await update.mutateAsync({ id: initialData.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit' : 'Add'} Recurring Transaction</h2>
          <button onClick={() => onOpenChange(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description *</label>
            <Input placeholder="e.g. Monthly Rent, SIP Investment" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (₹) *</label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Type *</label>
              <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value as any}))}>
                {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Frequency *</label>
              <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" value={form.frequency} onChange={e => setForm(f => ({...f, frequency: e.target.value}))}>
                {FREQUENCIES.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Account</label>
              <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" value={form.account_id} onChange={e => setForm(f => ({...f, account_id: e.target.value}))}>
                <option value="">-- Select Account --</option>
                {(accounts as any[] || []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date</label>
              <Input type="date" value={form.start_date} onChange={e => setForm(f => ({...f, start_date: e.target.value, next_due_date: e.target.value}))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">End Date (optional)</label>
              <Input type="date" value={form.end_date} onChange={e => setForm(f => ({...f, end_date: e.target.value}))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Ownership</label>
            <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" value={form.ownership} onChange={e => setForm(f => ({...f, ownership: e.target.value}))}>
              <option value="personal">Personal</option>
              <option value="third_party">Third Party</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none" rows={2} placeholder="Optional notes..." value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
          </div>
          <div className="flex gap-3 pt-2 border-t">
            <button type="button" onClick={() => onOpenChange(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={isPending} className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
              {isPending ? 'Saving...' : (isEdit ? 'Update' : 'Add Recurring')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
