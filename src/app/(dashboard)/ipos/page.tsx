'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useIPOs } from '@/lib/hooks/use-ipos';
import { formatINR } from '@/lib/finance/money';
import { Button } from '@/components/ui/button';
import { Plus, ArrowUpRight } from 'lucide-react';
import { IPOForm } from '@/components/ipos/ipo-form';
import Decimal from 'decimal.js';

export default function IPOsPage() {
  const { data: ipos, isLoading } = useIPOs();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [filter, setFilter] = useState('All');

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading IPOs...</div>;

  const filteredIPOs = ipos?.filter((ipo) => filter === 'All' || ipo.status === filter) || [];

  // Calculate summaries across applications
  const summary = filteredIPOs.reduce(
    (acc, ipo) => {
      const apps = ipo.applications || [];
      acc.activeIPOs += ['Upcoming', 'Open'].includes(ipo.status) ? 1 : 0;
      
      apps.forEach((app: any) => {
        const appAmt = new Decimal(app.application_amount ?? app.amount ?? 0);
        acc.totalApplied = acc.totalApplied.plus(appAmt);

        if (app.status === 'Allotted' || app.status === 'Sold / Listed') {
          const debited = new Decimal(app.amount_debited || appAmt);
          acc.totalAllotted = acc.totalAllotted.plus(debited);
        }
        if (app.status === 'Refund Pending' || (app.status === 'Not Allotted' && !app.refund_amount)) {
          const refund = new Decimal(app.refund_amount || appAmt);
          acc.pendingRefunds = acc.pendingRefunds.plus(refund);
        }
      });

      return acc;
    },
    {
      activeIPOs: 0,
      totalApplied: new Decimal(0),
      totalAllotted: new Decimal(0),
      pendingRefunds: new Decimal(0),
    }
  );

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">IPO Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track IPO applications, mandates, allotments, refunds, and listing gains.
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)} className="gap-2 font-semibold">
          <Plus className="h-4 w-4" /> Add IPO
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active IPOs</p>
          <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">{summary.activeIPOs}</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Applied</p>
          <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">{formatINR(summary.totalApplied.toNumber())}</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Allotted</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {formatINR(summary.totalAllotted.toNumber())}
          </p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending Refunds</p>
          <p className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {formatINR(summary.pendingRefunds.toNumber())}
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['All', 'Upcoming', 'Open', 'Closed', 'Allotted', 'Listed'].map((s) => (
          <Button
            key={s}
            variant={filter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      {filteredIPOs.length === 0 ? (
        <div className="text-center p-12 bg-card rounded-xl border border-dashed border-border">
          <p className="text-muted-foreground">No IPOs found in this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIPOs.map((ipo) => {
            const apps = ipo.applications || [];
            const amountApplied = apps.reduce(
              (sum: Decimal, app: any) => sum.plus(new Decimal(app.application_amount ?? app.amount ?? 0)),
              new Decimal(0)
            ).toNumber();

            const company = ipo.company || ipo.company_name || 'Public Company';

            return (
              <Link key={ipo.id} href={`/ipos/${ipo.id}`} className="group">
                <div className="bg-card p-5 rounded-xl border border-border hover:border-primary/50 hover:shadow-md transition-all h-full flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                          {ipo.name}
                          <ArrowUpRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </h3>
                        <p className="text-xs text-muted-foreground">{company}</p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                          ipo.status === 'Open'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : ipo.status === 'Listed'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {ipo.status}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs text-muted-foreground border-t pt-3">
                      <div className="flex justify-between">
                        <span>Price Band:</span>
                        <span className="font-medium text-foreground">
                          {formatINR(ipo.price_band_low || 0)} - {formatINR(ipo.price_band_high || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Lot Size:</span>
                        <span className="font-medium text-foreground">{ipo.lot_size || 1} shares</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Open & Close:</span>
                        <span className="font-medium text-foreground">
                          {ipo.open_date ? new Date(ipo.open_date).toLocaleDateString() : 'N/A'} -{' '}
                          {ipo.close_date ? new Date(ipo.close_date).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Applications:</span>
                        <span className="font-medium text-foreground">{apps.length} applied</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-medium">Total Applied:</span>
                    <span className="font-bold text-foreground text-sm">{formatINR(amountApplied)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {isFormOpen && <IPOForm onClose={() => setIsFormOpen(false)} />}
    </div>
  );
}
