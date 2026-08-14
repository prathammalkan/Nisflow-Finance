'use client';

import { useState } from 'react';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';
import { exportToCSV, exportToPDF } from '@/lib/export';
import { PageHeader } from '@/components/ui/page-header';

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
    exportToCSV(dataForExport, `tax-records-${financialYear}`);
  };

  const handleExportPDF = () => {
    const dataForExport = dummyData.map(d => ({ ...d, amount: d.amount.toString() }));
    exportToPDF(`Tax Records ${financialYear}`, dataForExport, `tax-records-${financialYear}`);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex justify-between items-center">
        <PageHeader title="Tax Records" />
        <select 
          className="border border-gray-300 rounded-md p-2 bg-white shadow-sm"
          value={financialYear} 
          onChange={(e) => setFinancialYear(e.target.value)}
        >
          <option value="FY 2025-26">FY 2025-26</option>
          <option value="FY 2024-25">FY 2024-25</option>
        </select>
      </div>
      
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
        <span className="font-semibold">Disclaimer:</span> This is a record-keeping tool. Consult a tax professional for actual tax liability.
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border border-gray-200 bg-white rounded-xl p-5 shadow-sm flex flex-col gap-1">
          <div className="text-sm font-medium text-gray-500">Total Income</div>
          <div className="text-2xl font-bold text-gray-900">{formatINR(new Decimal(1240000))}</div>
        </div>
        <div className="border border-gray-200 bg-white rounded-xl p-5 shadow-sm flex flex-col gap-1">
          <div className="text-sm font-medium text-gray-500">Total Deductions</div>
          <div className="text-2xl font-bold text-gray-900">{formatINR(new Decimal(150000))}</div>
        </div>
        <div className="border border-gray-200 bg-white rounded-xl p-5 shadow-sm flex flex-col gap-1">
          <div className="text-sm font-medium text-gray-500">Investment Income</div>
          <div className="text-2xl font-bold text-gray-900">{formatINR(new Decimal(40000))}</div>
        </div>
        <div className="border border-gray-200 bg-white rounded-xl p-5 shadow-sm flex flex-col gap-1">
          <div className="text-sm font-medium text-gray-500">Capital Gains</div>
          <div className="text-2xl font-bold text-gray-900">{formatINR(new Decimal(50000))}</div>
        </div>
      </div>
      
      <div className="flex justify-between items-center mt-4">
        <h2 className="text-xl font-semibold text-gray-900">Categories</h2>
        <div className="flex gap-3">
          <button onClick={handleExportCSV} className="px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-md font-medium text-sm transition-colors">
            Export CSV
          </button>
          <button onClick={handleExportPDF} className="px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-md font-medium text-sm transition-colors">
            Export PDF
          </button>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium text-sm transition-colors">
            Add Tax Record
          </button>
        </div>
      </div>
      
      <div className="border border-gray-200 bg-white rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-6 py-4 border-b border-gray-200 text-sm font-semibold text-gray-600">Category</th>
              <th className="px-6 py-4 border-b border-gray-200 text-sm font-semibold text-gray-600 text-right">Amount</th>
              <th className="px-6 py-4 border-b border-gray-200 text-sm font-semibold text-gray-600">Documents</th>
              <th className="px-6 py-4 border-b border-gray-200 text-sm font-semibold text-gray-600">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dummyData.map((item, i) => (
              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.category}</td>
                <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatINR(item.amount)}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{item.documents}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{item.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
