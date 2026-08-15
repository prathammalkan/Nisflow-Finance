'use client';

import { useState } from 'react';
import { useRecurringTransactions, useDeleteRecurring, useMarkRecurringDone } from '@/lib/hooks/use-recurring';
import { RecurringForm } from '@/components/recurring/recurring-form';
import { formatINR } from '@/lib/finance/money';
import { PageHeader } from '@/components/ui/page-header';
import Decimal from 'decimal.js';
import {
  CalendarClock, Plus, TrendingUp, CreditCard, ArrowRightLeft,
  CheckCircle2, Pencil, Trash2, Clock
} from 'lucide-react';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

export default function RecurringPage() {
  const { data: items, isLoading } = useRecurringTransactions();
  const deleteR = useDeleteRecurring();
  const markDone = useMarkRecurringDone();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const today = new Date();
  const thisMonth = today.getMonth();
  const thisYear = today.getFullYear();

  const upcomingThisMonth = (items || []).filter((r: any) => {
    const d = parseISO(r.next_due_date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  const totalThisMonth = upcomingThisMonth.reduce((sum: Decimal, r: any) =>
    sum.plus(new Decimal(r.amount || 0)), new Decimal(0));

  const overdueCount = (items || []).filter((r: any) =>
    isPast(parseISO(r.next_due_date)) && !isToday(parseISO(r.next_due_date))).length;

  function getDueBadge(dateStr: string) {
    const d = parseISO(dateStr);
    if (isPast(d) && !isToday(d)) return { label: 'Overdue', cls: 'bg-red-100 text-red-700' };
    if (isToday(d)) return { label: 'Due Today', cls: 'bg-amber-100 text-amber-700' };
    if (isTomorrow(d)) return { label: 'Due Tomorrow', cls: 'bg-amber-50 text-amber-600' };
    return null;
  }

  const typeIcon = (type: string) => {
    if (type === 'income') return <TrendingUp className="h-4 w-4" />;
    if (type === 'expense') return <CreditCard className="h-4 w-4" />;
    return <ArrowRightLeft className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <PageHeader title="Recurring Transactions" description="Scheduled entries that repeat on a set frequency." />
        <button
          onClick={() => { setEditing(null); setFormOpen(true); }}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Recurring
        </button>
      </div>

      {/* Summary */}
      {(items || []).length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-medium text-gray-500">Due This Month</div>
            <div className="text-xl font-bold text-gray-900 mt-1">{formatINR(totalThisMonth)}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-medium text-gray-500">Active</div>
            <div className="text-xl font-bold text-gray-900 mt-1">{(items || []).length}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-medium text-gray-500">Overdue</div>
            <div className={cn('text-xl font-bold mt-1', overdueCount > 0 ? 'text-red-600' : 'text-gray-900')}>{overdueCount}</div>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (items || []).length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
          <CalendarClock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-700">No recurring transactions yet</h3>
          <p className="text-sm text-gray-400 mt-1 mb-5 max-w-xs mx-auto">Add rent, EMI, SIP, or any transaction that repeats on a schedule.</p>
          <button onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
            + Add First Recurring
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {(items || []).map((r: any) => {
            const badge = getDueBadge(r.next_due_date);
            const amount = new Decimal(r.amount || 0);
            return (
              <div key={r.id} className={cn('bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3', badge?.cls.includes('red') && 'border-red-200 bg-red-50/30')}>
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', r.type === 'income' ? 'bg-emerald-100 text-emerald-700' : r.type === 'expense' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700')}>
                  {typeIcon(r.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">{r.description}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{r.frequency}</span>
                    {badge && <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badge.cls)}>{badge.label}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1">
                    <span className={cn('text-sm font-medium', r.type === 'income' ? 'text-emerald-600' : 'text-red-600')}>
                      {r.type === 'income' ? '+' : '-'}{formatINR(amount)}
                    </span>
                    {r.account?.name && <span className="text-xs text-gray-400">{r.account.name}</span>}
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Next: {format(parseISO(r.next_due_date), 'dd MMM yyyy')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => markDone.mutate(r)}
                    disabled={markDone.isPending}
                    title="Record Now"
                    className="flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Record
                  </button>
                  <button onClick={() => { setEditing(r); setFormOpen(true); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Pencil className="h-4 w-4" /></button>
                  <button
                    onClick={() => { if (confirm('Delete this recurring transaction?')) deleteR.mutate(r.id); }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                  ><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RecurringForm open={formOpen} onOpenChange={setFormOpen} initialData={editing} />
    </div>
  );
}
