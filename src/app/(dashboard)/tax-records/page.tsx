'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { formatINR } from '@/lib/finance/money';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import Decimal from 'decimal.js';
import jsPDF from 'jspdf';
import { Plus, Download, FileSpreadsheet, X, FileText } from 'lucide-react';

const FY_OPTIONS = ['2025-26', '2024-25', '2023-24', '2022-23'];

type RecordType = 'income' | 'deduction' | 'capital_gain' | 'investment_income';

interface TaxRecordForm {
  category: string;
  record_type: RecordType;
  amount: string;
  financial_year: string;
  documents: string;
  notes: string;
}

const defaultForm: TaxRecordForm = {
  category: '',
  record_type: 'income',
  amount: '',
  financial_year: '2025-26',
  documents: '',
  notes: '',
};

export default function TaxRecordsPage() {
  const [financialYear, setFinancialYear] = useState('2025-26');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TaxRecordForm>({ ...defaultForm, financial_year: '2025-26' });

  const supabase = createClient();
  const queryClient = useQueryClient();

  const { data: rawRecords = [], isLoading } = useQuery({
    queryKey: ['tax-records', financialYear],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await (supabase.from('tax_records') as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('financial_year', financialYear)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const addRecord = useMutation({
    mutationFn: async (payload: TaxRecordForm) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await (supabase.from('tax_records') as any).insert({
        user_id: user.id,
        category: payload.category,
        record_type: payload.record_type,
        amount: parseFloat(payload.amount),
        financial_year: financialYear,
        documents: payload.documents || null,
        notes: payload.notes || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-records', financialYear] });
      setShowForm(false);
      setForm({ ...defaultForm, financial_year: financialYear });
      toast.success('Tax record added successfully');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to add record');
    },
  });

  const totalIncome = rawRecords
    .filter((r) => r.record_type === 'income')
    .reduce((sum, r) => sum.plus(new Decimal(r.amount || 0)), new Decimal(0));

  const deductions = rawRecords
    .filter((r) => r.record_type === 'deduction')
    .reduce((sum, r) => sum.plus(new Decimal(r.amount || 0)), new Decimal(0));

  const investmentIncome = rawRecords
    .filter((r) => r.record_type === 'investment_income')
    .reduce((sum, r) => sum.plus(new Decimal(r.amount || 0)), new Decimal(0));

  const capitalGains = rawRecords
    .filter((r) => r.record_type === 'capital_gain')
    .reduce((sum, r) => sum.plus(new Decimal(r.amount || 0)), new Decimal(0));

  const handleExportCSV = () => {
    if (rawRecords.length === 0) {
      toast.error('No records to export');
      return;
    }
    const headers = ['Category', 'Type', 'Amount (INR)', 'Documents', 'Notes'];
    const rows = rawRecords.map((r) => [
      `"${r.category}"`,
      `"${r.record_type}"`,
      r.amount,
      `"${r.documents || ''}"`,
      `"${r.notes || ''}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `tax_records_FY_${financialYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV exported successfully');
  };

  const handleExportPDF = () => {
    if (rawRecords.length === 0) {
      toast.error('No records to export');
      return;
    }
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Tax Records Summary — FY ${financialYear}`, 14, 22);

    doc.setFontSize(11);
    doc.text(`Total Income: Rs. ${totalIncome.toFixed(2)}`, 14, 34);
    doc.text(`Total Deductions: Rs. ${deductions.toFixed(2)}`, 14, 42);
    doc.text(`Investment Income: Rs. ${investmentIncome.toFixed(2)}`, 14, 50);
    doc.text(`Capital Gains: Rs. ${capitalGains.toFixed(2)}`, 14, 58);

    doc.line(14, 64, 196, 64);

    let y = 74;
    doc.setFontSize(10);
    rawRecords.forEach((item, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(
        `${index + 1}. ${item.category} (${item.record_type}) — Rs. ${Number(item.amount).toFixed(2)}`,
        14,
        y
      );
      y += 8;
    });

    doc.save(`tax_records_FY_${financialYear}.pdf`);
    toast.success('PDF exported successfully');
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <PageHeader title="Tax Records" description="Maintain official records of income, 80C/80D deductions, and capital gains." />
        <select
          className="border border-border rounded-xl px-3 py-2 bg-background shadow-sm text-sm text-foreground w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-primary"
          value={financialYear}
          onChange={(e) => setFinancialYear(e.target.value)}
        >
          {FY_OPTIONS.map((fy) => (
            <option key={fy} value={fy}>FY {fy}</option>
          ))}
        </select>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 px-4 py-3 rounded-xl text-xs sm:text-sm flex items-start gap-2">
        <span className="font-semibold shrink-0">Note:</span>
        <span>This is a record-keeping tool. Consult a chartered accountant for official filing and verification.</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Income', value: totalIncome, color: 'text-foreground' },
          { label: 'Total Deductions', value: deductions, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Investment Income', value: investmentIncome, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Capital Gains', value: capitalGains, color: 'text-violet-600 dark:text-violet-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="border border-border bg-card rounded-xl p-4 shadow-sm flex flex-col gap-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={`text-lg sm:text-xl font-bold ${color}`}>
              {isLoading ? <span className="block h-6 w-24 bg-muted rounded animate-pulse" /> : formatINR(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Table header with actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-base font-bold text-foreground">Tax Entries ({financialYear})</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5 text-xs font-medium">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5 text-xs font-medium">
            <Download className="h-3.5 w-3.5" /> Export PDF
          </Button>
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            className="gap-1.5 text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5" /> Add Record
          </Button>
        </div>
      </div>

      {/* Records Table */}
      <div className="border border-border bg-card rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading records…</div>
        ) : rawRecords.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-foreground font-semibold text-sm">No tax records for FY {financialYear}</p>
            <p className="text-muted-foreground text-xs mt-1">Add salary, investments, or deductions using the button above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px]">Category</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px]">Type</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px] text-right">Amount</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px] hidden md:table-cell">Documents</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px] hidden md:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rawRecords.map((item: any) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{item.category}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{item.record_type?.replace('_', ' ')}</td>
                    <td className="px-4 py-3 font-semibold text-foreground text-right">{formatINR(new Decimal(item.amount || 0))}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{item.documents || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{item.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Record Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-card text-card-foreground border border-border rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-foreground">Add Tax Record (FY {financialYear})</h3>
              <button onClick={() => { setShowForm(false); setForm(defaultForm); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Category *</label>
                <Input
                  placeholder="e.g. Salary Income, ELSS Investment, 80D Health"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Type *</label>
                <select
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Amount (₹) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Supporting Documents</label>
                <Input
                  placeholder="e.g. Form 16, Bank Interest Certificate"
                  value={form.documents}
                  onChange={(e) => setForm((f) => ({ ...f, documents: e.target.value }))}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Notes</label>
                <textarea
                  className="w-full border border-border bg-background text-foreground rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={2}
                  placeholder="Optional notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button
                variant="outline"
                onClick={() => { setShowForm(false); setForm(defaultForm); }}
              >
                Cancel
              </Button>
              <Button
                disabled={!form.category || !form.amount || addRecord.isPending}
                onClick={() => addRecord.mutate(form)}
              >
                {addRecord.isPending ? 'Saving…' : 'Save Record'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
