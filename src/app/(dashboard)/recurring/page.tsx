'use client';

import { useState } from 'react';
import {
  useRecurringTransactions,
  useDeleteRecurring,
  useMarkRecurringDone,
  useProcessDueRecurring,
} from '@/lib/hooks/use-recurring';
import { RecurringForm } from '@/components/recurring/recurring-form';
import { formatINR } from '@/lib/finance/money';
import { PageHeader } from '@/components/ui/page-header';
import Decimal from 'decimal.js';
import {
  CalendarClock, Plus, TrendingUp, CreditCard, ArrowRightLeft,
  CheckCircle2, Pencil, Trash2, Clock, Play
} from 'lucide-react';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function RecurringPage() {
  const { data: items, isLoading } = useRecurringTransactions();
  const deleteR = useDeleteRecurring();
  const markDone = useMarkRecurringDone();
  const processDue = useProcessDueRecurring();
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

  const dueNowCount = (items || []).filter((r: any) =>
    isPast(parseISO(r.next_due_date)) || isToday(parseISO(r.next_due_date))).length;

  function getDueBadge(dateStr: string) {
    const d = parseISO(dateStr);
    if (isPast(d) && !isToday(d)) return { label: 'Overdue', cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' };
    if (isToday(d)) return { label: 'Due Today', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' };
    if (isTomorrow(d)) return { label: 'Due Tomorrow', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400' };
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
        <div className="flex items-center gap-2 flex-wrap">
          {dueNowCount > 0 && (
            <Button
              onClick={() => processDue.mutate()}
              disabled={processDue.isPending}
              variant="outline"
              className="gap-1.5 font-semibold text-primary border-primary/30 hover:bg-primary/10"
            >
              <Play className="h-4 w-4" />
              {processDue.isPending ? 'Processing...' : `Process Due (${dueNowCount})`}
            </Button>
          )}
          <Button
            onClick={() => { setEditing(null); setFormOpen(true); }}
            className="gap-2 font-semibold"
          >
            <Plus className="h-4 w-4" /> Add Recurring
          </Button>
        </div>
      </div>

      {/* Summary */}
      {(items || []).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Due This Month</div>
            <div className="text-xl font-bold text-foreground mt-1">{formatINR(totalThisMonth)}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Schedules</div>
            <div className="text-xl font-bold text-foreground mt-1">{(items || []).length}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overdue</div>
            <div className={cn('text-xl font-bold mt-1', overdueCount > 0 ? 'text-rose-600' : 'text-foreground')}>
              {overdueCount}
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-muted/40 rounded-xl animate-pulse" />)}
        </div>
      ) : (items || []).length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl bg-card">
          <CalendarClock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground">No recurring transactions yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-5 max-w-xs mx-auto">
            Add rent, EMI, SIP, or any transaction that repeats on a schedule.
          </p>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add First Recurring
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {(items || []).map((r: any) => {
            const badge = getDueBadge(r.next_due_date);
            const amount = new Decimal(r.amount || 0);
            return (
              <div
                key={r.id}
                className={cn(
                  'bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 transition-colors',
                  badge?.cls.includes('red') && 'border-rose-200 bg-rose-50/20 dark:border-rose-900/40'
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    r.type === 'income'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : r.type === 'expense'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  )}
                >
                  {typeIcon(r.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{r.description}</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full capitalize">
                      {r.frequency}
                    </span>
                    {badge && (
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badge.cls)}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs">
                    <span className={cn('font-semibold text-sm', r.type === 'income' ? 'text-emerald-600' : 'text-rose-600')}>
                      {r.type === 'income' ? '+' : '-'}{formatINR(amount)}
                    </span>
                    {r.account?.name && <span className="text-muted-foreground">{r.account.name}</span>}
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Next: {format(parseISO(r.next_due_date), 'dd MMM yyyy')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => markDone.mutate(r)}
                    disabled={markDone.isPending}
                    title="Record Now"
                    className="flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {markDone.isPending ? 'Saving...' : 'Record'}
                  </button>
                  <button
                    onClick={() => { setEditing(r); setFormOpen(true); }}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => { if (confirm('Delete this recurring transaction?')) deleteR.mutate(r.id); }}
                    className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
