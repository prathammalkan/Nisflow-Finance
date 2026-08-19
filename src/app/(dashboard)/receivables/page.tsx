'use client';

import { useState } from 'react';
import { useReceivables, useReceivablesSummary } from '@/lib/hooks/use-receivables';
import { ReceivableForm } from '@/components/people/receivable-form';
import { BillSplitterDialog } from '@/components/people/bill-splitter-dialog';
import { formatINR } from '@/lib/finance/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { openWhatsAppReminder, openSMSReminder } from '@/lib/utils/reminder';
import { format } from 'date-fns';
import Decimal from 'decimal.js';
import { MessageSquare, Send, Split } from 'lucide-react';

export default function ReceivablesPage() {
  const { data: receivables, isLoading } = useReceivables();
  const summary = useReceivablesSummary();
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Money Others Owe Me</h1>
          <p className="text-sm text-muted-foreground">Track receivables and send instant WhatsApp/SMS reminders.</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setSplitDialogOpen(true)}>
            <Split className="h-4 w-4" /> Split Bill
          </Button>
          <ReceivableForm />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">Total Outstanding</div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{formatINR(summary.totalOutstanding.toNumber())}</div>
        </div>
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="text-xs text-red-600 dark:text-red-400 font-semibold uppercase tracking-wider">Overdue Items</div>
          <div className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">{summary.overdueCount} items</div>
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
              <th className="px-6 py-3 text-right">Actions / Reminders</th>
            </tr>
          </thead>
          <tbody className="divide-y border-border">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">Loading...</td>
              </tr>
            ) : receivables?.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">No receivables found</td>
              </tr>
            ) : (
              receivables?.map((item: any) => {
                const personName = item.counterparties?.name || item.people?.name || 'Unknown Person';
                const amount = new Decimal(item.original_amount || item.amount || 0);
                const remaining = new Decimal(item.authoritativeRemaining ?? 0);
                const isOverdue = item.due_date && new Date(item.due_date) < new Date() && remaining.gt(0);

                return (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="px-6 py-4 font-medium">{personName}</td>
                    <td className="px-6 py-4">{item.reason || '-'}</td>
                    <td className="px-6 py-4 text-right">{formatINR(amount.toNumber())}</td>
                    <td className="px-6 py-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
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
                    <td className="px-6 py-4 text-right">
                      {!remaining.lte(0) && item.status !== 'settled' && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                            onClick={() => openWhatsAppReminder({
                              personName,
                              phone: item.counterparties?.phone,
                              amount: remaining.toNumber(),
                              reason: item.reason || 'Outstanding Balance',
                              dueDate: item.due_date,
                            })}
                          >
                            <Send className="h-3.5 w-3.5" /> WhatsApp
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs gap-1"
                            onClick={() => openSMSReminder({
                              personName,
                              phone: item.counterparties?.phone,
                              amount: remaining.toNumber(),
                              reason: item.reason || 'Outstanding Balance',
                            })}
                          >
                            <MessageSquare className="h-3.5 w-3.5" /> SMS
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <BillSplitterDialog open={splitDialogOpen} onOpenChange={setSplitDialogOpen} />
    </div>
  );
}
