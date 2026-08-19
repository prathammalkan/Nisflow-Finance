'use client';

import { useState } from 'react';
import { usePerson, usePersonLedger } from '@/lib/hooks/use-people';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReceivableForm } from '@/components/people/receivable-form';
import { PayableForm } from '@/components/people/payable-form';
import { RepaymentDialog } from '@/components/people/repayment-dialog';
import { LoanCalculatorDialog } from '@/components/finance/loan-calculator-dialog';
import { openWhatsAppReminder } from '@/lib/utils/reminder';
import { format } from 'date-fns';
import {
  Send,
  Calculator,
  History,
  PlusCircle,
  MinusCircle,
  CheckCircle2,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';

export default function PersonDetailPage() {
  const params = useParams();
  const personId = params.id as string;
  const { data: person, isLoading: isPersonLoading } = usePerson(personId);
  const { data: ledgerData, isLoading: isLedgerLoading } = usePersonLedger(personId);

  const [loanCalcOpen, setLoanCalcOpen] = useState(false);
  const [repayDialogOpen, setRepayDialogOpen] = useState(false);
  const [repayDirection, setRepayDirection] = useState<'in' | 'out'>('in');

  if (isPersonLoading || isLedgerLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading authoritative person ledger...</div>;
  }
  if (!person) {
    return <div className="p-8 text-center text-muted-foreground">Person not found</div>;
  }

  const balances = ledgerData?.balances;
  const history = ledgerData?.history || [];

  const recBalance = new Decimal(balances?.receivableBalance || 0);
  const payBalance = new Decimal(balances?.payableBalance || 0);
  const netOwed = new Decimal(balances?.netBalance || 0);

  const totalLent = new Decimal(balances?.totalLent || 0);
  const totalReceived = new Decimal(balances?.totalReceived || 0);
  const totalBorrowed = new Decimal(balances?.totalBorrowed || 0);
  const totalRepaid = new Decimal(balances?.totalRepaid || 0);

  const handleOpenRepayment = (direction: 'in' | 'out') => {
    setRepayDirection(direction);
    setRepayDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{person.name}</h1>
          <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
            <Badge variant="outline">{person.relationship || 'Counterparty'}</Badge>
            {person.email && <span>• {person.email}</span>}
            {person.phone && <span>• {person.phone}</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {recBalance.gt(0) && (
            <Button
              variant="outline"
              className="gap-2 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-50 dark:hover:bg-emerald-950"
              onClick={() =>
                openWhatsAppReminder({
                  personName: person.name,
                  phone: person.phone,
                  amount: recBalance.toNumber(),
                  reason: 'Outstanding Balance',
                })
              }
            >
              <Send className="h-4 w-4" /> WhatsApp Reminder
            </Button>
          )}

          <Button variant="outline" className="gap-2" onClick={() => setLoanCalcOpen(true)}>
            <Calculator className="h-4 w-4" /> Loan Calculator
          </Button>

          {/* Action Modals */}
          <ReceivableForm
            trigger={
              <Button variant="outline" className="gap-1 text-emerald-600 border-emerald-500/30">
                <PlusCircle className="h-4 w-4" /> Lend Money
              </Button>
            }
          />
          <PayableForm
            trigger={
              <Button variant="outline" className="gap-1 text-red-600 border-red-500/30">
                <MinusCircle className="h-4 w-4" /> Record Borrowing
              </Button>
            }
          />

          {(recBalance.gt(0) || payBalance.gt(0)) && (
            <Button
              className="gap-1 bg-primary"
              onClick={() => handleOpenRepayment(recBalance.gt(0) ? 'in' : 'out')}
            >
              <CheckCircle2 className="h-4 w-4" /> Record Repayment
            </Button>
          )}
        </div>
      </div>

      {/* Authoritative Ledger Balance Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-4 border rounded-xl bg-emerald-500/10 border-emerald-500/20">
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">
            They Owe You (Receivable)
          </div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
            {formatINR(recBalance.toNumber())}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Lent: {formatINR(totalLent.toNumber())} · Repaid: {formatINR(totalReceived.toNumber())}
          </div>
        </div>

        <div className="p-4 border rounded-xl bg-red-500/10 border-red-500/20">
          <div className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase">
            You Owe Them (Payable)
          </div>
          <div className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">
            {formatINR(payBalance.toNumber())}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Borrowed: {formatINR(totalBorrowed.toNumber())} · Repaid: {formatINR(totalRepaid.toNumber())}
          </div>
        </div>

        <div className="p-4 border rounded-xl bg-primary/10 border-primary/20 col-span-2 md:col-span-2">
          <div className="text-xs font-semibold text-primary uppercase">Authoritative Net Position</div>
          <div
            className={`text-2xl font-bold mt-1 ${
              netOwed.gt(0)
                ? 'text-emerald-700 dark:text-emerald-300'
                : netOwed.lt(0)
                ? 'text-red-700 dark:text-red-300'
                : 'text-muted-foreground'
            }`}
          >
            {netOwed.eq(0)
              ? 'SETTLED (₹0.00)'
              : netOwed.gt(0)
              ? `Owes You ${formatINR(netOwed.toNumber())}`
              : `You Owe ${formatINR(netOwed.abs().toNumber())}`}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Status:{' '}
            <Badge
              variant={netOwed.eq(0) ? 'outline' : netOwed.gt(0) ? 'default' : 'destructive'}
              className="text-[10px] ml-1"
            >
              {balances?.direction || 'SETTLED'}
            </Badge>
          </div>
        </div>

        <div className="p-4 border rounded-xl bg-card col-span-2 md:col-span-1 flex flex-col justify-center">
          <div className="text-xs font-semibold text-muted-foreground uppercase">Fast Repay Actions</div>
          <div className="flex gap-1.5 mt-2">
            {recBalance.gt(0) && (
              <Button
                size="sm"
                variant="outline"
                className="text-[11px] h-7 px-2 text-emerald-600 gap-1"
                onClick={() => handleOpenRepayment('in')}
              >
                <ArrowDownLeft className="h-3 w-3" /> Settle Rec
              </Button>
            )}
            {payBalance.gt(0) && (
              <Button
                size="sm"
                variant="outline"
                className="text-[11px] h-7 px-2 text-red-600 gap-1"
                onClick={() => handleOpenRepayment('out')}
              >
                <ArrowUpRight className="h-3 w-3" /> Pay Debt
              </Button>
            )}
            {recBalance.eq(0) && payBalance.eq(0) && (
              <span className="text-xs text-muted-foreground italic">All settled</span>
            )}
          </div>
        </div>
      </div>

      {/* People Ledger History Table */}
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/40 flex justify-between items-center">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Authoritative Ledger History
          </h2>
          <Badge variant="outline" className="text-xs">
            {history.length} {history.length === 1 ? 'Posting' : 'Postings'}
          </Badge>
        </div>

        {history.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm space-y-2">
            <p className="font-medium">No double-entry journal postings yet for {person.name}.</p>
            <p className="text-xs">
              Use &ldquo;Lend Money&rdquo; or &ldquo;Record Borrowing&rdquo; above to record your first transaction.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right text-emerald-600">Lent (Dr)</th>
                  <th className="px-4 py-3 text-right text-emerald-600">Received (Cr)</th>
                  <th className="px-4 py-3 text-right text-red-600">Borrowed (Cr)</th>
                  <th className="px-4 py-3 text-right text-red-600">Repaid (Dr)</th>
                  <th className="px-4 py-3 text-right font-bold">Running Balance</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y border-border">
                {history.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-muted/30 transition-colors ${
                      item.status === 'reversed' ? 'opacity-50 line-through' : ''
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(item.transactionDate), 'dd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {item.description}
                      <span className="block text-[10px] text-muted-foreground font-mono">
                        {item.idempotencyKey}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600">
                      {item.moneyLent > 0 ? formatINR(item.moneyLent) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600">
                      {item.moneyReceived > 0 ? formatINR(item.moneyReceived) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      {item.moneyBorrowed > 0 ? formatINR(item.moneyBorrowed) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      {item.moneyRepaid > 0 ? formatINR(item.moneyRepaid) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                      {item.status === 'reversed' ? (
                        <span className="text-muted-foreground italic">(Reversed)</span>
                      ) : (
                        <span
                          className={
                            item.runningNetBalance > 0
                              ? 'text-emerald-600'
                              : item.runningNetBalance < 0
                              ? 'text-red-600'
                              : 'text-muted-foreground'
                          }
                        >
                          {item.runningNetBalance === 0
                            ? '₹0.00 (Settled)'
                            : item.runningNetBalance > 0
                            ? `+${formatINR(item.runningNetBalance)} (Owes you)`
                            : `-${formatINR(Math.abs(item.runningNetBalance))} (You owe)`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={item.status === 'posted' ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {item.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Repayment Dialog */}
      <RepaymentDialog
        personId={personId}
        defaultDirection={repayDirection}
        open={repayDialogOpen}
        onOpenChange={setRepayDialogOpen}
      />

      {/* Loan Calculator Dialog */}
      <LoanCalculatorDialog open={loanCalcOpen} onOpenChange={setLoanCalcOpen} />
    </div>
  );
}
