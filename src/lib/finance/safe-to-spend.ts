import { Decimal } from 'decimal.js';

export interface SafeToSpendInput {
  liquidCash: number; // Total available in liquid accounts
  upcomingCommitted: number; // Sum of upcoming recurring expenses
  plannedSavings: number; // Monthly savings goal contributions
  todaySpent: number; // Already spent today
}

export interface SafeToSpendBreakdown {
  available: number;
  upcomingCommitted: number;
  plannedSavings: number;
  safeToSpend: number;
  isEstimated: boolean; // true if critical inputs are missing
  missingInputs: string[]; // What data is missing
  lines: Array<{
    label: string;
    amount: number;
    type: 'actual' | 'planned' | 'estimated';
  }>;
}

export function calculateSafeToSpend(input: SafeToSpendInput): SafeToSpendBreakdown {
  const { liquidCash, upcomingCommitted, plannedSavings, todaySpent } = input;
  
  const isEstimated = liquidCash === 0;
  const missingInputs: string[] = [];
  
  if (isEstimated) {
    missingInputs.push('No accounts added yet');
  }
  
  const liquidDecimal = new Decimal(liquidCash || 0);
  const committedDecimal = new Decimal(upcomingCommitted || 0);
  const savingsDecimal = new Decimal(plannedSavings || 0);
  
  const safeDecimal = Decimal.max(0, liquidDecimal.minus(committedDecimal).minus(savingsDecimal));

  const lines: Array<{ label: string; amount: number; type: 'actual' | 'planned' | 'estimated' }> = [
    {
      label: 'Available Cash',
      amount: liquidDecimal.toNumber(),
      type: (isEstimated ? 'estimated' : 'actual') as 'actual' | 'estimated',
    },
    {
      label: 'Upcoming Commitments',
      amount: committedDecimal.toNumber(),
      type: (upcomingCommitted === 0 ? 'estimated' : 'planned') as 'planned' | 'estimated',
    },
    {
      label: 'Planned Savings',
      amount: savingsDecimal.toNumber(),
      type: (plannedSavings === 0 ? 'estimated' : 'planned') as 'planned' | 'estimated',
    }
  ];

  return {
    available: liquidDecimal.toNumber(),
    upcomingCommitted: committedDecimal.toNumber(),
    plannedSavings: savingsDecimal.toNumber(),
    safeToSpend: safeDecimal.toNumber(),
    isEstimated,
    missingInputs,
    lines,
  };
}
