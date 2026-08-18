'use client';

import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { useReconciliations } from '@/lib/hooks/use-reconciliation';
import ImportWizard from '@/components/reconciliation/import-wizard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { matchBankTransactions, BankStatementTransaction, LedgerTransaction } from '@/lib/finance/reconciliation';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, RefreshCw, ArrowRightLeft, ShieldCheck } from 'lucide-react';

export default function ReconciliationPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [statementBalance, setStatementBalance] = useState<string>('');
  const [isReconciling, setIsReconciling] = useState(false);

  const supabase = createClient();
  const queryClient = useQueryClient();

  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: reconciliations } = useReconciliations(selectedAccountId);

  // Fetch statement transactions for this account
  const { data: bankTransactions = [], refetch: refetchBankTxs } = useQuery({
    queryKey: ['bank_statement_transactions', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const { data: statements, error: stmtErr } = await (supabase.from('bank_statements') as any)
        .select('id')
        .eq('account_id', selectedAccountId);
      if (stmtErr || !statements || statements.length === 0) return [];

      const stmtIds = statements.map((s: any) => s.id);
      const { data, error } = await (supabase.from('bank_statement_transactions') as any)
        .select('*')
        .in('statement_id', stmtIds)
        .order('date', { ascending: false });

      if (error) throw error;
      return (data || []) as BankStatementTransaction[];
    },
    enabled: !!selectedAccountId,
  });

  // Fetch ledger transactions for this account
  const { data: ledgerTransactions = [], refetch: refetchLedgerTxs } = useQuery({
    queryKey: ['ledger_transactions_for_rec', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const { data, error } = await (supabase.from('transactions') as any)
        .select('*')
        .eq('account_id', selectedAccountId)
        .eq('is_deleted', false)
        .order('date', { ascending: false });

      if (error) throw error;
      return (data || []) as LedgerTransaction[];
    },
    enabled: !!selectedAccountId,
  });

  // Run deterministic matching engine
  const matchResult = useMemo(() => {
    if (!selectedAccountId) {
      return { matched: [], missingFromLedger: [], missingFromBank: [], needsReview: [] };
    }
    return matchBankTransactions(bankTransactions, ledgerTransactions);
  }, [selectedAccountId, bankTransactions, ledgerTransactions]);

  const selectedAccount = accounts?.find((a: any) => a.id === selectedAccountId);
  const ledgerBalance = new Decimal(selectedAccount?.balance ?? 0);
  const parsedStatementBalance = statementBalance ? new Decimal(statementBalance) : ledgerBalance;
  const difference = parsedStatementBalance.minus(ledgerBalance);
  const isBalanced = difference.isZero();

  const handleConfirmReconciliation = async () => {
    if (!selectedAccountId || isReconciling) return;
    setIsReconciling(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const todayIso = new Date().toISOString().split('T')[0];

      // 1. Mark matched statement transactions
      for (const pair of matchResult.matched) {
        await (supabase.from('bank_statement_transactions') as any)
          .update({
            is_matched: true,
            matched_transaction_id: pair.ledgerTx.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pair.bankTx.id);

        // 2. Mark matched ledger transactions
        await (supabase.from('transactions') as any)
          .update({
            reconciliation_status: 'reconciled',
            status: 'reconciled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', pair.ledgerTx.id);
      }

      // 3. Create reconciliation record
      const { error: recError } = await (supabase.from('reconciliations') as any).insert({
        user_id: userData.user.id,
        account_id: selectedAccountId,
        date: todayIso,
        statement_balance: parsedStatementBalance.toNumber(),
        ledger_balance: ledgerBalance.toNumber(),
        difference: difference.toNumber(),
        status: isBalanced ? 'balanced' : 'discrepancy',
        matched_count: matchResult.matched.length,
        unmatched_count: matchResult.missingFromLedger.length + matchResult.missingFromBank.length,
        completed_at: new Date().toISOString(),
      });

      if (recError) throw recError;

      // 4. Update account last_reconciled_at
      await (supabase.from('accounts') as any)
        .update({
          last_reconciled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedAccountId);

      toast.success(
        `Reconciliation completed. ${matchResult.matched.length} transaction pairs reconciled successfully.`
      );

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_statement_transactions', selectedAccountId] });
      queryClient.invalidateQueries({ queryKey: ['ledger_transactions_for_rec', selectedAccountId] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete reconciliation');
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Bank Statement Reconciliation</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deterministic matching between uploaded bank statements and ledger entries.
          </p>
        </div>
        <ImportWizard
          accountId={selectedAccountId}
          onImportComplete={() => {
            refetchBankTxs();
            refetchLedgerTxs();
          }}
        />
      </div>

      <div className="bg-card p-6 rounded-xl border border-border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Select Account
            </label>
            <select
              className="w-full rounded-lg border border-input bg-background p-2.5 text-sm"
              value={selectedAccountId}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                setStatementBalance('');
              }}
            >
              <option value="">-- Select Bank or Cash Account --</option>
              {accounts?.map((acc: any) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.account_number || acc.type}) — {formatINR(acc.balance || 0)}
                </option>
              ))}
            </select>
          </div>

          {selectedAccountId && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Statement Balance (from Bank)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={statementBalance}
                  onChange={(e) => setStatementBalance(e.target.value)}
                  placeholder={`Ledger: ${ledgerBalance.toFixed(2)}`}
                  className="bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Reconciliation Status
                </label>
                <div
                  className={`p-2.5 rounded-lg text-sm font-semibold flex items-center justify-between ${
                    isBalanced
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  }`}
                >
                  <span>
                    {isBalanced
                      ? 'Reconciled — ₹0 Difference'
                      : `Discrepancy: ${formatINR(difference.abs().toNumber())}`}
                  </span>
                  {isBalanced ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {selectedAccountId && matchResult.matched.length > 0 && (
          <div className="pt-2 flex justify-end border-t">
            <Button
              onClick={handleConfirmReconciliation}
              disabled={isReconciling}
              className="gap-2 font-semibold"
            >
              <ShieldCheck className="h-4 w-4" />
              {isReconciling
                ? 'Persisting Reconciliation...'
                : `Confirm & Reconcile ${matchResult.matched.length} Matched Pairs`}
            </Button>
          </div>
        )}
      </div>

      {selectedAccountId && (
        <Tabs defaultValue="matched" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="matched">
              Matched ({matchResult.matched.length})
            </TabsTrigger>
            <TabsTrigger value="missing-ledger">
              Missing from Ledger ({matchResult.missingFromLedger.length})
            </TabsTrigger>
            <TabsTrigger value="missing-bank">
              Missing from Bank ({matchResult.missingFromBank.length})
            </TabsTrigger>
            <TabsTrigger value="needs-review">
              Needs Review ({matchResult.needsReview.length})
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Matched Pairs */}
          <TabsContent value="matched" className="bg-card p-4 sm:p-6 rounded-xl border border-border mt-2">
            {matchResult.matched.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                No matched transactions found for this account. Upload a statement to run deterministic matching.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                    <tr>
                      <th className="p-3">Match Reason</th>
                      <th className="p-3">Statement Date & Desc</th>
                      <th className="p-3">Ledger Date & Desc</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-center">Direction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {matchResult.matched.map((pair, idx) => (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {pair.matchType === 'exact_ref'
                              ? 'Exact Ref'
                              : pair.matchType === 'exact_date_amount'
                              ? 'Date & Amount'
                              : 'Date Tolerance'}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-foreground">{pair.bankTx.date}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{pair.bankTx.description}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-foreground">{pair.ledgerTx.date}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{pair.ledgerTx.description || 'Ledger Transaction'}</div>
                        </td>
                        <td className="p-3 text-right font-semibold text-foreground whitespace-nowrap">
                          {formatINR(pair.bankTx.amount)}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                            pair.bankTx.direction === 'in'
                              ? 'text-emerald-600'
                              : 'text-rose-600'
                          }`}>
                            {pair.bankTx.direction === 'in' ? 'Deposit' : 'Withdrawal'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Tab 2: Missing from Ledger (Review Only) */}
          <TabsContent value="missing-ledger" className="bg-card p-4 sm:p-6 rounded-xl border border-border mt-2">
            {matchResult.missingFromLedger.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                All statement transactions match ledger entries. None missing.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground flex items-center gap-2 border">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                  <span>
                    These entries appear on your bank statement but have no corresponding match in NisFlow. (Review-only)
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Statement Description</th>
                        <th className="p-3">Reference</th>
                        <th className="p-3 text-right">Amount</th>
                        <th className="p-3 text-center">Direction</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {matchResult.missingFromLedger.map((bTx) => (
                        <tr key={bTx.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 whitespace-nowrap">{bTx.date}</td>
                          <td className="p-3 text-foreground font-medium">{bTx.description}</td>
                          <td className="p-3 text-muted-foreground text-xs">{bTx.reference || '-'}</td>
                          <td className="p-3 text-right font-semibold text-foreground whitespace-nowrap">
                            {formatINR(bTx.amount)}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                              bTx.direction === 'in' ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              {bTx.direction === 'in' ? 'Deposit' : 'Withdrawal'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Tab 3: Missing from Bank */}
          <TabsContent value="missing-bank" className="bg-card p-4 sm:p-6 rounded-xl border border-border mt-2">
            {matchResult.missingFromBank.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                All ledger transactions appear on the bank statement. None missing.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground flex items-center gap-2 border">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                  <span>
                    These entries exist in your NisFlow ledger but were not found in the uploaded statement.
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Ledger Description</th>
                        <th className="p-3">Reference</th>
                        <th className="p-3 text-right">Amount</th>
                        <th className="p-3 text-center">Direction</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {matchResult.missingFromBank.map((lTx) => (
                        <tr key={lTx.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 whitespace-nowrap">{lTx.date}</td>
                          <td className="p-3 text-foreground font-medium">{lTx.description || 'Ledger Entry'}</td>
                          <td className="p-3 text-muted-foreground text-xs">{lTx.upi_reference || lTx.bank_reference || '-'}</td>
                          <td className="p-3 text-right font-semibold text-foreground whitespace-nowrap">
                            {formatINR(lTx.amount)}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                              lTx.direction === 'in' ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              {lTx.direction === 'in' ? 'Deposit' : 'Withdrawal'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Tab 4: Needs Review */}
          <TabsContent value="needs-review" className="bg-card p-4 sm:p-6 rounded-xl border border-border mt-2">
            {matchResult.needsReview.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                No ambiguous transactions requiring manual inspection.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                  Multiple ledger transactions matched the same amount and date range without a unique reference. Per strict financial rules, these are held for review and not auto-reconciled.
                </div>
                {matchResult.needsReview.map((item, i) => (
                  <div key={i} className="p-4 border rounded-xl bg-muted/20 space-y-2">
                    <div className="flex justify-between items-center text-sm font-semibold">
                      <span>Statement: {item.bankTx.description} ({item.bankTx.date})</span>
                      <span className="font-bold">{formatINR(item.bankTx.amount)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Candidate Ledger Matches ({item.possibleLedgerTxs.length}):</p>
                    <ul className="text-xs space-y-1 list-disc pl-5">
                      {item.possibleLedgerTxs.map((cand) => (
                        <li key={cand.id}>
                          {cand.date} — {cand.description || 'Ledger Tx'} — {formatINR(cand.amount)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Past Reconciliations History */}
      <div className="mt-8">
        <h2 className="text-lg sm:text-xl font-bold mb-4">Past Reconciliations</h2>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="min-w-full divide-y divide-border text-xs sm:text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left font-semibold uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-right font-semibold uppercase tracking-wider">Statement Balance</th>
                <th className="px-6 py-3 text-right font-semibold uppercase tracking-wider">Matched Count</th>
                <th className="px-6 py-3 text-left font-semibold uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reconciliations?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-6 text-center text-muted-foreground">
                    No past reconciliations recorded for this account.
                  </td>
                </tr>
              ) : (
                reconciliations?.map((rec: any) => (
                  <tr key={rec.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-foreground">
                      {new Date(rec.created_at || rec.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-foreground">
                      {formatINR(new Decimal(rec.statement_balance || 0))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-muted-foreground">
                      {rec.matched_count || 0} pairs
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-1 inline-flex text-xs font-semibold rounded-full capitalize ${
                          rec.status === 'balanced'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
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
