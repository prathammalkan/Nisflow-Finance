'use client';

import { useState, useEffect } from 'react';
import { useCreateRecurring, useUpdateRecurring } from '@/lib/hooks/use-recurring';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
const TYPES = ['expense', 'income', 'transfer'];

export function RecurringForm({
  open,
  onOpenChange,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: any;
}) {
  const isEdit = !!initialData;
  const create = useCreateRecurring();
  const update = useUpdateRecurring();
  const { data: accounts } = useAccounts();

  const [form, setForm] = useState({
    description: '',
    amount: '',
    type: 'expense',
    frequency: 'monthly',
    account_id: '',
    category_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    next_due_date: new Date().toISOString().split('T')[0],
    ownership: 'personal',
    notes: '',
  });

  useEffect(() => {
    if (initialData) {
      setForm({
        description: initialData.description || '',
        amount: String(initialData.amount || ''),
        type: initialData.type || 'expense',
        frequency: initialData.frequency || 'monthly',
        account_id: initialData.account_id || '',
        category_id: initialData.category_id || '',
        start_date: initialData.start_date || new Date().toISOString().split('T')[0],
        end_date: initialData.end_date || '',
        next_due_date: initialData.next_due_date || new Date().toISOString().split('T')[0],
        ownership: initialData.ownership || 'personal',
        notes: initialData.notes || '',
      });
    } else {
      setForm({
        description: '',
        amount: '',
        type: 'expense',
        frequency: 'monthly',
        account_id: '',
        category_id: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        next_due_date: new Date().toISOString().split('T')[0],
        ownership: 'personal',
        notes: '',
      });
    }
  }, [initialData, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      amount: parseFloat(form.amount),
      end_date: form.end_date || null,
      account_id: form.account_id || null,
      category_id: form.category_id || null,
      notes: form.notes || null,
    };
    if (isEdit) {
      update.mutate({ id: initialData.id, ...payload });
    } else {
      create.mutate(payload);
    }
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-card text-card-foreground border border-border rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex justify-between items-center z-10">
          <h2 className="text-base font-bold text-foreground">{isEdit ? 'Edit' : 'Add'} Recurring Transaction</h2>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Description *</label>
            <Input placeholder="e.g. Monthly Rent, SIP Investment" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Amount (₹) *</label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Type *</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary" value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value as any}))}>
                {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Frequency *</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary" value={form.frequency} onChange={e => setForm(f => ({...f, frequency: e.target.value}))}>
                {FREQUENCIES.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Account</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary" value={form.account_id} onChange={e => setForm(f => ({...f, account_id: e.target.value}))}>
                <option value="">-- Select Account --</option>
                {(accounts as any[] || []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Start Date</label>
              <Input type="date" value={form.start_date} onChange={e => setForm(f => ({...f, start_date: e.target.value, next_due_date: e.target.value}))} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">End Date (optional)</label>
              <Input type="date" value={form.end_date} onChange={e => setForm(f => ({...f, end_date: e.target.value}))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Ownership</label>
            <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary" value={form.ownership} onChange={e => setForm(f => ({...f, ownership: e.target.value}))}>
              <option value="personal">Personal</option>
              <option value="third_party">Third Party</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Notes</label>
            <textarea className="w-full border border-border bg-background text-foreground rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" rows={2} placeholder="Optional notes..." value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
          </div>
          <div className="flex gap-3 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? 'Saving...' : (isEdit ? 'Update' : 'Add Recurring')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
