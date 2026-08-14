import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';

export function NetWorthBreakdown() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-xl font-bold mb-6 text-gray-900">What Do I Actually Have?</h2>
      
      <div className="space-y-4">
        <div className="flex justify-between items-center py-2 border-b border-gray-100">
          <span className="text-gray-600">Personal Cash</span>
          <span className="font-semibold text-gray-900">{formatINR(new Decimal(500000))}</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-gray-100">
          <span className="text-gray-600">Investments</span>
          <span className="font-semibold text-gray-900">{formatINR(new Decimal(300000))}</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-gray-100">
          <span className="text-gray-600">Receivables</span>
          <span className="font-semibold text-emerald-600">+{formatINR(new Decimal(25000))}</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-gray-100">
          <span className="text-gray-600">Payables</span>
          <span className="font-semibold text-red-600">-{formatINR(new Decimal(10000))}</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-gray-100">
          <span className="text-gray-400">Third-Party Funds Held (Excluded)</span>
          <span className="text-gray-400">{formatINR(new Decimal(15000))}</span>
        </div>
        
        <div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-gray-100">
          <span className="font-bold text-lg text-gray-900">Actual Personal Net Worth</span>
          <span className="font-bold text-2xl text-blue-600">{formatINR(new Decimal(815000))}</span>
        </div>
      </div>
    </div>
  );
}
