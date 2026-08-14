'use client';

import { useState } from 'react';
import { useIPO } from '@/lib/hooks/use-ipos';
import { formatINR } from '@/lib/finance/money';
import { Button } from '@/components/ui/button';
import { Plus, ArrowLeft } from 'lucide-react';
import { IPOApplicationForm } from '@/components/ipos/ipo-application-form';
import Link from 'next/link';
import { use, ReactNode } from 'react';

export default function IPODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { data: ipo, isLoading } = useIPO(resolvedParams.id);
  const [isAppFormOpen, setIsAppFormOpen] = useState(false);

  if (isLoading) return <div className="p-8">Loading IPO Details...</div>;
  if (!ipo) return <div className="p-8">IPO not found.</div>;

  const applications = ipo.applications || [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/ipos" className="text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold">{ipo.name}</h1>
          <p className="text-slate-500">{ipo.company_name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <h3 className="text-sm text-slate-500 font-medium">Dates</h3>
          <p className="mt-1 font-medium">Open: {new Date(ipo.open_date).toLocaleDateString()}</p>
          <p className="font-medium">Close: {new Date(ipo.close_date).toLocaleDateString()}</p>
          <p className="font-medium">Listing: {ipo.listing_date ? new Date(ipo.listing_date).toLocaleDateString() : 'TBA'}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <h3 className="text-sm text-slate-500 font-medium">Pricing</h3>
          <p className="mt-1 font-medium">Band: {formatINR(ipo.price_band_low)} - {formatINR(ipo.price_band_high)}</p>
          <p className="font-medium">Lot Size: {ipo.lot_size} shares</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <h3 className="text-sm text-slate-500 font-medium">Status</h3>
          <span className="inline-block mt-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
            {ipo.status}
          </span>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mt-8">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-xl font-bold">Applications</h2>
          <Button onClick={() => setIsAppFormOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" /> Add Application
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                <th className="p-4">Applicant</th>
                <th className="p-4">Owner</th>
                <th className="p-4">Category</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Status</th>
                <th className="p-4">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {applications.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">No applications found.</td>
                </tr>
              ) : (
                applications.map((app: any) => (
                  <tr key={app.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-4">{app.applicant_name}</td>
                    <td className="p-4">{app.fund_owner}</td>
                    <td className="p-4">{app.category}</td>
                    <td className="p-4">{formatINR(app.amount)}</td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-slate-100 rounded text-xs">{app.status}</span>
                    </td>
                    <td className="p-4">{formatINR(app.outstanding_amount || app.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAppFormOpen && (
        <IPOApplicationForm ipoId={ipo.id} onClose={() => setIsAppFormOpen(false)} />
      )}
    </div>
  );
}
