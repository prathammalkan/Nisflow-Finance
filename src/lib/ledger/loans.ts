import { Decimal } from 'decimal.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.ts';
import { ensureLedgerAccount, recordFinancialTransaction, reverseFinancialTransaction } from './service.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface LoanAuthoritativeBalance {
  loanId: string;
  loanName: string;
  outstandingPrincipal: Decimal;
  totalPrincipalPaid: Decimal;
  totalInterestPaid: Decimal;
  originalDisbursed: Decimal;
  isSettled: boolean;
  ledgerAccountId: string;
  interestExpenseAccountId: string;
}

export interface LoanLedgerSummaryItem {
  id: string;
  name: string;
  loanType: string;
  lenderName: string;
  principalAmount: number;
  authoritativeRemainingPrincipal: number;
  interestRate: number;
  tenureMonths: number;
  startDate: string;
  totalInterestPaid: number;
  totalPrincipalPaid: number;
  isSettled: boolean;
  status: string;
}

export interface LoansAuthoritativeSummary {
  totalOutstandingPrincipal: number;
  totalInterestPaid: number;
  activeLoansCount: number;
  settledLoansCount: number;
  loans: LoanLedgerSummaryItem[];
}

export interface LoanHistoryItem {
  id: string;
  journalEntryId: string;
  date: string;
  type: 'disbursement' | 'emi_payment' | 'reversal' | 'other';
  description: string;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  sourceType: string;
  idempotencyKey: string;
  status: string;
}

export interface RecordLoanDisbursementParams {
  userId: string;
  loanId: string;
  loanName?: string;
  accountId: string;
  amount: number | string;
  date?: string;
  description?: string;
  notes?: string | null;
  idempotencyKey?: string;
}

export interface RecordLoanEMIParams {
  userId: string;
  loanId: string;
  loanName?: string;
  accountId: string;
  principalAmount: number | string;
  interestAmount: number | string;
  totalAmount?: number | string;
  date?: string;
  description?: string;
  notes?: string | null;
  idempotencyKey?: string;
}

/**
 * Ensures the liability account (LIA-LOAN-<id>) and interest expense account (EXP-LOAN-INT-<id>) exist.
 * Enforces tenant ownership before provisioning.
 */
export async function ensureLoanLedgerAccounts(
  supabase: SupabaseClient<Database>,
  userId: string,
  loanId: string,
  loanName?: string
): Promise<{ loanLedgerAccId: string; interestExpenseAccId: string }> {
  // 1. Verify tenant ownership if loan exists in database
  const { data: loan, error: loanErr } = await (supabase.from('loans') as any)
    .select('id, user_id, name')
    .eq('id', loanId)
    .maybeSingle();

  if (loan && loan.user_id !== userId) {
    throw new Error('Security Violation: Unauthorized access to loan of another user.');
  }

  const nameToUse = loan?.name || loanName || `Loan ${loanId}`;

  // 2. Ensure Liability Account (LIA-LOAN-<loanId>)
  const loanLedgerAccId = await ensureLedgerAccount(supabase, userId, {
    code: `LIA-LOAN-${loanId}`,
    name: `Loan Liability: ${nameToUse}`,
    accountType: 'liability',
    entityType: 'loan',
    entityId: loanId,
  });

  // 3. Ensure Interest Expense Account (EXP-LOAN-INT-<loanId>)
  const interestExpenseAccId = await ensureLedgerAccount(supabase, userId, {
    code: `EXP-LOAN-INT-${loanId}`,
    name: `Loan Interest: ${nameToUse}`,
    accountType: 'expense',
    entityType: 'loan_interest',
    entityId: loanId,
  });

  return { loanLedgerAccId, interestExpenseAccId };
}

/**
 * Calculates the authoritative outstanding balance and interest paid for a loan
 * exclusively from posted double-entry journal lines.
 */
