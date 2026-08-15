'use client';

import { useState } from 'react';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';
import { exportToCSV, exportToPDF } from '@/lib/export';
import { PageHeader } from '@/components/ui/page-header';
import { useTaxReport } from '@/lib/hooks/use-reports';
import { createClient } from '@/lib/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const FY_OPTIONS = ['FY 2025-26', 'FY 2024-25', 'FY 2023-24'];

type RecordType = 'income' | 'deduction' | 'capital_gain' | 'investment_income';

interface TaxFormData {
  category: string;
  amount: string;
  record_type: RecordType;
  documents: string;
  notes: string;
}

const defaultForm: TaxFormData = { category: '', amount: '', record_type: 'income', documents: '', notes: '' };

export default function TaxRecordsPage() {
  const [financialYear, setFinancialYear] = useState('FY 2025-26');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TaxFormData>(defaultForm);
  const queryClient = useQueryClient();
  const supabase = createClient();

  const { data, isLoading } = useTaxReport(financialYear);

  const totalIncome = data?.totalIncome ?? new Decimal(0);
  const deductions = data?.deductions ?? new Decimal(0);
  const capitalGains = data?.capitalGains ?? new Decimal(0);
  const investmentIncome = data?.investmentIncome ?? new Decimal(0);
  const rawRecords: any[] = data?.rawRecords ?? [];

  const addRecord = useMutation({
    mutationFn: async (payload: TaxFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase.from('tax_records') as any).insert({
        user_id: user.id,
        financial_year: financialYear,
        category: payload.category,
        amount: parseFloat(payload.amount),
        record_type: payload.record_type,
        documents: payload.documents,
        notes: payload.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-tax', financialYear] });
      toast.success('Tax record added');
      setForm(defaultForm);
      setShowForm(false);
    },
    onError: (e: any) => toast.error(e.message || 'Failed to add record'),
  });

  const handleExportCSV = () => {
    const rows = rawRecords.map((r: any) => ({
      Category: r.category,
      Type: r.record_type,
      Amount: r.amount,
      Documents: r.documents || '',
      Notes: r.notes || '',
    }));
    exportToCSV(rows, `tax-records-${financialYear}`);
  };

  const handleExportPDF = () => {
    const rows = rawRecords.map((r: any) => ({
      Category: r.category,
      Type: r.record_type,
      Amount: r.amount,
      Documents: r.documents || '',
      Notes: r.notes || '',
    }));
    exportToPDF(`Tax Records ${financialYear}`, rows, `tax-records-${financialYear}`);
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <PageHeader title="Tax Records" />
        <select
          className="border border-gray-300 rounded-md px-3 py-2 bg-white shadow-sm text-sm w-full sm:w-auto"
          value={financialYear}
          onChange={(e) => setFinancialYear(e.target.value)}
        >
          {FY_OPTIONS.map((fy) => (
            <option key={fy} value={fy}>{fy}</option>
          ))}
        </select>
      </div>

      <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
        <span className="font-semibold shrink-0">Disclaimer:</span>
        <span>This is a record-keeping tool only. Consult a qualified tax professional for actual tax liability calculations.</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Income', value: totalIncome, color: 'text-gray-900' },
          { label: 'Total Deductions', value: deductions, color: 'text-emerald-700' },
          { label: 'Investment Income', value: investmentIncome, color: 'text-blue-700' },
          { label: 'Capital Gains', value: capitalGains, color: 'text-violet-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="border border-gray-200 bg-white rounded-xl p-4 shadow-sm flex flex-col gap-1">
            <div className="text-xs font-medium text-gray-500">{label}</div>
            <div className={`text-xl font-bold ${color}`}>
              {isLoading ? <span className="block h-7 w-24 bg-gray-100 rounded animate-pulse" /> : formatINR(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Table header with actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Records</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportCSV} className="px-3 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-md font-medium text-sm transition-colors">
            Export CSV
          </button>
          <button onClick={handleExportPDF} className="px-3 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-md font-medium text-sm transition-colors">
            Export PDF
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded-md font-medium text-sm transition-colors"
          >
            + Add Record
          </button>
        </div>
      </div>

      {/* Records Table */}
      <div className="border border-gray-200 bg-white rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading records…</div>
        ) : rawRecords.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-gray-300 text-4xl mb-3">🧾</div>
            <p className="text-gray-500 font-medium">No tax records for {financialYear}</p>
            <p className="text-gray-400 text-sm mt-1">Add your first record using the button above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-4 py-3 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide">Category</th>
                  <th className="px-4 py-3 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide text-right">Amount</th>
                  <th className="px-4 py-3 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide hidden md:table-cell">Documents</th>
                  <th className="px-4 py-3 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide hidden md:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rawRecords.map((item: any) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.category}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{item.record_type?.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium text-right">{formatINR(new Decimal(item.amount || 0))}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{item.documents || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{item.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Record Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
            <h3 className="text-lg font-bold text-gray-900">Add Tax Record</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <input
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="e.g. Salary Income, ELSS Investment"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  value={form.record_type}
                  onChange={(e) => setForm((f) => ({ ...f, record_type: e.target.value as RecordType }))}
                >
                  <option value="income">Income</option>
                  <option value="deduction">Deduction (80C, 80D, etc.)</option>
                  <option value="capital_gain">Capital Gain</option>
                  <option value="investment_income">Investment Income</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Supporting Documents</label>
                <input
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="e.g. Form 16, Bank Certificate"
                  value={form.documents}
                  onChange={(e) => setForm((f) => ({ ...f, documents: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none"
                  rows={2}
                  placeholder="Optional notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button
                onClick={() => { setShowForm(false); setForm(defaultForm); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!form.category || !form.amount || addRecord.isPending}
                onClick={() => addRecord.mutate(form)}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {addRecord.isPending ? 'Saving…' : 'Save Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
