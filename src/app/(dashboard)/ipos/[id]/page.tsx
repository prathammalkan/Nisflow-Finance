'use client';

import { useState } from 'react';
import { useIPO } from '@/lib/hooks/use-ipos';
import { formatINR } from '@/lib/finance/money';
import { Button } from '@/components/ui/button';
import { Plus, ArrowLeft, Pencil, SlidersHorizontal } from 'lucide-react';
import { IPOApplicationForm } from '@/components/ipos/ipo-application-form';
import { IPOAllotmentDialog } from '@/components/ipos/ipo-allotment-dialog';
import { IPOForm } from '@/components/ipos/ipo-form';
import Link from 'next/link';
import { use } from 'react';
import Decimal from 'decimal.js';

export default function IPODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { data: ipo, isLoading } = useIPO(resolvedParams.id);
  
  const [isAppFormOpen, setIsAppFormOpen] = useState(false);
  const [isEditIPOOpen, setIsEditIPOOpen] = useState(false);
  const [selectedAppForAllotment, setSelectedAppForAllotment] = useState<any | null>(null);

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading IPO Details...</div>;
  if (!ipo) return <div className="p-8 text-muted-foreground">IPO not found.</div>;

  const applications = ipo.applications || [];
  const company = ipo.company || ipo.company_name || 'Public Company';
  const defaultAppAmount = (ipo.price_band_high || 0) * (ipo.lot_size || 1);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/ipos" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{ipo.name}</h1>
            <p className="text-sm text-muted-foreground">{company}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditIPOOpen(true)} className="gap-1.5 font-medium">
            <Pencil className="h-4 w-4" /> Edit IPO Details
          </Button>
          <Button size="sm" onClick={() => setIsAppFormOpen(true)} className="gap-1.5 font-semibold">
            <Plus className="h-4 w-4" /> Add Application
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-5 rounded-xl border border-border">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline</h3>
          <p className="mt-2 font-medium text-sm text-foreground">
            Open: {ipo.open_date ? new Date(ipo.open_date).toLocaleDateString() : 'TBA'}
          </p>
          <p className="font-medium text-sm text-foreground">
            Close: {ipo.close_date ? new Date(ipo.close_date).toLocaleDateString() : 'TBA'}
          </p>
          <p className="font-medium text-sm text-foreground">
            Listing: {ipo.listing_date ? new Date(ipo.listing_date).toLocaleDateString() : 'TBA'}
          </p>
        </div>

        <div className="bg-card p-5 rounded-xl border border-border">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Issue Structure</h3>
          <p className="mt-2 font-medium text-sm text-foreground">
            Price Band: {formatINR(ipo.price_band_low || 0)} - {formatINR(ipo.price_band_high || 0)}
          </p>
          <p className="font-medium text-sm text-foreground">
            Lot Size: {ipo.lot_size || 1} Shares
          </p>
          <p className="font-medium text-sm text-foreground">
            Min Investment: {formatINR(defaultAppAmount)}
          </p>
        </div>

        <div className="bg-card p-5 rounded-xl border border-border">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">IPO Status</h3>
          <div className="mt-2">
            <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full uppercase tracking-wider">
              {ipo.status || 'Upcoming'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {applications.length} applications registered
          </p>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden mt-8">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-foreground">Applications & Allotments</h2>
            <p className="text-xs text-muted-foreground">Manage investor mandates, allotments, refunds, and listing sales.</p>
          </div>
          <Button onClick={() => setIsAppFormOpen(true)} size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> Add Application
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
              <tr>
                <th className="p-3">Applicant Name</th>
                <th className="p-3">Fund Owner</th>
                <th className="p-3">Category</th>
                <th className="p-3 text-right">Applied (₹)</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Allotted Shares</th>
                <th className="p-3 text-right">Refund (₹)</th>
                <th className="p-3 text-right">Realized P&L</th>
                <th className="p-3 text-right">Outstanding</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {applications.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    No applications submitted yet. Click &quot;Add Application&quot; to track investor bids.
                  </td>
                </tr>
              ) : (
                applications.map((app: any) => {
                  const appliedAmt = Number(app.application_amount ?? app.amount ?? 0);
                  const debitedAmt = Number(app.amount_debited || 0);
                  const refundAmt = Number(app.refund_amount || 0);
                  const saleProceeds = Number(app.sale_proceeds || 0);
                  const charges = Number(app.charges || 0);
                  const returnedAmt = Number(app.amount_returned || 0);

                  // Realized P&L: strictly only when sale is completed (sale_proceeds > 0)
                  const hasSold = saleProceeds > 0;
                  const realizedPnl = hasSold ? saleProceeds - debitedAmt - charges : null;

                  const outstanding = app.outstanding_amount ?? Math.max(0, appliedAmt - refundAmt - returnedAmt);

                  return (
                    <tr key={app.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-semibold text-foreground">
                        {app.applicant_name}
                        {app.broker && <div className="text-xs font-normal text-muted-foreground">{app.broker}</div>}
                      </td>
                      <td className="p-3 capitalize text-muted-foreground">
                        {app.fund_owner === 'third_party' ? 'Third Party' : 'Personal'}
                      </td>
                      <td className="p-3 uppercase text-xs font-semibold text-muted-foreground">
                        {app.category || 'Retail'}
                      </td>
                      <td className="p-3 text-right font-medium text-foreground whitespace-nowrap">
                        {formatINR(appliedAmt)}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            app.status === 'Allotted' || app.status === 'Sold / Listed'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : app.status === 'Not Allotted' || app.status === 'Refund Received'
                              ? 'bg-muted text-muted-foreground'
                              : app.status === 'Refund Pending'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          }`}
                        >
                          {app.status || 'Applied'}
                        </span>
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {app.shares_allotted ? `${app.shares_allotted} shares` : '—'}
                      </td>
                      <td className="p-3 text-right text-muted-foreground whitespace-nowrap">
                        {refundAmt > 0 ? formatINR(refundAmt) : '—'}
                      </td>
                      <td className="p-3 text-right font-semibold whitespace-nowrap">
                        {hasSold && realizedPnl !== null ? (
                          <span className={realizedPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {realizedPnl >= 0 ? '+' : ''}{formatINR(realizedPnl)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic font-normal text-xs">Unsold</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-semibold text-foreground whitespace-nowrap">
                        {formatINR(outstanding)}
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedAppForAllotment(app)}
                          className="gap-1 text-xs"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" /> Manage
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAppFormOpen && (
        <IPOApplicationForm
          ipoId={ipo.id}
          ipoName={ipo.name}
          defaultAmount={defaultAppAmount}
          onClose={() => setIsAppFormOpen(false)}
        />
      )}

      {isEditIPOOpen && (
        <IPOForm
          initialData={ipo}
          onClose={() => setIsEditIPOOpen(false)}
        />
      )}

      {selectedAppForAllotment && (
        <IPOAllotmentDialog
          application={selectedAppForAllotment}
          onClose={() => setSelectedAppForAllotment(null)}
        />
      )}
    </div>
  );
}
