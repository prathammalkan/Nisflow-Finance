'use client';

import { usePayables, usePayablesSummary } from '@/lib/hooks/use-payables';
import { PayableForm } from '@/components/people/payable-form';
import { formatINR } from '@/lib/finance/money';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import Decimal from 'decimal.js';

export default function PayablesPage() {
  const { data: payables, isLoading } = usePayables();
  const summary = usePayablesSummary();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Money I Owe Others</h1>
        <PayableForm />
      </div>

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

      <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
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
                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading...</td>
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
    </div>
  );
}