export async function getLoanAuthoritativeBalance(
  supabase: SupabaseClient<Database>,
  userId: string,
  loanId: string
): Promise<LoanAuthoritativeBalance> {
  const { data: loan } = await (supabase.from('loans') as any)
    .select('id, user_id, name, principal_amount')
    .eq('id', loanId)
    .maybeSingle();

  if (loan && loan.user_id !== userId) {
    throw new Error('Security Violation: Unauthorized access to loan balance of another user.');
  }

  const loanName = loan?.name || `Loan ${loanId}`;
  const { loanLedgerAccId, interestExpenseAccId } = await ensureLoanLedgerAccounts(
    supabase,
    userId,
    loanId,
    loanName
  );

  // Fetch all posted lines for the loan liability and interest expense accounts
  const { data: lines, error: linesError } = await (supabase.from('journal_lines') as any)
    .select(`
      id,
      ledger_account_id,
      debit_amount,
      credit_amount,
      journal_entries!inner (
        id,
        status,
        user_id
      )
    `)
    .in('ledger_account_id', [loanLedgerAccId, interestExpenseAccId])
    .eq('user_id', userId)
    .eq('journal_entries.status', 'posted');

  if (linesError) {
    throw new Error(`Failed to calculate loan authoritative balance: ${linesError.message}`);
  }

  let totalPrincipalCredits = new Decimal(0); // Disbursements / Increases
  let totalPrincipalDebits = new Decimal(0);  // Principal Repayments
  let totalInterestDebits = new Decimal(0);   // Interest Expense
  let totalInterestCredits = new Decimal(0);

  for (const line of lines || []) {
    if (line.ledger_account_id === loanLedgerAccId) {
      totalPrincipalCredits = totalPrincipalCredits.plus(new Decimal(line.credit_amount || 0));
      totalPrincipalDebits = totalPrincipalDebits.plus(new Decimal(line.debit_amount || 0));
    } else if (line.ledger_account_id === interestExpenseAccId) {
      totalInterestDebits = totalInterestDebits.plus(new Decimal(line.debit_amount || 0));
      totalInterestCredits = totalInterestCredits.plus(new Decimal(line.credit_amount || 0));
    }
  }

  // Outstanding Principal = Credits - Debits on Liability Account
  const outstandingPrincipal = totalPrincipalCredits.minus(totalPrincipalDebits);
  const totalInterestPaid = totalInterestDebits.minus(totalInterestCredits);
  const isSettled = outstandingPrincipal.lte(0);

  return {
    loanId,
    loanName,
    outstandingPrincipal: Decimal.max(0, outstandingPrincipal),
    totalPrincipalPaid: totalPrincipalDebits,
    totalInterestPaid: Decimal.max(0, totalInterestPaid),
    originalDisbursed: totalPrincipalCredits,
    isSettled,
    ledgerAccountId: loanLedgerAccId,
    interestExpenseAccountId: interestExpenseAccId,
  };
}

/**
 * Computes authoritative summary for all loans belonging to a user.
 */
export async function getLoansAuthoritativeSummary(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<LoansAuthoritativeSummary> {
  const { data: loans, error: loansErr } = await (supabase.from('loans') as any)
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: false });

  if (loansErr) {
    throw new Error(`Failed to fetch loans: ${loansErr.message}`);
  }

  let totalOutstanding = new Decimal(0);
  let totalInterest = new Decimal(0);
  let activeCount = 0;
  let settledCount = 0;

  const items: LoanLedgerSummaryItem[] = [];

  for (const l of loans || []) {
    if (l.status === 'deleted' || l.is_deleted === true) {
      continue;
    }
    const balance = await getLoanAuthoritativeBalance(supabase, userId, l.id);

    const outstandingNum = balance.outstandingPrincipal.toNumber();
    const interestPaidNum = balance.totalInterestPaid.toNumber();
    const principalPaidNum = balance.totalPrincipalPaid.toNumber();

    totalOutstanding = totalOutstanding.plus(balance.outstandingPrincipal);
    totalInterest = totalInterest.plus(balance.totalInterestPaid);

    if (balance.isSettled) {
      settledCount++;
    } else {
      activeCount++;
    }

    items.push({
      id: l.id,
      name: l.name,
      loanType: l.loan_type || 'personal',
      lenderName: l.lender_name || 'Lender',
      principalAmount: Number(l.principal_amount || balance.originalDisbursed.toNumber()),
      authoritativeRemainingPrincipal: outstandingNum,
      interestRate: Number(l.interest_rate || 0),
      tenureMonths: Number(l.tenure_months || 0),
      startDate: l.start_date,
      totalInterestPaid: interestPaidNum,
      totalPrincipalPaid: principalPaidNum,
      isSettled: balance.isSettled,
      status: balance.isSettled ? 'settled' : (l.status || 'active'),
    });
  }

  return {
    totalOutstandingPrincipal: totalOutstanding.toNumber(),
    totalInterestPaid: totalInterest.toNumber(),
    activeLoansCount: activeCount,
    settledLoansCount: settledCount,
    loans: items,
  };
}

