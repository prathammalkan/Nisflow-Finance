'use client';

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatINR } from '@/lib/finance/money';
import { calculateEMI, generateAmortizationSchedule } from '@/lib/finance/loans';
import { useLoanLedgerHistory } from '@/lib/hooks/use-loans';
import { addMonths, format, parseISO } from 'date-fns';
import Decimal from 'decimal.js';
import { CheckCircle2, Clock, RotateCcw } from 'lucide-react';

interface LoanData {
  id: string;
  name: string;
  lender_name?: string;
  loan_type?: string;
  principal_amount?: number;
  principalAmount?: number;
  interest_rate?: number;
  interestRate?: number;
  tenure_months?: number;
  tenureMonths?: number;
  start_date?: string;
  startDate?: string;
  authoritativeRemainingPrincipal?: number;
  remaining_principal?: number;
  totalInterestPaid?: number;
  totalPrincipalPaid?: number;
  isSettled?: boolean;
}

export function AmortizationScheduleDialog({
  loan,
  onClose,
}: {
  loan: LoanData | null;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'schedule' | 'history'>('schedule');
  const { data: ledgerHistory, isLoading: historyLoading } = useLoanLedgerHistory(loan?.id || '');

  const calculations = useMemo(() => {
    if (!loan) return null;

    const principal = new Decimal(loan.principalAmount || loan.principal_amount || 0);
    const rate = new Decimal(loan.interestRate || loan.interest_rate || 0);
    const tenure = loan.tenureMonths || loan.tenure_months || 1;
    const emi = calculateEMI(principal, rate, tenure);
    const schedule = generateAmortizationSchedule(principal, rate, tenure);

    const totalInterest = schedule.reduce(
      (sum, row) => sum.plus(row.interestComponent),
      new Decimal(0)
    );
    const totalPayable = principal.plus(totalInterest);

    return {
      emi,
      schedule,
      totalInterest,
      totalPayable,
    };
  }, [loan]);

  if (!loan || !calculations) return null;

  const initialPrincipal = Number(loan.principalAmount || loan.principal_amount || 0);
  const remainingPrincipal = loan.authoritativeRemainingPrincipal !== undefined
    ? Number(loan.authoritativeRemainingPrincipal)
    : Number(loan.remaining_principal ?? initialPrincipal);

  const tenure = loan.tenureMonths || loan.tenure_months || 1;
  const startDate = loan.startDate || loan.start_date ? parseISO(loan.startDate || loan.start_date!) : new Date();

  return (
    <Dialog open={!!loan} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[850px] max-h-[90vh] flex flex-col p-6">
        <DialogHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl sm:text-2xl font-bold">
              {loan.name} — Loan Ledger
            </DialogTitle>
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              <Button
                type="button"
                variant={activeTab === 'schedule' ? 'secondary' : 'ghost'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setActiveTab('schedule')}
              >
                Amortization Schedule
              </Button>
              <Button
                type="button"
                variant={activeTab === 'history' ? 'secondary' : 'ghost'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setActiveTab('history')}
              >
                Ledger History ({ledgerHistory?.length || 0})
              </Button>
            </div>
          </div>
          <DialogDescription>
            {loan.lender_name ? `${loan.lender_name} • ` : ''}
            {loan.loan_type ? `${loan.loan_type.toUpperCase()} • ` : ''}
            Tenure: {tenure} Months ({Math.floor(tenure / 12)}y {tenure % 12}m)
          </DialogDescription>
        </DialogHeader>

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-2">
          <div className="bg-muted/40 p-3 rounded-lg border">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Original Principal</p>
            <p className="text-base sm:text-lg font-bold text-foreground mt-0.5">
              {formatINR(initialPrincipal)}
            </p>
          </div>
          <div className="bg-muted/40 p-3 rounded-lg border">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Current Balance</p>
            <p className={`text-base sm:text-lg font-bold mt-0.5 ${
              remainingPrincipal <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
            }`}>
              {formatINR(remainingPrincipal)}
            </p>
          </div>
          <div className="bg-muted/40 p-3 rounded-lg border">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Interest Paid (Actual)</p>
            <p className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
              {formatINR(loan.totalInterestPaid || 0)}
            </p>
          </div>
          <div className="bg-muted/40 p-3 rounded-lg border">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Monthly EMI (Calculated)</p>
            <p className="text-base sm:text-lg font-bold text-primary mt-0.5">
              {formatINR(calculations.emi)}
            </p>
          </div>
        </div>

        {/* Tab 1: Amortization Schedule Table */}
        {activeTab === 'schedule' && (
          <div className="flex-1 overflow-y-auto border rounded-xl mt-2 min-h-[300px] max-h-[50vh]">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-muted sticky top-0 z-10 text-muted-foreground font-medium border-b">
                <tr>
                  <th className="p-3 text-center w-12">#</th>
                  <th className="p-3">Payment Date</th>
                  <th className="p-3 text-right">Opening Balance</th>
                  <th className="p-3 text-right">EMI</th>
                  <th className="p-3 text-right">Principal</th>
                  <th className="p-3 text-right">Interest</th>
                  <th className="p-3 text-right">Closing Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {calculations.schedule.map((row) => {
                  const paymentPeriodDate = addMonths(startDate, row.month - 1);
                  return (
                    <tr key={row.month} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 text-center font-medium text-muted-foreground">{row.month}</td>
                      <td className="p-3 font-medium whitespace-nowrap">
                        {format(paymentPeriodDate, 'MMM yyyy')}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {formatINR(row.openingBalance)}
                      </td>
                      <td className="p-3 text-right font-semibold text-foreground">
                        {formatINR(row.paymentAmount)}
                      </td>
                      <td className="p-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        {formatINR(row.principalComponent)}
                      </td>
                      <td className="p-3 text-right font-medium text-rose-600 dark:text-rose-400">
                        {formatINR(row.interestComponent)}
                      </td>
                      <td className="p-3 text-right font-semibold text-foreground">
                        {formatINR(row.remainingBalance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Ledger History Table */}
        {activeTab === 'history' && (
          <div className="flex-1 overflow-y-auto border rounded-xl mt-2 min-h-[300px] max-h-[50vh]">
            {historyLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading ledger history...</div>
            ) : !ledgerHistory || ledgerHistory.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No ledger transactions posted yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-muted sticky top-0 z-10 text-muted-foreground font-medium border-b">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Principal</th>
                    <th className="p-3 text-right">Interest</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ledgerHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium whitespace-nowrap">
                        {format(parseISO(item.date), 'dd MMM yyyy')}
                      </td>
                      <td className="p-3">
                        <Badge variant={
                          item.type === 'disbursement' ? 'secondary' :
                          item.type === 'emi_payment' ? 'default' : 'destructive'
                        }>
                          {item.type === 'disbursement' ? 'Disbursement' :
                           item.type === 'emi_payment' ? 'EMI Payment' : 'Reversed'}
                        </Badge>
                      </td>
                      <td className="p-3 font-medium text-foreground">{item.description}</td>
                      <td className="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatINR(item.principalAmount)}
                      </td>
                      <td className="p-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                        {formatINR(item.interestAmount)}
                      </td>
                      <td className="p-3 text-right font-bold text-foreground">
                        {formatINR(item.totalAmount)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={item.status === 'posted' ? 'outline' : 'destructive'} className="text-[10px]">
                          {item.status.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
