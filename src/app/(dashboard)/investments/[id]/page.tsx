'use client';

import { useState } from 'react';
import { useInvestment } from '@/lib/hooks/use-investments';
import { formatINR } from '@/lib/finance/money';
import { Button } from '@/components/ui/button';
import { Plus, ArrowLeft } from 'lucide-react';
import { InvestmentTransactionForm } from '@/components/investments/investment-transaction-form';
import Link from 'next/link';
import { use } from 'react';
import Decimal from 'decimal.js';

export default function InvestmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { data: rawInvestment, isLoading } = useInvestment(resolvedParams.id);
  const inv = rawInvestment as any;
  const [isTxFormOpen, setIsTxFormOpen] = useState(false);

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading Investment Details...</div>;
  if (!inv) return <div className="p-8 text-muted-foreground">Investment not found.</div>;

  const transactions = inv.investment_transactions || inv.transactions || [];
  
  const rawInvested = inv.total_invested ?? inv.invested_amount ?? 0;
  const rawCurrent = inv.current_value ?? rawInvested;
  
  const invested = new Decimal(rawInvested);
  const current = new Decimal(rawCurrent);
  const pnl = current.minus(invested);
  const returnPct = invested.gt(0) ? pnl.dividedBy(invested).times(100).toNumber() : 0;

  const assetType = (inv.asset_type || inv.asset_class || 'other').replace('_', ' ');

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/investments" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{inv.name}</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {assetType} {inv.symbol ? `· ${inv.symbol}` : ''} {inv.broker ? `· ${inv.broker}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Invested</p>
          <p className="text-xl sm:text-2xl font-bold mt-1">{formatINR(invested.toNumber())}</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Current Value</p>
          <p className="text-xl sm:text-2xl font-bold mt-1">{formatINR(current.toNumber())}</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">P&L</p>
          <p className={`text-xl sm:text-2xl font-bold mt-1 ${pnl.gte(0) ? 'text-emerald-600' : 'text-rose-600'}`}>
            {pnl.gte(0) ? '+' : ''}{formatINR(pnl.toNumber())}
          </p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Return</p>
          <p className={`text-xl sm:text-2xl font-bold mt-1 ${returnPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden mt-8">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-bold">Transaction History</h2>
          <Button onClick={() => setIsTxFormOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" /> Add Transaction / SIP
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground font-medium">
              <tr>
                <th className="p-4">Date</th>
                <th className="p-4">Type</th>
                <th className="p-4 text-right">Units / Qty</th>
                <th className="p-4 text-right">Price / NAV</th>
                <th className="p-4 text-right">Total Amount</th>
                <th className="p-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No transactions recorded yet. Click &quot;Add Transaction / SIP&quot; to log your first entry.
                  </td>
                </tr>
              ) : (
                transactions.map((tx: any) => {
                  const txType = (tx.type || 'buy').toLowerCase();
                  const txDate = tx.date || tx.transaction_date;
                  return (
                    <tr key={tx.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="p-4 whitespace-nowrap">{txDate ? new Date(txDate).toLocaleDateString() : '-'}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider ${
                          txType === 'buy' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                          txType === 'sell' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' :
                          'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        }`}>
                          {txType}
                        </span>
                      </td>
                      <td className="p-4 text-right">{tx.quantity ?? tx.units ?? '-'}</td>
                      <td className="p-4 text-right">{tx.price ?? tx.price_per_unit ? formatINR(Number(tx.price ?? tx.price_per_unit)) : '-'}</td>
                      <td className="p-4 text-right font-semibold">{formatINR(Number(tx.amount ?? tx.total_amount ?? 0))}</td>
                      <td className="p-4 text-xs text-muted-foreground truncate max-w-[200px]">{tx.notes || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isTxFormOpen && (
        <InvestmentTransactionForm
          investmentId={inv.id}
          investmentName={inv.name}
          onClose={() => setIsTxFormOpen(false)}
        />
      )}
    </div>
  );
}