/**
 * Returns chronological ledger history for a loan.
 */
export async function getLoanLedgerHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
  loanId: string
): Promise<LoanHistoryItem[]> {
  const { loanLedgerAccId, interestExpenseAccId } = await ensureLoanLedgerAccounts(
    supabase,
    userId,
    loanId
  );

  const { data: lines, error } = await (supabase.from('journal_lines') as any)
    .select(`
      id,
      debit_amount,
      credit_amount,
      memo,
      ledger_account_id,
      journal_entries!inner (
        id,
        entry_number,
        transaction_date,
        description,
        source_type,
        idempotency_key,
        status,
        user_id
      )
    `)
    .in('ledger_account_id', [loanLedgerAccId, interestExpenseAccId])
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch loan ledger history: ${error.message}`);
  }

  // Group lines by journal entry to assemble compound EMI payments
  const entryMap = new Map<string, {
    journalEntryId: string;
    date: string;
    description: string;
    sourceType: string;
    idempotencyKey: string;
    status: string;
    principalAmount: Decimal;
    interestAmount: Decimal;
    totalAmount: Decimal;
    type: LoanHistoryItem['type'];
  }>();

  for (const line of lines || []) {
    const entry = line.journal_entries;
    const entryId = entry.id;

    if (!entryMap.has(entryId)) {
      let eventType: LoanHistoryItem['type'] = 'other';
      if (entry.status === 'reversed') {
        eventType = 'reversal';
      } else if (entry.source_type === 'loan_disbursement' || (line.ledger_account_id === loanLedgerAccId && Number(line.credit_amount) > 0)) {
        eventType = 'disbursement';
      } else if (entry.source_type === 'loan_emi' || (line.ledger_account_id === loanLedgerAccId && Number(line.debit_amount) > 0)) {
        eventType = 'emi_payment';
      }

      entryMap.set(entryId, {
        journalEntryId: entryId,
        date: entry.transaction_date,
        description: entry.description,
        sourceType: entry.source_type,
        idempotencyKey: entry.idempotency_key,
        status: entry.status,
        principalAmount: new Decimal(0),
        interestAmount: new Decimal(0),
        totalAmount: new Decimal(0),
        type: eventType,
      });
    }

    const current = entryMap.get(entryId)!;
    if (line.ledger_account_id === loanLedgerAccId) {
      if (Number(line.debit_amount) > 0) {
        current.principalAmount = current.principalAmount.plus(new Decimal(line.debit_amount));
      } else if (Number(line.credit_amount) > 0) {
        current.principalAmount = current.principalAmount.plus(new Decimal(line.credit_amount));
      }
    } else if (line.ledger_account_id === interestExpenseAccId) {
      current.interestAmount = current.interestAmount.plus(new Decimal(line.debit_amount));
    }
  }

  const history: LoanHistoryItem[] = [];
  for (const [id, item] of entryMap.entries()) {
    item.totalAmount = item.principalAmount.plus(item.interestAmount);
    history.push({
      id,
      journalEntryId: item.journalEntryId,
      date: item.date,
      type: item.type,
      description: item.description,
      principalAmount: item.principalAmount.toNumber(),
      interestAmount: item.interestAmount.toNumber(),
      totalAmount: item.totalAmount.toNumber(),
      sourceType: item.sourceType,
      idempotencyKey: item.idempotencyKey,
      status: item.status,
    });
  }

  // Sort descending by date
  return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Records an authoritative loan disbursement in the double-entry ledger.
 * Dr Asset:Bank, Cr Liability:Loan
 * Idempotency Key: LOAN:DISBURSE:<loanId>
 */
export async function recordLoanDisbursement(
  supabase: SupabaseClient<Database>,
  params: RecordLoanDisbursementParams
) {
  const decAmount = new Decimal(params.amount);
  if (decAmount.lte(0)) {
    throw new Error('Loan disbursement amount must be strictly greater than ₹0.00');
  }

  // 1. Ensure loan ledger accounts exist
  await ensureLoanLedgerAccounts(
    supabase,
    params.userId,
    params.loanId,
    params.loanName
  );

  const idempotencyKey = params.idempotencyKey || `LOAN:DISBURSE:${params.loanId}`;
  const txnDate = params.date || new Date().toISOString().split('T')[0];

  // 2. Post to authoritative ledger
  const ledgerResult = await recordFinancialTransaction(supabase, {
    userId: params.userId,
    type: 'loan_disbursement',
    accountId: params.accountId,
    amount: decAmount.toFixed(2),
    date: txnDate,
    description: params.description || `Loan Disbursement: ${params.loanName || params.loanId}`,
    notes: params.notes,
    idempotencyKey,
    sourceType: 'loan_disbursement',
    sourceId: params.loanId,
    metadata: {
      loanId: params.loanId,
      loanName: params.loanName,
    },
  });

  if (!ledgerResult.success) {
    throw new Error(ledgerResult.error || 'Failed to post loan disbursement to ledger');
  }

  // 3. Downstream projection: sync legacy loans table
  try {
    await (supabase.from('loans') as any).update({
      remaining_principal: decAmount.toNumber(),
      status: 'active',
      updated_at: new Date().toISOString(),
    }).eq('id', params.loanId);
  } catch (projErr) {
    console.warn('Downstream loan projection sync failed (non-authoritative):', projErr);
  }

  return {
    success: true,
    journalEntryId: ledgerResult.journalEntryId,
    disbursedAmount: decAmount.toNumber(),
  };
}

/**
 * Records an authoritative loan EMI payment in the double-entry ledger.
 * Dr Liability:Loan (Principal)
 * Dr Expense:LoanInterest (Interest)
 * Cr Asset:Bank (Total EMI)
 * Idempotency Key: LOAN:EMI:<loanId>:<date>
 */
export async function recordLoanEMI(
  supabase: SupabaseClient<Database>,
  params: RecordLoanEMIParams
) {
  const principalDec = new Decimal(params.principalAmount || 0);
  const interestDec = new Decimal(params.interestAmount || 0);
  const totalDec = params.totalAmount !== undefined
    ? new Decimal(params.totalAmount)
    : principalDec.plus(interestDec);

  if (totalDec.lte(0)) {
    throw new Error('EMI total amount must be strictly greater than ₹0.00');
  }

  if (principalDec.lt(0) || interestDec.lt(0)) {
    throw new Error('Principal and interest amounts cannot be negative');
  }

  if (!principalDec.plus(interestDec).equals(totalDec)) {
    throw new Error(
      `Mathematical Mismatch: Principal (₹${principalDec.toFixed(2)}) + Interest (₹${interestDec.toFixed(2)}) must equal Total EMI (₹${totalDec.toFixed(2)}) exactly.`
    );
  }

  // 1. Authoritative Overpayment Check
  const currentBalance = await getLoanAuthoritativeBalance(supabase, params.userId, params.loanId);

  if (principalDec.gt(currentBalance.outstandingPrincipal)) {
    throw new Error(
      `Overpayment Error: Principal payment of ₹${principalDec.toFixed(2)} exceeds current outstanding loan principal of ₹${currentBalance.outstandingPrincipal.toFixed(2)}.`
    );
  }

  const txnDate = params.date || new Date().toISOString().split('T')[0];
  const idempotencyKey = params.idempotencyKey || `LOAN:EMI:${params.loanId}:${txnDate}`;

  // 2. Post compound entry to double-entry ledger
  const ledgerResult = await recordFinancialTransaction(supabase, {
    userId: params.userId,
    type: 'loan_emi',
    accountId: params.accountId,
    amount: totalDec.toFixed(2),
    principalAmount: principalDec.toFixed(2),
    interestAmount: interestDec.toFixed(2),
    date: txnDate,
    description: params.description || `Loan EMI: ${params.loanName || currentBalance.loanName}`,
    notes: params.notes,
    idempotencyKey,
    sourceType: 'loan_emi',
    sourceId: params.loanId,
    metadata: {
      loanId: params.loanId,
      principalAmount: principalDec.toFixed(2),
      interestAmount: interestDec.toFixed(2),
      totalAmount: totalDec.toFixed(2),
    },
  });

  if (!ledgerResult.success) {
    throw new Error(ledgerResult.error || 'Failed to post loan EMI to authoritative ledger');
  }

  // 3. Downstream projection: sync legacy loans table
  const newRemainingPrincipal = Decimal.max(0, currentBalance.outstandingPrincipal.minus(principalDec));
  try {
    await (supabase.from('loans') as any).update({
      remaining_principal: newRemainingPrincipal.toNumber(),
      status: newRemainingPrincipal.isZero() ? 'settled' : 'active',
      updated_at: new Date().toISOString(),
    }).eq('id', params.loanId);
  } catch (projErr) {
    console.warn('Downstream loan projection sync failed (non-authoritative):', projErr);
  }

  return {
    success: true,
    journalEntryId: ledgerResult.journalEntryId,
    principalPaid: principalDec.toNumber(),
    interestPaid: interestDec.toNumber(),
    totalPaid: totalDec.toNumber(),
    newRemainingPrincipal: newRemainingPrincipal.toNumber(),
    isSettled: newRemainingPrincipal.isZero(),
  };
}

/**
 * Authoritatively deletes / archives a loan by reversing all associated posted journal entries
 * in the double-entry ledger before archiving the legacy metadata record.
 */
export async function deleteLoanAuthoritative(
  supabase: SupabaseClient<Database>,
  userId: string,
  loanId: string
): Promise<{ success: boolean; loanId: string; reversedEntryCount: number; reversedEntryIds: string[]; error?: string }> {
  if (!userId || !loanId) {
    return { success: false, loanId, reversedEntryCount: 0, reversedEntryIds: [], error: 'User ID and Loan ID are required for deletion' };
  }

  // 1. Verify tenant ownership
  const { data: loan, error: loanErr } = await (supabase.from('loans') as any)
    .select('id, user_id, name')
    .eq('id', loanId)
    .maybeSingle();

  if (loanErr || !loan) {
    return { success: false, loanId, reversedEntryCount: 0, reversedEntryIds: [], error: 'Loan not found or access unauthorized' };
  }

  if (loan.user_id !== userId) {
    return { success: false, loanId, reversedEntryCount: 0, reversedEntryIds: [], error: 'Security Violation: Unauthorized attempt to delete another user\'s loan.' };
  }

  // 2. Fetch history of all journal entries for this loan
  const history = await getLoanLedgerHistory(supabase, userId, loanId);
  const postedEntries = history.filter((item) => item.status === 'posted');

  const reversedEntryIds: string[] = [];

  // 3. Post authoritative reversals for all active posted entries
  for (const entry of postedEntries) {
    const revResult = await reverseFinancialTransaction(supabase, {
      userId,
      journalEntryId: entry.journalEntryId,
      reason: `Authoritative reversal upon loan deletion (${loan.name || loanId})`,
      idempotencyKey: `REV:LOAN:DEL:${loanId}:${entry.journalEntryId}`,
    });

    if (revResult.success && revResult.reversalEntryId) {
      reversedEntryIds.push(revResult.reversalEntryId);
    } else {
      console.warn(`Failed to reverse loan entry ${entry.journalEntryId}:`, revResult.error);
    }
  }

  // 4. Update legacy projection status to deleted
  await (supabase.from('loans') as any)
    .update({
      status: 'deleted',
      is_deleted: true,
      remaining_principal: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', loanId)
    .eq('user_id', userId);

  return {
    success: true,
    loanId,
    reversedEntryCount: reversedEntryIds.length,
    reversedEntryIds,
  };
}

