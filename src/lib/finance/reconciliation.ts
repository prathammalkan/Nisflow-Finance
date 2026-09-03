import Decimal from 'decimal.js';
import { differenceInCalendarDays, parseISO } from 'date-fns';

export interface BankStatementTransaction {
  id: string;
  statement_id?: string;
  date: string;
  description: string;
  amount: number;
  direction: 'in' | 'out';
  balance?: number | null;
  reference?: string | null;
  is_matched?: boolean;
  matched_transaction_id?: string | null;
}

export interface LedgerTransaction {
  id: string;
  account_id: string;
  date: string;
  description?: string | null;
  amount: number;
  direction: 'in' | 'out';
  status?: string;
  reconciliation_status?: string;
  upi_reference?: string | null;
  bank_reference?: string | null;
}

export interface MatchedPair {
  bankTx: BankStatementTransaction;
  ledgerTx: LedgerTransaction;
  matchType: 'exact_ref' | 'exact_date_amount' | 'date_tolerance_match';
}

export interface ReconciliationMatchResult {
  matched: MatchedPair[];
  missingFromLedger: BankStatementTransaction[];
  missingFromBank: LedgerTransaction[];
  needsReview: {
    bankTx: BankStatementTransaction;
    possibleLedgerTxs: LedgerTransaction[];
  }[];
}

/**
 * Performs deterministic matching between bank statement transactions and ledger transactions.
 * Strict financial rules:
 * 1. Exact amount equality (Decimal.eq).
 * 2. Direction equality ('in' === 'in', 'out' === 'out').
 * 3. Date tolerance within ±3 calendar days.
 * 4. Reference match prioritised.
 * 5. Ambiguous candidates (multiple ledger transactions with identical amount within tolerance)
 *    are classified into `needsReview` and NEVER automatically matched.
 */
export function matchBankTransactions(
  bankTransactions: BankStatementTransaction[],
  ledgerTransactions: LedgerTransaction[],
  dateToleranceDays: number = 3
): ReconciliationMatchResult {
  const matched: MatchedPair[] = [];
  const needsReview: { bankTx: BankStatementTransaction; possibleLedgerTxs: LedgerTransaction[] }[] = [];
  const matchedLedgerIds = new Set<string>();
  const matchedBankIds = new Set<string>();

  // Filter only un-reconciled items for matching
  const availableLedger = ledgerTransactions.filter(
    (tx) => tx.reconciliation_status !== 'reconciled'
  );
  const availableBank = bankTransactions.filter(
    (tx) => !tx.is_matched
  );

  // PASS 1: Exact Reference Match (Highest confidence)
  for (const bTx of availableBank) {
    if (matchedBankIds.has(bTx.id)) continue;
    const bRef = (bTx.reference || '').trim().toLowerCase();
    const bDesc = (bTx.description || '').trim().toLowerCase();

    if (!bRef && !bDesc) continue;

    const candidate = availableLedger.find((lTx) => {
      if (matchedLedgerIds.has(lTx.id)) return false;

      // Must match exact amount and direction
      if (!new Decimal(bTx.amount).equals(new Decimal(lTx.amount))) return false;
      if (bTx.direction !== lTx.direction) return false;

      // Check if reference exists in ledger upi_reference or bank_reference
      const lRef = (lTx.upi_reference || lTx.bank_reference || '').trim().toLowerCase();
      if (bRef && lRef && (bRef === lRef || bRef.includes(lRef) || lRef.includes(bRef))) {
        return true;
      }

      // Check if exact reference appears in description
      if (bRef && lTx.description && lTx.description.toLowerCase().includes(bRef)) {
        return true;
      }

      return false;
    });

    if (candidate) {
      matched.push({
        bankTx: bTx,
        ledgerTx: candidate,
        matchType: 'exact_ref',
      });
      matchedBankIds.add(bTx.id);
      matchedLedgerIds.add(candidate.id);
    }
  }

  // PASS 2: Exact Date & Exact Amount (1-to-1 unique match)
  for (const bTx of availableBank) {
    if (matchedBankIds.has(bTx.id)) continue;

    const bDate = parseISO(bTx.date.split('T')[0]);
    const bAmount = new Decimal(bTx.amount);

    const candidates = availableLedger.filter((lTx) => {
      if (matchedLedgerIds.has(lTx.id)) return false;
      if (!bAmount.equals(new Decimal(lTx.amount))) return false;
      if (bTx.direction !== lTx.direction) return false;

      const lDate = parseISO(lTx.date.split('T')[0]);
      return differenceInCalendarDays(bDate, lDate) === 0;
    });

    if (candidates.length === 1) {
      const candidate = candidates[0];
      matched.push({
        bankTx: bTx,
        ledgerTx: candidate,
        matchType: 'exact_date_amount',
      });
      matchedBankIds.add(bTx.id);
      matchedLedgerIds.add(candidate.id);
    } else if (candidates.length > 1) {
      needsReview.push({
        bankTx: bTx,
        possibleLedgerTxs: candidates,
      });
      matchedBankIds.add(bTx.id); // marked as in-review so it doesn't fall through to missing
    }
  }

  // PASS 3: Date Tolerance Match (±N days, strictly unique 1-to-1 candidate)
  for (const bTx of availableBank) {
    if (matchedBankIds.has(bTx.id)) continue;

    const bDate = parseISO(bTx.date.split('T')[0]);
    const bAmount = new Decimal(bTx.amount);

    const candidates = availableLedger.filter((lTx) => {
      if (matchedLedgerIds.has(lTx.id)) return false;
      if (!bAmount.equals(new Decimal(lTx.amount))) return false;
      if (bTx.direction !== lTx.direction) return false;

      const lDate = parseISO(lTx.date.split('T')[0]);
      const diff = Math.abs(differenceInCalendarDays(bDate, lDate));
      return diff <= dateToleranceDays;
    });

    if (candidates.length === 1) {
      const candidate = candidates[0];
      matched.push({
        bankTx: bTx,
        ledgerTx: candidate,
        matchType: 'date_tolerance_match',
      });
      matchedBankIds.add(bTx.id);
      matchedLedgerIds.add(candidate.id);
    } else if (candidates.length > 1) {
      needsReview.push({
        bankTx: bTx,
        possibleLedgerTxs: candidates,
      });
      matchedBankIds.add(bTx.id);
    }
  }

  // Identify Missing items
  const missingFromLedger = availableBank.filter((bTx) => !matchedBankIds.has(bTx.id));
  const missingFromBank = availableLedger.filter((lTx) => !matchedLedgerIds.has(lTx.id));

  return {
    matched,
    missingFromLedger,
    missingFromBank,
    needsReview,
  };
}
