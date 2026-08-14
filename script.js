const fs = require('fs');
const path = require('path');

const rootDir = "L:\\PRATHAM\\PROJECTS\\NISFLOW FINANCE";

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function write(relPath, content) {
  const fullPath = path.join(rootDir, relPath);
  ensureDir(fullPath);
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
}

// 1. src/lib/export.ts
write('src/lib/export.ts', `
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportToCSV(data: any[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', \`\${filename}.csv\`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function exportToExcel(sheets: { name: string; data: any[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    const ws = XLSX.utils.json_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  });
  XLSX.writeFile(wb, \`\${filename}.xlsx\`);
}

export function exportToPDF(title: string, data: any[], filename: string) {
  const doc = new jsPDF();
  doc.text(title, 14, 15);
  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    const body = data.map(row => headers.map(header => String(row[header])));
    autoTable(doc, {
      head: [headers],
      body: body,
      startY: 20
    });
  }
  doc.save(\`\${filename}.pdf\`);
}
`);

// 2. src/lib/hooks/use-reports.ts
write('src/lib/hooks/use-reports.ts', `
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Decimal from 'decimal.js';

export function usePersonalFinanceReport(dateRange: string) {
  const [data, setData] = useState({ income: new Decimal(0), expenses: new Decimal(0), savings: new Decimal(0), investments: new Decimal(0), netWorth: new Decimal(0) });
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  // Fetch dummy data for now
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData({ income: new Decimal(100000), expenses: new Decimal(40000), savings: new Decimal(20000), investments: new Decimal(30000), netWorth: new Decimal(500000) });
      setLoading(false);
    }, 500);
  }, [dateRange]);
  return { data, loading };
}

export function useAccountReport(accountId: string, dateRange: string) {
  const [data, setData] = useState({ opening: new Decimal(0), inflows: new Decimal(0), outflows: new Decimal(0), closing: new Decimal(0) });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData({ opening: new Decimal(50000), inflows: new Decimal(20000), outflows: new Decimal(10000), closing: new Decimal(60000) });
      setLoading(false);
    }, 500);
  }, [accountId, dateRange]);
  return { data, loading };
}

export function useSpendingReport(dateRange: string) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData([{ category: 'Food', amount: new Decimal(15000) }, { category: 'Transport', amount: new Decimal(5000) }]);
      setLoading(false);
    }, 500);
  }, [dateRange]);
  return { data, loading };
}

export function useThirdPartyReport(dateRange: string) {
  const [data, setData] = useState({ received: new Decimal(0), used: new Decimal(0), returned: new Decimal(0), outstanding: new Decimal(0) });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData({ received: new Decimal(100000), used: new Decimal(60000), returned: new Decimal(30000), outstanding: new Decimal(10000) });
      setLoading(false);
    }, 500);
  }, [dateRange]);
  return { data, loading };
}

export function useIPOReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData([{ name: 'Tech Corp IPO', applied: new Decimal(15000), allotted: true, currentValue: new Decimal(20000) }]);
      setLoading(false);
    }, 500);
  }, []);
  return { data, loading };
}

export function useInvestmentReport() {
  const [data, setData] = useState({ totalInvested: new Decimal(0), currentValue: new Decimal(0), returns: new Decimal(0) });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData({ totalInvested: new Decimal(100000), currentValue: new Decimal(120000), returns: new Decimal(20000) });
      setLoading(false);
    }, 500);
  }, []);
  return { data, loading };
}

export function usePeopleReport() {
  const [data, setData] = useState({ receivables: new Decimal(0), payables: new Decimal(0) });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData({ receivables: new Decimal(25000), payables: new Decimal(5000) });
      setLoading(false);
    }, 500);
  }, []);
  return { data, loading };
}

export function useTaxReport(financialYear: string) {
  const [data, setData] = useState({ totalIncome: new Decimal(0), deductions: new Decimal(0), capitalGains: new Decimal(0), investmentIncome: new Decimal(0) });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData({ totalIncome: new Decimal(1200000), deductions: new Decimal(150000), capitalGains: new Decimal(50000), investmentIncome: new Decimal(25000) });
      setLoading(false);
    }, 500);
  }, [financialYear]);
  return { data, loading };
}
`);

