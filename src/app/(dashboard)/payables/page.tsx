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
        <div className="p-4 bg-red-50 border border-red-100 rounded-lg">
          <div className="text-sm text-red-600 font-medium">Total Outstanding</div>
          <div className="text-2xl font-bold text-red-700">{formatINR(summary.totalOutstanding.toNumber())}</div>
        </div>
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg">
          <div className="text-sm text-amber-600 font-medium">Overdue</div>
          <div className="text-2xl font-bold text-amber-700">{summary.overdueCount} items</div>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
            <tr>
              <th className="px-6 py-3">Person</th>
              <th className="px-6 py-3">Reason</th>
              <th className="px-6 py-3 text-right">Amount</th>
              <th className="px-6 py-3 text-right">Remaining</th>
              <th className="px-6 py-3">Due Date</th>
              <th className="px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
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
                const amount = new Decimal(item.amount);
                const paid = new Decimal(item.paid_amount || 0);
                const remaining = amount.minus(paid);
                
                return (
                  <tr key={item.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium">{item.people?.name || 'Unknown'}</td>
                    <td className="px-6 py-4">{item.reason || '-'}</td>
                    <td className="px-6 py-4 text-right">{formatINR(item.amount)}</td>
                    <td className="px-6 py-4 text-right font-medium">{formatINR(remaining.toNumber())}</td>
                    <td className="px-6 py-4">
                      {item.due_date ? format(new Date(item.due_date), 'dd MMM yyyy') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={
                        item.status === 'SETTLED' ? 'default' : 
                        item.status === 'PARTIAL' ? 'secondary' : 'outline'
                      }>
                        {item.status}
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
