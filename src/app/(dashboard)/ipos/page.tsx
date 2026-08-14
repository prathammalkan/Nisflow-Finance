'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useIPOs } from '@/lib/hooks/use-ipos';
import { formatINR } from '@/lib/finance/money';
import { Button } from '@/components/ui/button';
import { Plus, Filter } from 'lucide-react';
import { IPOForm } from '@/components/ipos/ipo-form';
import Decimal from 'decimal.js';

export default function IPOsPage() {
  const { data: ipos, isLoading } = useIPOs();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [filter, setFilter] = useState('All');

  if (isLoading) return <div className="p-8">Loading IPOs...</div>;

  const filteredIPOs = ipos?.filter(ipo => filter === 'All' || ipo.status === filter) || [];
  
  // Calculate summaries
  const summary = filteredIPOs.reduce((acc, ipo) => {
    const apps = ipo.applications || [];
    acc.activeIPOs += ['Upcoming', 'Open'].includes(ipo.status) ? 1 : 0;
    acc.totalApplied = acc.totalApplied.plus(apps.reduce((sum: Decimal, app: any) => sum.plus(new Decimal(app.amount || 0)), new Decimal(0)));
    acc.totalAllotted = acc.totalAllotted.plus(apps.filter((a: any) => a.status === 'Allotted').reduce((sum: Decimal, app: any) => sum.plus(new Decimal(app.amount || 0)), new Decimal(0)));
    acc.pendingRefunds = acc.pendingRefunds.plus(apps.filter((a: any) => a.status === 'Refund Pending').reduce((sum: Decimal, app: any) => sum.plus(new Decimal(app.amount || 0)), new Decimal(0)));
    return acc;
  }, {
    activeIPOs: 0,
    totalApplied: new Decimal(0),
    totalAllotted: new Decimal(0),
    pendingRefunds: new Decimal(0)
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">IPO Management</h1>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add IPO
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500">Active IPOs</p>
          <p className="text-2xl font-bold">{summary.activeIPOs}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500">Total Applied</p>
          <p className="text-2xl font-bold">{formatINR(summary.totalApplied.toNumber())}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500">Total Allotted</p>
          <p className="text-2xl font-bold text-green-600">{formatINR(summary.totalAllotted.toNumber())}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500">Pending Refunds</p>
          <p className="text-2xl font-bold text-orange-600">{formatINR(summary.pendingRefunds.toNumber())}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {['All', 'Upcoming', 'Open', 'Closed', 'Listed'].map(s => (
          <Button key={s} variant={filter === s ? 'default' : 'outline'} size="sm" onClick={() => setFilter(s)}>
            {s}
          </Button>
        ))}
      </div>

      {filteredIPOs.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-xl border border-dashed border-slate-300">
          <p className="text-slate-500">No IPOs found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIPOs.map(ipo => {
            const apps = ipo.applications || [];
            const amountApplied = apps.reduce((sum: Decimal, app: any) => sum.plus(new Decimal(app.amount || 0)), new Decimal(0)).toNumber();
            return (
              <Link key={ipo.id} href={`/ipos/${ipo.id}`}>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">{ipo.name}</h3>
                      <p className="text-sm text-slate-500">{ipo.company_name}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      ipo.status === 'Open' ? 'bg-green-100 text-green-800' :
                      ipo.status === 'Listed' ? 'bg-blue-100 text-blue-800' :
                      'bg-slate-100 text-slate-800'
                    }`}>
                      {ipo.status}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Dates</span>
                      <span>{new Date(ipo.open_date).toLocaleDateString()} - {new Date(ipo.close_date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Applications</span>
                      <span>{apps.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Amount Applied</span>
                      <span className="font-medium">{formatINR(amountApplied)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {isFormOpen && (
        <IPOForm onClose={() => setIsFormOpen(false)} />
      )}
    </div>
  );
}
