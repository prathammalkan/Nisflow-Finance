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
  const { data: inv, isLoading } = useInvestment(resolvedParams.id);
  const [isTxFormOpen, setIsTxFormOpen] = useState(false);

  if (isLoading) return <div className="p-8">Loading Investment Details...</div>;
  if (!inv) return <div className="p-8">Investment not found.</div>;

  const transactions = inv.transactions || [];
  
  const invested = new Decimal(inv.total_invested || 0);
  const current = new Decimal(inv.current_value || inv.total_invested || 0);
  const pnl = current.minus(invested);
  const returnPct = invested.gt(0) ? pnl.dividedBy(invested).times(100).toNumber() : 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/investments" className="text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold">{inv.name}</h1>
          <p className="text-slate-500">{inv.asset_type} {inv.symbol ? `· ${inv.symbol}` : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-500">Total Invested</p>
          <p className="text-2xl font-bold">{formatINR(invested.toNumber())}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-500">Current Value</p>
          <p className="text-2xl font-bold">{formatINR(current.toNumber())}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-500">P&L</p>
          <p className={`text-2xl font-bold ${pnl.gte(0) ? 'text-green-600' : 'text-red-600'}`}>
            {formatINR(pnl.toNumber())}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-500">Return</p>
          <p className={`text-2xl font-bold ${returnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {returnPct.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mt-8">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-xl font-bold">Transaction History</h2>
          <Button onClick={() => setIsTxFormOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" /> Add Transaction
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                <th className="p-4">Date</th>
                <th className="p-4">Type</th>
                <th className="p-4 text-right">Qty</th>
                <th className="p-4 text-right">Price</th>
                <th className="p-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">No transactions yet.</td>
                </tr>
              ) : (
                transactions.map((tx: any) => (
                  <tr key={tx.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-4">{new Date(tx.transaction_date).toLocaleDateString()}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        tx.type === 'Buy' ? 'bg-green-100 text-green-800' :
                        tx.type === 'Sell' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>{tx.type}</span>
                    </td>
                    <td className="p-4 text-right">{tx.quantity || '-'}</td>
                    <td className="p-4 text-right">{tx.price ? formatINR(tx.price) : '-'}</td>
                    <td className="p-4 text-right font-medium">{formatINR(tx.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isTxFormOpen && (
        <InvestmentTransactionForm investmentId={inv.id} onClose={() => setIsTxFormOpen(false)} />
      )}
    </div>
  );
}