// 3. src/app/(dashboard)/reports/page.tsx
write('src/app/(dashboard)/reports/page.tsx', `
'use client';
import { useState } from 'react';
import { exportToCSV, exportToPDF } from '@/lib/export';
import { usePersonalFinanceReport, useAccountReport, useSpendingReport, useThirdPartyReport, useIPOReport, useInvestmentReport, usePeopleReport, useTaxReport } from '@/lib/hooks/use-reports';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState('This Month');
  const [reportData, setReportData] = useState<any>(null);
  
  const handleGenerate = (type: string) => {
    // Generate dummy report to show modal
    setReportData({ type, data: [{ col1: 'Data1', col2: 'Data2' }] });
  };
  
  const handleExportCSV = () => {
    if (reportData) {
      exportToCSV(reportData.data, \`\${reportData.type}-report\`);
    }
  };
  
  const handleExportPDF = () => {
    if (reportData) {
      exportToPDF(\`\${reportData.type} Report\`, reportData.data, \`\${reportData.type}-report\`);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Financial Reports</h1>
        <select 
          className="border rounded p-2"
          value={dateRange} 
          onChange={(e) => setDateRange(e.target.value)}
        >
          <option value="This Month">This Month</option>
          <option value="Last Month">Last Month</option>
          <option value="This Quarter">This Quarter</option>
          <option value="This Year">This Year</option>
          <option value="Custom">Custom</option>
        </select>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {['Personal Finance', 'Account', 'Spending', 'Third-Party', 'IPO', 'Investment', 'People', 'Tax Preparation'].map((report) => (
          <div key={report} className="border rounded-lg p-4 flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-lg">{report} Report</h3>
              <p className="text-sm text-gray-500 mb-4">Generate {report.toLowerCase()} report based on the selected date range.</p>
            </div>
            <Button onClick={() => handleGenerate(report)}>Generate</Button>
          </div>
        ))}
      </div>

      {reportData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
            <h2 className="text-xl font-bold mb-4">{reportData.type} Report</h2>
            <div className="mb-6">
              Preview of {reportData.type} Report Data for {dateRange}...
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReportData(null)}>Close</Button>
              <Button onClick={handleExportCSV}>Export CSV</Button>
              <Button onClick={handleExportPDF}>Export PDF</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`);

// 4. src/app/(dashboard)/tax-records/page.tsx
write('src/app/(dashboard)/tax-records/page.tsx', `
'use client';
import { useState } from 'react';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';
import { exportToCSV, exportToPDF } from '@/lib/export';
import { Button } from '@/components/ui/button';

export default function TaxRecordsPage() {
  const [financialYear, setFinancialYear] = useState('FY 2025-26');
  
  const dummyData = [
    { category: 'Salary income', amount: new Decimal(1200000), documents: 'Form 16', notes: 'Standard deduction applied' },
    { category: 'Interest income', amount: new Decimal(25000), documents: 'Bank Certificate', notes: 'FD Interest' },
    { category: 'Dividend income', amount: new Decimal(15000), documents: 'Broker Statement', notes: '' },
    { category: 'Capital gains', amount: new Decimal(50000), documents: 'Capital Gains Report', notes: 'STCG' },
    { category: 'Deductions', amount: new Decimal(150000), documents: 'ELSS Statement, PPF', notes: '80C' },
  ];

  const handleExportCSV = () => {
    const dataForExport = dummyData.map(d => ({ ...d, amount: d.amount.toString() }));
    exportToCSV(dataForExport, \`tax-records-\${financialYear}\`);
  };

  const handleExportPDF = () => {
    const dataForExport = dummyData.map(d => ({ ...d, amount: d.amount.toString() }));
    exportToPDF(\`Tax Records \${financialYear}\`, dataForExport, \`tax-records-\${financialYear}\`);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tax Records</h1>
        <select 
          className="border rounded p-2"
          value={financialYear} 
          onChange={(e) => setFinancialYear(e.target.value)}
        >
          <option value="FY 2025-26">FY 2025-26</option>
          <option value="FY 2024-25">FY 2024-25</option>
        </select>
      </div>
      
      <div className="bg-yellow-100 text-yellow-800 p-4 rounded mb-6 text-sm">
        <strong>Disclaimer:</strong> This is a record-keeping tool. Consult a tax professional for actual tax liability.
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="border rounded p-4"><div className="text-sm text-gray-500">Total Income</div><div className="text-xl font-bold">{formatINR(new Decimal(1240000))}</div></div>
        <div className="border rounded p-4"><div className="text-sm text-gray-500">Total Deductions</div><div className="text-xl font-bold">{formatINR(new Decimal(150000))}</div></div>
        <div className="border rounded p-4"><div className="text-sm text-gray-500">Investment Income</div><div className="text-xl font-bold">{formatINR(new Decimal(40000))}</div></div>
        <div className="border rounded p-4"><div className="text-sm text-gray-500">Capital Gains</div><div className="text-xl font-bold">{formatINR(new Decimal(50000))}</div></div>
      </div>
      
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Categories</h2>
        <div className="flex gap-2">
          <Button onClick={handleExportCSV} variant="outline">Export CSV</Button>
          <Button onClick={handleExportPDF} variant="outline">Export PDF</Button>
          <Button>Add Tax Record</Button>
        </div>
      </div>
      
      <div className="border rounded overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 border-b">Category</th>
              <th className="p-3 border-b text-right">Amount</th>
              <th className="p-3 border-b">Documents</th>
              <th className="p-3 border-b">Notes</th>
            </tr>
          </thead>
          <tbody>
            {dummyData.map((item, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="p-3">{item.category}</td>
                <td className="p-3 text-right">{formatINR(item.amount)}</td>
                <td className="p-3">{item.documents}</td>
                <td className="p-3">{item.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`);

