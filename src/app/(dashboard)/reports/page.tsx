'use client';

import { useState } from 'react';
import { exportToCSV, exportToPDF } from '@/lib/export';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';
import {
  usePersonalFinanceReport,
  useSpendingReport,
  useThirdPartyReport,
  useIPOReport,
  useInvestmentReport,
  usePeopleReport,
  useTaxReport,
} from '@/lib/hooks/use-reports';
import { PageHeader } from '@/components/ui/page-header';

const DATE_RANGES = ['This Month', 'Last Month', 'This Quarter', 'This Year'];
const FY_OPTIONS = ['FY 2025-26', 'FY 2024-25', 'FY 2023-24'];

function ReportCard({
  title,
  desc,
  onGenerate,
}: {
  title: string;
  desc: string;
  onGenerate: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between gap-4 hover:shadow-md transition-shadow">
      <div>
        <h3 className="font-semibold text-base text-gray-900">{title} Report</h3>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{desc}</p>
      </div>
      <button
        onClick={onGenerate}
        className="self-start bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors"
      >
        Generate
      </button>
    </div>
  );
}

interface ReportData {
  title: string;
  rows: Record<string, string>[];
}

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState('This Month');
  const [financialYear, setFinancialYear] = useState('FY 2025-26');
  const [reportData, setReportData] = useState<ReportData | null>(null);

  const personalFinance = usePersonalFinanceReport(dateRange);
  const spending = useSpendingReport(dateRange);
  const thirdParty = useThirdPartyReport(dateRange);
  const ipos = useIPOReport();
  const investments = useInvestmentReport();
  const people = usePeopleReport();
  const tax = useTaxReport(financialYear);

  const generatePersonalFinance = () => {
    if (!personalFinance.data) return;
    const d = personalFinance.data;
    setReportData({
      title: 'Personal Finance',
      rows: [
        { Metric: 'Total Income', Amount: formatINR(d.income) },
        { Metric: 'Total Expenses', Amount: formatINR(d.expenses) },
        { Metric: 'Savings', Amount: formatINR(d.savings) },
        { Metric: 'Investments', Amount: formatINR(d.investments) },
        { Metric: 'Net Worth', Amount: formatINR(d.netWorth) },
      ],
    });
  };

  const generateSpending = () => {
    if (!spending.data) return;
    setReportData({
      title: 'Spending by Category',
      rows: spending.data.map((s) => ({
        Category: s.category,
        Amount: formatINR(s.amount),
      })),
    });
  };

  const generateThirdParty = () => {
    if (!thirdParty.data) return;
    const d = thirdParty.data;
    setReportData({
      title: 'Third-Party Funds',
      rows: [
        { Metric: 'Total Received', Amount: formatINR(d.received) },
        { Metric: 'Amount Used', Amount: formatINR(d.used) },
        { Metric: 'Amount Returned', Amount: formatINR(d.returned) },
        { Metric: 'Outstanding', Amount: formatINR(d.outstanding) },
      ],
    });
  };

  const generateIPO = () => {
    if (!ipos.data) return;
    setReportData({
      title: 'IPO Applications',
      rows: ipos.data.map((ipo: any) => ({
        IPO: ipo.name,
        'Applied Amount': formatINR(ipo.applied),
        Allotted: ipo.allotted ? 'Yes' : 'No',
        'Current Value': formatINR(ipo.currentValue),
      })),
    });
  };

  const generateInvestment = () => {
    if (!investments.data) return;
    const d = investments.data;
    setReportData({
      title: 'Investments',
      rows: [
        { Metric: 'Total Invested', Amount: formatINR(d.totalInvested) },
        { Metric: 'Current Value', Amount: formatINR(d.currentValue) },
        { Metric: 'Returns', Amount: formatINR(d.returns) },
        {
          Metric: 'Return %',
          Amount: d.totalInvested.gt(0)
            ? d.returns.div(d.totalInvested).times(100).toFixed(2) + '%'
            : '—',
        },
      ],
    });
  };

  const generatePeople = () => {
    if (!people.data) return;
    const d = people.data;
    setReportData({
      title: 'People Summary',
      rows: [
        { Metric: 'Total Receivables', Amount: formatINR(d.receivables) },
        { Metric: 'Total Payables', Amount: formatINR(d.payables) },
        { Metric: 'Net Position', Amount: formatINR(d.receivables.minus(d.payables)) },
      ],
    });
  };

  const generateTax = () => {
    if (!tax.data) return;
    const d = tax.data;
    const rows = [
      { Category: 'Total Income', Type: 'income', Amount: formatINR(d.totalIncome) },
      { Category: 'Investment Income', Type: 'investment_income', Amount: formatINR(d.investmentIncome) },
      { Category: 'Deductions', Type: 'deduction', Amount: formatINR(d.deductions) },
      { Category: 'Capital Gains', Type: 'capital_gain', Amount: formatINR(d.capitalGains) },
      ...d.rawRecords.map((r: any) => ({
        Category: r.category,
        Type: r.record_type,
        Amount: formatINR(new Decimal(r.amount || 0)),
      })),
    ];
    setReportData({ title: `Tax Preparation ${financialYear}`, rows });
  };

  const handleClose = () => setReportData(null);

  const handleExportCSV = () => {
    if (reportData) exportToCSV(reportData.rows, reportData.title.replace(/\s+/g, '-').toLowerCase());
  };

  const handleExportPDF = () => {
    if (reportData) exportToPDF(reportData.title, reportData.rows, reportData.title.replace(/\s+/g, '-').toLowerCase());
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <PageHeader title="Financial Reports" />
        <div className="flex gap-2 flex-wrap">
          <select
            className="border border-gray-300 rounded-md px-3 py-2 bg-white text-sm"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            {DATE_RANGES.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select
            className="border border-gray-300 rounded-md px-3 py-2 bg-white text-sm"
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
          >
            {FY_OPTIONS.map((fy) => <option key={fy}>{fy}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ReportCard title="Personal Finance" desc="Income, Expenses, Savings, Investments and Net Worth summary." onGenerate={generatePersonalFinance} />
        <ReportCard title="Spending Analysis" desc="Category-wise breakdown of all expenses." onGenerate={generateSpending} />
        <ReportCard title="Third-Party Funds" desc="Money received from others, used, returned, and outstanding." onGenerate={generateThirdParty} />
        <ReportCard title="IPO Applications" desc="Complete IPO lifecycle: applied, allotted, current value." onGenerate={generateIPO} />
        <ReportCard title="Investment Portfolio" desc="Total invested, current value, and returns." onGenerate={generateInvestment} />
        <ReportCard title="People (Receivables/Payables)" desc="Outstanding amounts owed to and by you." onGenerate={generatePeople} />
        <ReportCard title={`Tax Preparation (${financialYear})`} desc="Income, deductions, capital gains for selected financial year." onGenerate={generateTax} />
      </div>

      {/* Report Preview Modal */}
      {reportData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col gap-0 max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">{reportData.title}</h2>
              <p className="text-sm text-gray-500 mt-1">Period: {dateRange}</p>
            </div>

            <div className="flex-1 overflow-auto">
              {reportData.rows.length === 0 ? (
                <div className="p-12 text-center text-gray-400 text-sm">No data for this period.</div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {Object.keys(reportData.rows[0]).map((key) => (
                        <th key={key} className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide border-b border-gray-200">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-5 py-3 text-sm text-gray-700">
                            {val}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={handleClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md font-medium text-sm transition-colors">
                Close
              </button>
              <button onClick={handleExportCSV} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium text-sm transition-colors">
                Download CSV
              </button>
              <button onClick={handleExportPDF} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium text-sm transition-colors">
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
