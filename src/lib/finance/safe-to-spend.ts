import { Decimal } from 'decimal.js';

export interface SafeToSpendInput {
  liquidCash: number;         // Total available in liquid accounts (authoritative current_balance)
  upcomingCommitted: number;  // Sum of upcoming recurring outgoing obligations
  plannedSavings: number;     // Planned savings deductions this month
  hasAccounts: boolean;       // Whether the user has at least one account — determines estimated state
}

export interface SafeToSpendBreakdown {
  available: number;
  upcomingCommitted: number;
  plannedSavings: number;
  safeToSpend: number;
  isUnavailable: boolean;      // true only when there are no accounts yet
  missingInputs: string[];
  lines: Array<{
    label: string;
    amount: number;
    type: 'actual' | 'planned' | 'none';
  }>;
}

/**
 * Calculate safe-to-spend amount.
 *
 * Formula: max(0, liquidCash − upcomingCommitted − plannedSavings)
 *
 * Rules:
 * - Decimal.js used for all arithmetic — no floating-point drift
 * - isUnavailable is true ONLY when no accounts exist (liquidCash=0 with accounts is legitimate)
 * - Does not double-count transfers (caller must pass net liquid cash, not gross)
 * - Does not factor in investments, loans, or savings balances (not liquid)
 * - Never produces a negative result — floored at zero
 */
export function calculateSafeToSpend(input: SafeToSpendInput): SafeToSpendBreakdown {
  const { liquidCash, upcomingCommitted, plannedSavings, hasAccounts } = input;

  const isUnavailable = !hasAccounts;
  const missingInputs: string[] = [];

  if (isUnavailable) {
    missingInputs.push('No accounts added yet');
  }

  const liquidDecimal    = new Decimal(liquidCash    || 0);
  const committedDecimal = new Decimal(upcomingCommitted || 0);
  const savingsDecimal   = new Decimal(plannedSavings || 0);

  const safeDecimal = Decimal.max(
    0,
    liquidDecimal.minus(committedDecimal).minus(savingsDecimal)
  );

  const lines: Array<{ label: string; amount: number; type: 'actual' | 'planned' | 'none' }> = [
    {
      label: 'Available Cash',
      amount: liquidDecimal.toNumber(),
      type: 'actual',
    },
    {
      label: 'Upcoming Commitments',
      amount: committedDecimal.toNumber(),
      type: committedDecimal.isZero() ? 'none' : 'planned',
    },
    {
      label: 'Planned Savings',
      amount: savingsDecimal.toNumber(),
      type: savingsDecimal.isZero() ? 'none' : 'planned',
    },
  ];

  return {
    available:        liquidDecimal.toNumber(),
    upcomingCommitted: committedDecimal.toNumber(),
    plannedSavings:   savingsDecimal.toNumber(),
    safeToSpend:      safeDecimal.toNumber(),
    isUnavailable,
    missingInputs,
    lines,
  };
}
