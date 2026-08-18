'use client';

import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/finance/money';
import { calculateEMI, generateAmortizationSchedule } from '@/lib/finance/loans';
import { addMonths, format, parseISO } from 'date-fns';
import Decimal from 'decimal.js';

interface LoanData {
  id: string;
  name: string;
  lender_name?: string;
  loan_type?: string;
  principal_amount: number;
  interest_rate: number;
  tenure_months: number;
  start_date?: string;
  remaining_principal?: number;
}

export function AmortizationScheduleDialog({
  loan,
  onClose,
}: {
  loan: LoanData | null;
  onClose: () => void;
}) {
  const calculations = useMemo(() => {
    if (!loan) return null;

    const principal = new Decimal(loan.principal_amount || 0);
    const rate = new Decimal(loan.interest_rate || 0);
    const tenure = loan.tenure_months || 1;
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

  const startDate = loan.start_date ? parseISO(loan.start_date) : new Date();

  return (
    <Dialog open={!!loan} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[850px] max-h-[90vh] flex flex-col p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xl sm:text-2xl font-bold flex items-center justify-between">
            <span>{loan.name} — Amortization Schedule</span>
          </DialogTitle>
          <DialogDescription>
            {loan.lender_name ? `${loan.lender_name} • ` : ''}
            {loan.loan_type ? `${loan.loan_type.toUpperCase()} • ` : ''}
            Tenure: {loan.tenure_months} Months ({Math.floor(loan.tenure_months / 12)}y {loan.tenure_months % 12}m)
          </DialogDescription>
        </DialogHeader>

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-2">
          <div className="bg-muted/40 p-3 rounded-lg border">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Principal</p>
            <p className="text-base sm:text-lg font-bold text-foreground mt-0.5">
              {formatINR(loan.principal_amount)}
            </p>
          </div>
          <div className="bg-muted/40 p-3 rounded-lg border">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Monthly EMI</p>
            <p className="text-base sm:text-lg font-bold text-primary mt-0.5">
              {formatINR(calculations.emi)}
            </p>
          </div>
          <div className="bg-muted/40 p-3 rounded-lg border">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Total Interest</p>
            <p className="text-base sm:text-lg font-bold text-rose-600 dark:text-rose-400 mt-0.5">
              {formatINR(calculations.totalInterest)}
            </p>
          </div>
          <div className="bg-muted/40 p-3 rounded-lg border">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Total Amount</p>
            <p className="text-base sm:text-lg font-bold text-foreground mt-0.5">
              {formatINR(calculations.totalPayable)}
            </p>
          </div>
        </div>

        {/* Schedule Table */}
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

        <div className="flex justify-end pt-4 border-t mt-2">
          <Button onClick={onClose}>Close Schedule</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
