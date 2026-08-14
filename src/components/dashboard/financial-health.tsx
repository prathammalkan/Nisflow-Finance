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
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-xl font-bold mb-6 text-gray-900">Financial Health</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="p-4 border border-gray-100 rounded-lg bg-gray-50 flex flex-col justify-center gap-1 hover:border-gray-200 transition-colors">
            <div className="text-xs font-medium text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
            <div className="text-lg font-bold text-gray-900">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
