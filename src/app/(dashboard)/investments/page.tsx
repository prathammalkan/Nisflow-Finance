'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useInvestments, usePortfolioSummary } from '@/lib/hooks/use-investments';
import { formatINR } from '@/lib/finance/money';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { InvestmentForm } from '@/components/investments/investment-form';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import Decimal from 'decimal.js';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658'];

export default function InvestmentsPage() {
  const { data: investments, isLoading: invLoading } = useInvestments();
  const { data: summary, isLoading: sumLoading } = usePortfolioSummary();
  const [isFormOpen, setIsFormOpen] = useState(false);

  if (invLoading || sumLoading) return <div className="p-8">Loading Portfolio...</div>;

  const returnPct = summary?.totalInvested && summary.totalInvested > 0 
    ? (summary.unrealizedPnl / summary.totalInvested) * 100 
    : 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Investment Portfolio</h1>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Investment
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500">Total Invested</p>
          <p className="text-2xl font-bold">{formatINR(summary?.totalInvested || 0)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500">Current Value</p>
          <p className="text-2xl font-bold">{formatINR(summary?.currentValue || 0)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500">Unrealized P&L</p>
          <p className={`text-2xl font-bold ${summary?.unrealizedPnl && summary.unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatINR(summary?.unrealizedPnl || 0)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500">Return %</p>
          <p className={`text-2xl font-bold ${returnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {returnPct.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-semibold text-lg">Holdings</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white text-slate-600 border-b border-slate-100">
                <tr>
                  <th className="p-4 font-medium">Name</th>
                  <th className="p-4 font-medium">Type</th>
                  <th className="p-4 font-medium text-right">Invested</th>
                  <th className="p-4 font-medium text-right">Current Value</th>
                  <th className="p-4 font-medium text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {(!investments || investments.length === 0) ? (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-500">No holdings found.</td></tr>
                ) : investments.map((inv: any) => {
                  const invested = new Decimal(inv.total_invested || 0);
                  const current = new Decimal(inv.current_value || inv.total_invested || 0);
                  const pnl = current.minus(invested);
                  return (
                    <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer">
                      <td className="p-4 font-medium text-blue-600">
                        <Link href={`/investments/${inv.id}`}>{inv.name}</Link>
                      </td>
                      <td className="p-4">{inv.asset_type}</td>
                      <td className="p-4 text-right">{formatINR(invested.toNumber())}</td>
                      <td className="p-4 text-right font-medium">{formatINR(current.toNumber())}</td>
                      <td className={`p-4 text-right font-medium ${pnl.gte(0) ? 'text-green-600' : 'text-red-600'}`}>
                        {formatINR(pnl.toNumber())}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col items-center">
          <h2 className="font-semibold text-lg w-full mb-4">Asset Allocation</h2>
          {summary?.allocation.length === 0 ? (
            <div className="text-slate-500 py-12">No data available</div>
          ) : (
            <div className="w-full h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summary?.allocation}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {summary?.allocation.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatINR(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
                {summary?.allocation.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-slate-600">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {isFormOpen && (
        <InvestmentForm onClose={() => setIsFormOpen(false)} />
      )}
    </div>
  );
}
