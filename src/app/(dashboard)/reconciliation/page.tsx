'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatINR } from '@/lib/finance/money';
import { Decimal } from 'decimal.js';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { useReconciliations } from '@/lib/hooks/use-reconciliation';
import ImportWizard from '@/components/reconciliation/import-wizard';

export default function ReconciliationPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [statementBalance, setStatementBalance] = useState<string>('0');
  
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: reconciliations, isLoading: recLoading } = useReconciliations(selectedAccountId);

  // Mock data for UI
  const ledgerBalance = new Decimal(50000);
  const parsedStatementBalance = new Decimal(statementBalance || 0);
  const difference = parsedStatementBalance.minus(ledgerBalance);
  const isReconciled = difference.isZero();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Bank Reconciliation</h1>
        <ImportWizard accountId={selectedAccountId} />
      </div>

      <div className="bg-white p-6 rounded-lg shadow space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Account</label>
            <select
              className="w-full rounded-md border border-gray-300 p-2"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              <option value="">-- Select Account --</option>
              {accounts?.map((acc: any) => (
                <option key={acc.id} value={acc.id}>{acc.name} ({acc.account_number || acc.type})</option>
              ))}
            </select>
          </div>
          
          {selectedAccountId && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statement Balance (from Bank)</label>
                <Input
                  type="number"
                  value={statementBalance}
                  onChange={(e) => setStatementBalance(e.target.value)}
                  placeholder="Enter balance"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <div className={`p-2 rounded font-medium ${isReconciled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {isReconciled 
                    ? 'Reconciled — Difference ₹0' 
                    : `Discrepancy: ${formatINR(difference.abs())}`}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {selectedAccountId && (
        <Tabs defaultValue="matched" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="matched">Matched (0)</TabsTrigger>
            <TabsTrigger value="missing-ledger">Missing from Ledger (0)</TabsTrigger>
            <TabsTrigger value="missing-bank">Missing from Bank (0)</TabsTrigger>
          </TabsList>
          <TabsContent value="matched" className="bg-white p-6 rounded-lg shadow mt-2">
            <div className="text-center text-gray-500 py-8">No matched transactions yet.</div>
          </TabsContent>
          <TabsContent value="missing-ledger" className="bg-white p-6 rounded-lg shadow mt-2">
            <div className="text-center text-gray-500 py-8">No transactions missing from ledger.</div>
          </TabsContent>
          <TabsContent value="missing-bank" className="bg-white p-6 rounded-lg shadow mt-2">
            <div className="text-center text-gray-500 py-8">No transactions missing from bank statement.</div>
          </TabsContent>
        </Tabs>
      )}

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Past Reconciliations</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statement Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reconciliations?.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">
                    No past reconciliations found.
                  </td>
                </tr>
              ) : (
                reconciliations?.map((rec: any) => (
                  <tr key={rec.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(rec.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatINR(new Decimal(rec.statement_balance))}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {rec.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