// 5. src/components/search/global-search.tsx
write('src/components/search/global-search.tsx', `
'use client';
import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandDialog } from '@/components/ui/command';
import { useRouter } from 'next/navigation';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md w-64 transition-colors"
      >
        <Search className="w-4 h-4" />
        <span>Search...</span>
        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Transactions">
            <CommandItem onSelect={() => { setOpen(false); router.push('/transactions'); }}>Salary Deposit - ₹1,00,000</CommandItem>
          </CommandGroup>
          <CommandGroup heading="People">
            <CommandItem onSelect={() => { setOpen(false); router.push('/people'); }}>Alice - ₹5,000 Receivable</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
`);

// 6. src/components/dashboard/financial-health.tsx
write('src/components/dashboard/financial-health.tsx', `
import Decimal from 'decimal.js';

export function FinancialHealth() {
  const metrics = {
    savingsRate: '20%',
    spendingRate: '50%',
    investmentRate: '30%',
    emergencyFund: '6 months',
    monthlyBurn: '₹50,000',
    cashRunway: '12 months',
    receivables: '₹25,000',
    payables: '₹10,000',
    thirdPartyFunds: '₹15,000',
    unexplainedCount: 2
  };

  return (
    <div className="bg-white border rounded-lg p-6 mt-6">
      <h2 className="text-xl font-bold mb-4">Financial Health</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="p-3 border rounded bg-gray-50 flex flex-col justify-center">
            <div className="text-xs text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
            <div className="text-lg font-semibold">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
`);

// 7. src/components/dashboard/money-flow.tsx
write('src/components/dashboard/money-flow.tsx', `
'use client';
export function MoneyFlow() {
  return (
    <div className="bg-white border rounded-lg p-6 mt-6">
      <h2 className="text-xl font-bold mb-4">Money Flow</h2>
      <div className="flex flex-col md:flex-row items-center justify-between bg-gray-50 p-6 rounded-lg gap-4">
        <div className="bg-green-100 text-green-800 p-4 rounded text-center min-w-[120px]">
          <div className="font-bold">Income</div>
          <div className="text-sm">₹1,00,000</div>
        </div>
        <div className="text-gray-400">→</div>
        <div className="flex flex-col gap-2">
          <div className="bg-red-100 text-red-800 p-4 rounded text-center min-w-[120px]">
            <div className="font-bold">Essential</div>
            <div className="text-sm">₹40,000</div>
          </div>
          <div className="bg-orange-100 text-orange-800 p-4 rounded text-center min-w-[120px]">
            <div className="font-bold">Discretionary</div>
            <div className="text-sm">₹10,000</div>
          </div>
        </div>
        <div className="text-gray-400">→</div>
        <div className="bg-blue-100 text-blue-800 p-4 rounded text-center min-w-[120px]">
          <div className="font-bold">Savings</div>
          <div className="text-sm">₹20,000</div>
        </div>
        <div className="text-gray-400">→</div>
        <div className="bg-purple-100 text-purple-800 p-4 rounded text-center min-w-[120px]">
          <div className="font-bold">Investments</div>
          <div className="text-sm">₹30,000</div>
        </div>
      </div>
    </div>
  );
}
`);

// 8. src/components/dashboard/net-worth-breakdown.tsx
write('src/components/dashboard/net-worth-breakdown.tsx', `
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';

export function NetWorthBreakdown() {
  return (
    <div className="bg-white border rounded-lg p-6 mt-6">
      <h2 className="text-xl font-bold mb-4">What Do I Actually Have?</h2>
      <div className="space-y-4">
        <div className="flex justify-between border-b pb-2">
          <span>Personal Cash</span>
          <span className="font-semibold">{formatINR(new Decimal(500000))}</span>
        </div>
        <div className="flex justify-between border-b pb-2">
          <span>Investments</span>
          <span className="font-semibold">{formatINR(new Decimal(300000))}</span>
        </div>
        <div className="flex justify-between border-b pb-2">
          <span>Receivables</span>
          <span className="font-semibold text-green-600">{formatINR(new Decimal(25000))}</span>
        </div>
        <div className="flex justify-between border-b pb-2">
          <span>Payables</span>
          <span className="font-semibold text-red-600">-{formatINR(new Decimal(10000))}</span>
        </div>
        <div className="flex justify-between border-b pb-2 text-gray-400">
          <span>Third-Party Funds Held</span>
          <span>{formatINR(new Decimal(15000))} (Excluded)</span>
        </div>
        <div className="flex justify-between pt-2">
          <span className="font-bold text-lg">Actual Personal Net Worth</span>
          <span className="font-bold text-lg text-blue-600">{formatINR(new Decimal(815000))}</span>
        </div>
      </div>
    </div>
  );
}
`);
