'use client';

import { useState } from 'react';
import { formatINR } from '@/lib/finance/money';
import { compareRegimes, type TaxInput, type TaxResult } from '@/lib/finance/tax-calculator';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import Decimal from 'decimal.js';
import { Calculator, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

function safeDecimal(val: string): Decimal {
  const n = parseFloat(val);
  return new Decimal(isNaN(n) || n < 0 ? 0 : n);
}

interface InputField { label: string; key: keyof TaxInput; helper?: string; max?: number }

const incomeFields: InputField[] = [
  { label: 'Gross Annual Income (₹)', key: 'grossIncome', helper: 'Total CTC / annual salary before any deductions' },
];

const deductionFields: InputField[] = [
  { label: '80C Investments (₹)', key: 'deduction80C', helper: 'ELSS, PPF, LIC, EPF, NSC — max ₹1,50,000', max: 150000 },
  { label: '80D Health Insurance (₹)', key: 'deduction80D', helper: 'Self: max ₹25,000 | With senior parents: max ₹75,000' },
  { label: 'HRA Exemption (₹)', key: 'hra', helper: 'House Rent Allowance exemption (Old Regime only)' },
  { label: 'LTA Exemption (₹)', key: 'lta', helper: 'Leave Travel Allowance (Old Regime only)' },
  { label: 'Other Deductions (₹)', key: 'otherDeductions', helper: '80CCD(1B) NPS ₹50k, 80G, home loan interest, 80TTA interest' },
];

function ResultCol({ result, isBetter }: { result: TaxResult; isBetter: boolean }) {
  type Row = { label: string; val: Decimal | null; bold?: boolean; highlight?: boolean; minus?: boolean; extra?: string };
  const rows: Row[] = [
    { label: 'Gross Income', val: result.grossIncome },
    { label: 'Standard Deduction', val: result.standardDeduction },
    { label: 'Other Deductions', val: result.regime === 'old' ? result.totalDeductions.minus(result.standardDeduction) : new Decimal(0) },
    { label: 'Taxable Income', val: result.taxableIncome, bold: true },
    { label: 'Tax on Slabs', val: result.taxBeforeCess },
    { label: '87A Rebate', val: result.rebate87A, minus: true },
    { label: 'Surcharge', val: result.surcharge },
    { label: 'Cess (4%)', val: result.cess },
    { label: 'Total Tax', val: result.totalTax, bold: true, highlight: true },
    { label: 'Effective Rate', val: null, extra: result.effectiveRate.toFixed(2) + '%' },
    { label: 'Monthly In-Hand', val: result.inHandMonthly, bold: true },
  ];
  return (
    <div className={cn('flex-1 rounded-xl border-2 overflow-hidden', isBetter ? 'border-emerald-500' : 'border-gray-200')}>
      <div className={cn('px-4 py-3 text-center font-bold text-sm', isBetter ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700')}>
        {result.regime === 'old' ? 'Old Regime' : 'New Regime'}
        {isBetter && ' ✓ Better'}
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map(row => (
          <div key={row.label} className={cn('flex justify-between items-center px-4 py-2.5 text-sm', row.highlight && 'bg-gray-50')}>
            <span className={cn('text-gray-600', row.bold && 'font-semibold text-gray-900')}>{row.label}</span>
            <span className={cn('font-medium', row.bold && 'font-bold', row.highlight && (isBetter ? 'text-emerald-700' : 'text-gray-900'))}>
              {row.val !== null ? (row.minus ? '-' : '') + formatINR(row.val) : row.extra}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TaxCalculatorPage() {
  const [values, setValues] = useState<Record<string, string>>({
    grossIncome: '', deduction80C: '', deduction80D: '', hra: '', lta: '', otherDeductions: '',
  });
  const [result, setResult] = useState<ReturnType<typeof compareRegimes> | null>(null);

  const setVal = (key: string, v: string) => setValues(prev => ({ ...prev, [key]: v }));

  const handleCalculate = () => {
    const input: TaxInput = {
      grossIncome: safeDecimal(values.grossIncome),
      deduction80C: safeDecimal(values.deduction80C),
      deduction80D: safeDecimal(values.deduction80D),
      hra: safeDecimal(values.hra),
      lta: safeDecimal(values.lta),
      otherDeductions: safeDecimal(values.otherDeductions),
    };
    setResult(compareRegimes(input));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4 sm:p-6">
      <PageHeader title="Income Tax Calculator" description="FY 2025-26 — Old Regime vs New Regime comparison for Indian taxpayers." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wide">Income</h3>
            {incomeFields.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
                <Input type="number" min="0" placeholder="0" value={values[f.key as string]} onChange={e => setVal(f.key as string, e.target.value)} />
                {f.helper && <p className="text-xs text-gray-400 mt-1">{f.helper}</p>}
              </div>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wide">Old Regime Deductions</h3>
            <p className="text-xs text-gray-400 mb-4">These apply only to the Old Regime. New Regime gives only ₹75,000 standard deduction.</p>
            <div className="space-y-4">
              {deductionFields.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
                  <Input type="number" min="0" max={f.max} placeholder="0" value={values[f.key as string]} onChange={e => setVal(f.key as string, e.target.value)} />
                  {f.helper && <p className="text-xs text-gray-400 mt-1">{f.helper}</p>}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleCalculate}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white py-3 rounded-xl font-semibold transition-colors"
          >
            <Calculator className="h-5 w-5" /> Calculate Tax
          </button>
        </div>

        {/* Results Panel */}
        <div className="space-y-4">
          {!result ? (
            <div className="h-full min-h-[300px] border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-center p-8">
              <Calculator className="h-12 w-12 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Enter your income details</p>
              <p className="text-gray-400 text-sm mt-1">and click Calculate to compare regimes</p>
            </div>
          ) : (
            <>
              {/* Recommendation Banner */}
              <div className={cn('rounded-xl p-4 flex items-center gap-3', result.recommended === 'new' ? 'bg-emerald-50 border border-emerald-200' : 'bg-blue-50 border border-blue-200')}>
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-bold text-gray-900">{result.recommended === 'new' ? 'New Regime' : 'Old Regime'} is better for you</p>
                  <p className="text-sm text-gray-600">You save <span className="font-bold text-emerald-700">{formatINR(result.savings)}</span> annually by choosing the {result.recommended === 'new' ? 'New' : 'Old'} Regime.</p>
                </div>
              </div>

              {/* Comparison Table */}
              <div className="flex gap-3">
                <ResultCol result={result.old} isBetter={result.recommended === 'old'} />
                <ResultCol result={result.new} isBetter={result.recommended === 'new'} />
              </div>

              {/* Slab Breakdown */}
              {result[result.recommended].slabBreakdown.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <h4 className="text-sm font-bold text-gray-800 mb-3">Tax Slab Breakdown ({result.recommended === 'new' ? 'New' : 'Old'} Regime)</h4>
                  <div className="space-y-2">
                    {result[result.recommended].slabBreakdown.map((s, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-600">{s.slab}</span>
                        <span className="font-medium text-gray-900">{formatINR(s.tax)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-xs text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>This is an estimate for planning purposes only. Consult a Chartered Accountant for your actual tax liability.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
