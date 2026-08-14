'use client';

export function MoneyFlow() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm overflow-x-auto">
      <h2 className="text-xl font-bold mb-6 text-gray-900">Money Flow</h2>
      
      <div className="flex flex-col md:flex-row items-center justify-between min-w-[700px] bg-gray-50 p-8 rounded-xl border border-gray-100 gap-4">
        <div className="bg-green-50 border border-green-200 text-green-900 p-4 rounded-lg text-center min-w-[140px] shadow-sm">
          <div className="font-semibold text-sm text-green-700">Income</div>
          <div className="font-bold text-lg mt-1">₹1,00,000</div>
        </div>
        
        <div className="text-gray-300 font-bold text-xl">→</div>
        
        <div className="flex flex-col gap-3">
          <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-lg text-center min-w-[140px] shadow-sm">
            <div className="font-semibold text-sm text-red-700">Essential</div>
            <div className="font-bold text-lg mt-1">₹40,000</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 text-orange-900 p-4 rounded-lg text-center min-w-[140px] shadow-sm">
            <div className="font-semibold text-sm text-orange-700">Discretionary</div>
            <div className="font-bold text-lg mt-1">₹10,000</div>
          </div>
        </div>
        
        <div className="text-gray-300 font-bold text-xl">→</div>
        
        <div className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-lg text-center min-w-[140px] shadow-sm">
          <div className="font-semibold text-sm text-blue-700">Savings</div>
          <div className="font-bold text-lg mt-1">₹20,000</div>
        </div>
        
        <div className="text-gray-300 font-bold text-xl">→</div>
        
        <div className="bg-purple-50 border border-purple-200 text-purple-900 p-4 rounded-lg text-center min-w-[140px] shadow-sm">
          <div className="font-semibold text-sm text-purple-700">Investments</div>
          <div className="font-bold text-lg mt-1">₹30,000</div>
        </div>
      </div>
    </div>
  );
}
