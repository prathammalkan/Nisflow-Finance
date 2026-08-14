'use client';

import { useState } from 'react';
import { exportToCSV, exportToPDF } from '@/lib/export';
import { 
  usePersonalFinanceReport, 
  useAccountReport, 
  useSpendingReport, 
  useThirdPartyReport, 
  useIPOReport, 
  useInvestmentReport, 
  usePeopleReport, 
  useTaxReport 
} from '@/lib/hooks/use-reports';
import { PageHeader } from '@/components/ui/page-header';

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState('This Month');
  const [reportData, setReportData] = useState<any>(null);
  
  const handleGenerate = (type: string) => {
    // Generate dummy report to show modal
    setReportData({ type, data: [{ "Column 1": 'Data1', "Column 2": 'Data2' }] });
  };
  
  const handleExportCSV = () => {
    if (reportData) {
      exportToCSV(reportData.data, `${reportData.type.replace(/\s+/g, '-').toLowerCase()}-report`);
    }
  };
  
  const handleExportPDF = () => {
    if (reportData) {
      exportToPDF(`${reportData.type} Report`, reportData.data, `${reportData.type.replace(/\s+/g, '-').toLowerCase()}-report`);
    }
  };

  const reports = [
    { title: 'Personal Finance', desc: 'Income, Expenses, Savings, Investments, Net Worth' },
    { title: 'Account', desc: 'Opening, Inflows, Outflows, Closing per account' },
    { title: 'Spending', desc: 'Categories, trends, daily/weekly/monthly' },
    { title: 'Third-Party', desc: 'Money received, used, returned, outstanding' },
    { title: 'IPO', desc: 'Complete IPO lifecycle summary' },
    { title: 'Investment', desc: 'Portfolio and returns' },
    { title: 'People', desc: 'Receivables/Payables summary' },
    { title: 'Tax Preparation', desc: 'Tax-relevant records' }
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex justify-between items-center">
        <PageHeader title="Financial Reports" />
        <select 
          className="border border-gray-300 rounded-md p-2 bg-white shadow-sm"
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
        {reports.map((report) => (
          <div key={report.title} className="bg-white border rounded-lg p-6 shadow-sm flex flex-col justify-between items-start gap-4 hover:shadow-md transition-shadow">
            <div>
              <h3 className="font-semibold text-lg text-gray-900">{report.title} Report</h3>
              <p className="text-sm text-gray-500 mt-1">{report.desc}</p>
            </div>
            <button 
              onClick={() => handleGenerate(report.title)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors"
            >
              Generate
            </button>
          </div>
        ))}
      </div>

      {reportData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{reportData.type} Report</h2>
              <p className="text-sm text-gray-500 mt-1">Data for {dateRange}</p>
            </div>
            
            <div className="bg-gray-50 border rounded-lg p-4 min-h-[200px] flex items-center justify-center text-gray-400">
              [Preview Table Data Here]
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button 
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md font-medium text-sm transition-colors"
                onClick={() => setReportData(null)}
              >
                Close
              </button>
              <button 
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium text-sm transition-colors"
                onClick={handleExportCSV}
              >
                Download CSV
              </button>
              <button 
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium text-sm transition-colors"
                onClick={handleExportPDF}
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
