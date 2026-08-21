'use client';

import { usePayables, usePayablesSummary } from '@/lib/hooks/use-payables';
import { PayableForm } from '@/components/people/payable-form';
import { PageHeader } from '@/components/ui/page-header';
import { formatINR } from '@/lib/finance/money';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import Decimal from 'decimal.js';

export default function PayablesPage() {
  const { data: payables, isLoading } = usePayables();
  const summary = usePayablesSummary();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Money I Owe Others"
        description="Track your payables, liabilities to counterparties, and settlement deadlines."
        actions={<PayableForm />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="text-xs text-red-600 dark:text-red-400 font-semibold uppercase tracking-wider">Total Outstanding</div>
          <div className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">{formatINR(summary.totalOutstanding.toNumber())}</div>
        </div>
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider">Overdue Items</div>
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">{summary.overdueCount} items</div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block border rounded-xl overflow-x-auto bg-card shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
            <tr>
              <th className="px-6 py-3">Person</th>
              <th className="px-6 py-3">Reason</th>
              <th className="px-6 py-3 text-right">Amount</th>
              <th className="px-6 py-3 text-right">Remaining</th>
              <th className="px-6 py-3">Due Date</th>
              <th className="px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y border-border">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading payables...</td>
              </tr>
            ) : payables?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No payables found</td>
              </tr>
            ) : (
              payables?.map((item: any) => {
                const personName = item.counterparties?.name || item.people?.name || 'Unknown Person';
                const amount = new Decimal(item.original_amount || item.amount || 0);
                const remaining = new Decimal(item.authoritativeRemaining ?? 0);
                const isOverdue = item.due_date && new Date(item.due_date) < new Date() && remaining.gt(0);

                return (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="px-6 py-4 font-medium">{personName}</td>
                    <td className="px-6 py-4">{item.reason || '-'}</td>
                    <td className="px-6 py-4 text-right">{formatINR(amount.toNumber())}</td>
                    <td className="px-6 py-4 text-right font-semibold text-red-600 dark:text-red-400">
                      {formatINR(remaining.toNumber())}
                    </td>
                    <td className="px-6 py-4">
                      {item.due_date ? (
                        <span className={isOverdue ? "text-destructive font-semibold" : ""}>
                          {format(new Date(item.due_date), 'dd MMM yyyy')}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={
                        remaining.lte(0) || item.status === 'settled' ? 'default' : 
                        isOverdue ? 'destructive' : 'secondary'
                      }>
                        {remaining.lte(0) || item.status === 'settled' ? 'SETTLED' : isOverdue ? 'OVERDUE' : (item.status || 'PENDING').toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground bg-card rounded-xl border">Loading payables...</div>
        ) : payables?.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground bg-card rounded-xl border">No payables found</div>
        ) : (
          payables?.map((item: any) => {
            const personName = item.counterparties?.name || item.people?.name || 'Unknown Person';
            const amount = new Decimal(item.original_amount || item.amount || 0);
            const remaining = new Decimal(item.authoritativeRemaining ?? 0);
            const isOverdue = item.due_date && new Date(item.due_date) < new Date() && remaining.gt(0);

            return (
              <div key={item.id} className="p-4 rounded-xl border bg-card space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">{personName}</h3>
                    {item.reason && <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>}
                  </div>
                  <Badge variant={
                    remaining.lte(0) || item.status === 'settled' ? 'default' : 
                    isOverdue ? 'destructive' : 'secondary'
                  }>
                    {remaining.lte(0) || item.status === 'settled' ? 'SETTLED' : isOverdue ? 'OVERDUE' : (item.status || 'PENDING').toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/50">
                  <div>
                    <span className="text-muted-foreground">Original: </span>
                    <span className="font-medium">{formatINR(amount.toNumber())}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">Remaining: </span>
                    <span className="font-bold text-red-600 dark:text-red-400">
                      {formatINR(remaining.toNumber())}
                    </span>
                  </div>
                  {item.due_date && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Due: </span>
                      <span className={isOverdue ? "text-destructive font-semibold" : "font-medium"}>
                        {format(new Date(item.due_date), 'dd MMM yyyy')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
