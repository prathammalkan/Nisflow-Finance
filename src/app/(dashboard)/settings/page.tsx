'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useMonthlyClosings, useCloseMonth, useReopenMonth } from '@/lib/hooks/use-monthly-closing';

export default function SettingsPage() {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  const { data: closings } = useMonthlyClosings();
  const { mutateAsync: closeMonth, isPending: isClosing } = useCloseMonth();
  const { mutateAsync: reopenMonth, isPending: isReopening } = useReopenMonth();

  const [reopenReason, setReopenReason] = useState('');
  const [selectedClosingId, setSelectedClosingId] = useState<string | null>(null);

  const isCurrentMonthClosed = closings?.some(
    (c: any) => c.month === currentMonth && c.year === currentYear && c.status === 'closed'
  );

  const checks = [
    { id: 'recon', label: 'All bank accounts reconciled' },
    { id: 'cash', label: 'Petty cash verified' },
    { id: 'upi', label: 'UPI transactions verified' },
    { id: 'thirdparty', label: 'Third-party accounts (Amazon/Swiggy) checked' },
    { id: 'receivables', label: 'Accounts receivable verified' },
    { id: 'payables', label: 'Accounts payable verified' },
    { id: 'investments', label: 'Investments updated to current value' },
    { id: 'docs', label: 'All necessary documents attached' },
    { id: 'unknown', label: 'All unknown transactions resolved' },
  ];

  const [completedChecks, setCompletedChecks] = useState<Record<string, boolean>>({});

  const allChecksPassed = checks.every(check => completedChecks[check.id]);

  const toggleCheck = (id: string) => {
    setCompletedChecks(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleCloseMonth = async () => {
    if (!allChecksPassed) {
      toast.error('Please complete all checklist items first');
      return;
    }

    try {
      await closeMonth({
        month: currentMonth,
        year: currentYear,
        status: 'closed',
        closed_by: 'system', // Ideally from auth
        checklist_data: completedChecks
      });
      toast.success('Month closed successfully');
    } catch (error) {
      toast.error('Failed to close month');
    }
  };

  const handleReopen = async (id: string, month: number, year: number) => {
    if (!reopenReason) {
      toast.error('Please provide a reason for reopening');
      return;
    }

    try {
      await reopenMonth({ id, reason: reopenReason, month, year });
      toast.success('Month reopened successfully');
      setReopenReason('');
      setSelectedClosingId(null);
    } catch (error) {
      toast.error('Failed to reopen month');
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold">Settings & Administration</h1>

      <section className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Profile Settings</h2>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <Input defaultValue="Admin User" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <Input defaultValue="admin@nisflow.finance" disabled />
          </div>
          <Button>Update Profile</Button>
        </div>
      </section>

      <section className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Month-end Closing</h2>
        
        <div className="mb-6 p-4 rounded-lg border-2 border-gray-100 bg-gray-50">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-medium text-lg">Current Period: {new Date(currentYear, currentMonth - 1).toLocaleString('default', { month: 'long' })} {currentYear}</h3>
              <p className="text-sm text-gray-500">Status: {isCurrentMonthClosed ? 'Closed' : 'Open'}</p>
            </div>
            {!isCurrentMonthClosed && (
              <Button 
                onClick={handleCloseMonth} 
                disabled={!allChecksPassed || isClosing}
                className={allChecksPassed ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                {isClosing ? 'Closing...' : 'Close Month'}
              </Button>
            )}
          </div>

          {!isCurrentMonthClosed && (
            <div className="space-y-2 mt-4">
              <p className="font-medium text-sm text-gray-700 mb-2">Closing Checklist</p>
              {checks.map(check => (
                <div key={check.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={check.id}
                    checked={!!completedChecks[check.id]}
                    onChange={() => toggleCheck(check.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor={check.id} className="text-sm text-gray-700">{check.label}</label>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="font-medium mb-3">Closing History</h3>
          <div className="border rounded-md overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Period</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Closed Date</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {closings?.map((closing: any) => (
                  <tr key={closing.id}>
                    <td className="px-4 py-3">{new Date(closing.year, closing.month - 1).toLocaleString('default', { month: 'long' })} {closing.year}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        closing.status === 'closed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {closing.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{new Date(closing.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      {closing.status === 'closed' && (
                        selectedClosingId === closing.id ? (
                          <div className="flex items-center gap-2 justify-end">
                            <Input 
                              size={20}
                              placeholder="Reason..." 
                              value={reopenReason}
                              onChange={(e) => setReopenReason(e.target.value)}
                              className="w-48 h-8 text-xs"
                            />
                            <Button size="sm" onClick={() => handleReopen(closing.id, closing.month, closing.year)} disabled={isReopening}>Confirm</Button>
                            <Button size="sm" variant="ghost" onClick={() => setSelectedClosingId(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setSelectedClosingId(closing.id)}>
                            Reopen
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Export Data</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline">Export CSV</Button>
            <Button variant="outline">Export Excel</Button>
            <Button variant="outline">Export PDF</Button>
          </div>
        </section>

        <section className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">About</h2>
          <p className="text-sm text-gray-500">NisFlow Finance v1.0.0</p>
          <p className="text-sm text-gray-500 mt-2">Built with Next.js, Supabase, and Tailwind CSS.</p>
        </section>
      </div>
    </div>
  );
}
