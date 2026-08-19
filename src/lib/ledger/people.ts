import { Decimal } from 'decimal.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.ts';
import { recordFinancialTransaction, ensureLedgerAccount } from './service.ts';

// Exact decimal configuration for zero-tolerance paise precision
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface CounterpartyBalances {
  counterpartyId: string;
  name: string;
  receivableBalance: number; // Amount they owe user
  payableBalance: number;    // Amount user owes them
  netBalance: number;        // Positive: they owe user; Negative: user owes them; Zero: settled
  direction: 'THEY_OWE_YOU' | 'YOU_OWE_THEM' | 'SETTLED';
  totalLent: number;
  totalReceived: number;
  totalBorrowed: number;
  totalRepaid: number;
  receivableAccountId?: string;
  payableAccountId?: string;
}

export interface PeopleAuthoritativeSummary {
  totalReceivable: number;
  totalPayable: number;
  netPosition: number;
  peopleCount: number;
  balances: Record<string, CounterpartyBalances>;
}

export interface PersonLedgerHistoryItem {
  id: string;
  journalEntryId: string;
  transactionDate: string;
  description: string;
  moneyLent: number;
  moneyReceived: number;
  moneyBorrowed: number;
  moneyRepaid: number;
  runningReceivableBalance: number;
  runningPayableBalance: number;
  runningNetBalance: number;
  direction: 'THEY_OWE_YOU' | 'YOU_OWE_THEM' | 'SETTLED';
  idempotencyKey: string;
  status: 'posted' | 'reversed';
  createdAt: string;
}

export interface RecordLendingInput {
  userId: string;
  counterpartyId: string;
  accountId: string;
  amount: number | string;
  date?: string;
  description?: string;
  notes?: string | null;
  receivableId?: string;
}

export interface RecordBorrowingInput {
  userId: string;
  counterpartyId: string;
  accountId: string;
  amount: number | string;
  date?: string;
  description?: string;
  notes?: string | null;
  payableId?: string;
}

export interface RecordRepaymentInput {
  userId: string;
  counterpartyId: string;
  accountId: string;
  amount: number | string;
  direction: 'in' | 'out'; // 'in' = person pays user; 'out' = user pays person
  date?: string;
  description?: string;
  notes?: string | null;
  repaymentId?: string;
}

/**
 * Concurrency-safe helper to ensure receivable & payable ledger accounts
 * exist for an authenticated user's counterparty.
 * Strictly enforces (user_id, counterparty_id) tenant isolation.
 */
export async function ensureCounterpartyLedgerAccounts(
  supabase: SupabaseClient<Database>,
  userId: string,
  counterpartyId: string
): Promise<{ receivableAccountId: string; payableAccountId: string }> {
  if (!userId || !counterpartyId) {
    throw new Error('User ID and Counterparty ID are required for ledger account provisioning.');
  }

  // 1. Verify counterparty ownership & tenant isolation
  const { data: counterparty, error: cpErr } = await (supabase.from('counterparties') as any)
    .select('id, name, user_id')
    .eq('id', counterpartyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (cpErr || !counterparty) {
    throw new Error(`Security Violation: Counterparty ${counterpartyId} not found or unauthorized for user.`);
  }

  const cpName = counterparty.name || `Counterparty ${counterpartyId}`;

  // 2. Concurrency-safe provision Receivable account (Asset)
  const receivableAccountId = await ensureLedgerAccount(supabase, userId, {
    code: `AST-REC-${counterpartyId}`,
    name: `Receivable: ${cpName}`,
    accountType: 'asset',
    entityType: 'counterparty_receivable',
    entityId: counterpartyId,
  });

  // 3. Concurrency-safe provision Payable account (Liability)
  const payableAccountId = await ensureLedgerAccount(supabase, userId, {
    code: `LIA-PAY-${counterpartyId}`,
    name: `Payable: ${cpName}`,
    accountType: 'liability',
    entityType: 'counterparty_payable',
    entityId: counterpartyId,
  });

  return { receivableAccountId, payableAccountId };
}

/**
 * Derives the single authoritative balance for a counterparty directly from posted journal lines.
 * Excludes reversed entries and avoids all legacy monetary fields.
 */
export async function getCounterpartyAuthoritativeBalance(
  supabase: SupabaseClient<Database>,
  userId: string,
  counterpartyId: string
): Promise<CounterpartyBalances> {
  // 1. Verify ownership & ensure ledger accounts
  const { receivableAccountId, payableAccountId } = await ensureCounterpartyLedgerAccounts(
    supabase,
    userId,
    counterpartyId
  );

  const { data: counterparty } = await (supabase.from('counterparties') as any)
    .select('name')
    .eq('id', counterpartyId)
    .eq('user_id', userId)
    .single();

  const name = counterparty?.name || 'Unknown Person';

  // 2. Query journal lines for both accounts
  const { data: lines, error: linesErr } = await (supabase.from('journal_lines') as any)
    .select(`
      ledger_account_id,
      debit_amount,
      credit_amount,
      journal_entries (
        id,
        status
      )
    `)
    .eq('user_id', userId)
    .in('ledger_account_id', [receivableAccountId, payableAccountId]);

  if (linesErr) {
    throw new Error(`Failed to derive counterparty balance from ledger: ${linesErr.message}`);
  }

  let totalRecDebits = new Decimal(0);
  let totalRecCredits = new Decimal(0);
  let totalPayDebits = new Decimal(0);
  let totalPayCredits = new Decimal(0);

  for (const line of lines || []) {
    const entryStatus = line.journal_entries?.status || 'posted';
    if (entryStatus !== 'posted') {
      continue; // Exclude reversed entries from balance
    }

    const d = new Decimal(line.debit_amount || 0);
    const c = new Decimal(line.credit_amount || 0);

    if (line.ledger_account_id === receivableAccountId) {
      totalRecDebits = totalRecDebits.plus(d);
      totalRecCredits = totalRecCredits.plus(c);
    } else if (line.ledger_account_id === payableAccountId) {
      totalPayDebits = totalPayDebits.plus(d);
      totalPayCredits = totalPayCredits.plus(c);
    }
  }

  // Asset (Receivable): Balance = Debits - Credits
  const recBalance = Decimal.max(0, totalRecDebits.minus(totalRecCredits));
  // Liability (Payable): Balance = Credits - Debits
  const payBalance = Decimal.max(0, totalPayCredits.minus(totalPayDebits));

  const netBalance = recBalance.minus(payBalance);

  let direction: 'THEY_OWE_YOU' | 'YOU_OWE_THEM' | 'SETTLED' = 'SETTLED';
  if (netBalance.gt(0)) {
    direction = 'THEY_OWE_YOU';
  } else if (netBalance.lt(0)) {
    direction = 'YOU_OWE_THEM';
  }

  return {
    counterpartyId,
    name,
    receivableBalance: recBalance.toNumber(),
    payableBalance: payBalance.toNumber(),
    netBalance: netBalance.toNumber(),
    direction,
    totalLent: totalRecDebits.toNumber(),
    totalReceived: totalRecCredits.toNumber(),
    totalBorrowed: totalPayCredits.toNumber(),
    totalRepaid: totalPayDebits.toNumber(),
    receivableAccountId,
    payableAccountId,
  };
}

/**
 * Derives authoritative People Ledger totals across all counterparties for a user.
 */
export async function getPeopleAuthoritativeSummary(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<PeopleAuthoritativeSummary> {
  const { data: counterparties, error: cpErr } = await (supabase.from('counterparties') as any)
    .select('id, name')
    .eq('user_id', userId);

  if (cpErr) {
    throw new Error(`Failed to load counterparties: ${cpErr.message}`);
  }

  const balances: Record<string, CounterpartyBalances> = {};
  let totalReceivable = new Decimal(0);
  let totalPayable = new Decimal(0);

  for (const cp of counterparties || []) {
    const bal = await getCounterpartyAuthoritativeBalance(supabase, userId, cp.id);
    balances[cp.id] = bal;
    totalReceivable = totalReceivable.plus(bal.receivableBalance);
    totalPayable = totalPayable.plus(bal.payableBalance);
  }

  return {
    totalReceivable: totalReceivable.toNumber(),
    totalPayable: totalPayable.toNumber(),
    netPosition: totalReceivable.minus(totalPayable).toNumber(),
    peopleCount: (counterparties || []).length,
    balances,
  };
}

/**
 * Reconstructs the complete chronological People Ledger history for a person
 * directly from immutable journal entries and lines.
 */
export async function getPersonLedgerHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
  counterpartyId: string
): Promise<PersonLedgerHistoryItem[]> {
  const { receivableAccountId, payableAccountId } = await ensureCounterpartyLedgerAccounts(
    supabase,
    userId,
    counterpartyId
  );

  const { data: lines, error: linesErr } = await (supabase.from('journal_lines') as any)
    .select(`
      id,
      ledger_account_id,
      debit_amount,
      credit_amount,
      memo,
      created_at,
      journal_entries (
        id,
        entry_number,
        transaction_date,
        description,
        idempotency_key,
        status,
        created_at
      )
    `)
    .eq('user_id', userId)
    .in('ledger_account_id', [receivableAccountId, payableAccountId])
    .order('created_at', { ascending: true });

  if (linesErr) {
    throw new Error(`Failed to retrieve person ledger history: ${linesErr.message}`);
  }

  // Sort chronologically by transaction_date ASC, entry_number ASC, created_at ASC
  const sortedLines = (lines || []).sort((a: any, b: any) => {
    const dateA = a.journal_entries?.transaction_date || a.created_at;
    const dateB = b.journal_entries?.transaction_date || b.created_at;
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.journal_entries?.entry_number || 0) - (b.journal_entries?.entry_number || 0);
  });

  let runningReceivable = new Decimal(0);
  let runningPayable = new Decimal(0);

  const history: PersonLedgerHistoryItem[] = [];

  for (const line of sortedLines) {
    const entry = line.journal_entries;
    const isPosted = entry.status === 'posted';
    const d = new Decimal(line.debit_amount || 0);
    const c = new Decimal(line.credit_amount || 0);

    let moneyLent = new Decimal(0);
    let moneyReceived = new Decimal(0);
    let moneyBorrowed = new Decimal(0);
    let moneyRepaid = new Decimal(0);

    if (line.ledger_account_id === receivableAccountId) {
      if (d.gt(0)) moneyLent = d;
      if (c.gt(0)) moneyReceived = c;

      if (isPosted) {
        runningReceivable = runningReceivable.plus(d).minus(c);
      }
    } else if (line.ledger_account_id === payableAccountId) {
      if (c.gt(0)) moneyBorrowed = c;
      if (d.gt(0)) moneyRepaid = d;

      if (isPosted) {
        runningPayable = runningPayable.plus(c).minus(d);
      }
    }

    const runningNet = runningReceivable.minus(runningPayable);
    let direction: 'THEY_OWE_YOU' | 'YOU_OWE_THEM' | 'SETTLED' = 'SETTLED';
    if (runningNet.gt(0)) direction = 'THEY_OWE_YOU';
    else if (runningNet.lt(0)) direction = 'YOU_OWE_THEM';

    history.push({
      id: line.id,
      journalEntryId: entry.id,
      transactionDate: entry.transaction_date,
      description: line.memo || entry.description,
      moneyLent: moneyLent.toNumber(),
      moneyReceived: moneyReceived.toNumber(),
      moneyBorrowed: moneyBorrowed.toNumber(),
      moneyRepaid: moneyRepaid.toNumber(),
      runningReceivableBalance: runningReceivable.toNumber(),
      runningPayableBalance: runningPayable.toNumber(),
      runningNetBalance: runningNet.toNumber(),
      direction,
      idempotencyKey: entry.idempotency_key,
      status: entry.status,
      createdAt: line.created_at,
    });
  }

  return history;
}

/**
 * Authoritative Lending Operation:
 * Posts Dr Asset:Receivable:<counterparty_id>, Cr Asset:<source_account_id>.
 * Uses deterministic idempotency key REC:LEND:<receivable_id>.
 */
export async function recordLending(
  supabase: SupabaseClient<Database>,
  input: RecordLendingInput
): Promise<{ success: true; journalEntryId: string; receivableId: string } | { success: false; error: string }> {
  const decAmount = new Decimal(input.amount || 0);
  if (decAmount.lte(0)) {
    return { success: false, error: 'Lending amount must be strictly greater than ₹0.00' };
  }
  if (decAmount.decimalPlaces() > 2) {
    return { success: false, error: 'Lending amount exceeds INR 2-decimal paise precision.' };
  }

  const receivableId = input.receivableId || crypto.randomUUID();
  const idempotencyKey = `REC:LEND:${receivableId}`;
  const txnDate = input.date ? input.date.split('T')[0] : new Date().toISOString().split('T')[0];

  // 1. Verify counterparty ownership & tenant isolation
  try {
    await ensureCounterpartyLedgerAccounts(supabase, input.userId, input.counterpartyId);
  } catch (cpAuthErr: any) {
    return { success: false, error: cpAuthErr.message || 'Security Violation: Counterparty not authorized for user.' };
  }

  const ledgerResult = await recordFinancialTransaction(supabase, {
    userId: input.userId,
    type: 'lending',
    accountId: input.accountId,
    counterpartyId: input.counterpartyId,
    amount: decAmount.toFixed(2),
    date: txnDate,
    description: input.description || `Lent money to counterparty`,
    notes: input.notes,
    idempotencyKey,
    sourceType: 'receivable',
    sourceId: receivableId,
  });

  if (!ledgerResult.success) {
    return { success: false, error: ledgerResult.error || 'Failed to post lending entry to authoritative ledger' };
  }

  // Synchronize downstream legacy projection
  try {
    await (supabase.from('receivables') as any).upsert(
      {
        id: receivableId,
        user_id: input.userId,
        counterparty_id: input.counterpartyId,
        original_amount: decAmount.toNumber(),
        amount_received: 0,
        due_date: txnDate,
        reason: input.description || 'Lending',
        status: 'PENDING',
        notes: `[Ledger: ${ledgerResult.journalEntryId}]`,
      },
      { onConflict: 'id' }
    );
  } catch (projErr) {
    console.warn('Downstream projection warning on lending:', projErr);
  }

  return {
    success: true,
    journalEntryId: ledgerResult.journalEntryId!,
    receivableId,
  };
}

/**
 * Authoritative Borrowing Operation:
 * Posts Dr Asset:<destination_account_id>, Cr Liability:Payable:<counterparty_id>.
 * Uses deterministic idempotency key PAY:BORROW:<payable_id>.
 */
export async function recordBorrowing(
  supabase: SupabaseClient<Database>,
  input: RecordBorrowingInput
): Promise<{ success: true; journalEntryId: string; payableId: string } | { success: false; error: string }> {
  const decAmount = new Decimal(input.amount || 0);
  if (decAmount.lte(0)) {
    return { success: false, error: 'Borrowing amount must be strictly greater than ₹0.00' };
  }
  if (decAmount.decimalPlaces() > 2) {
    return { success: false, error: 'Borrowing amount exceeds INR 2-decimal paise precision.' };
  }

  const payableId = input.payableId || crypto.randomUUID();
  const idempotencyKey = `PAY:BORROW:${payableId}`;
  const txnDate = input.date ? input.date.split('T')[0] : new Date().toISOString().split('T')[0];

  // 1. Verify counterparty ownership & tenant isolation
  try {
    await ensureCounterpartyLedgerAccounts(supabase, input.userId, input.counterpartyId);
  } catch (cpAuthErr: any) {
    return { success: false, error: cpAuthErr.message || 'Security Violation: Counterparty not authorized for user.' };
  }

  const ledgerResult = await recordFinancialTransaction(supabase, {
    userId: input.userId,
    type: 'borrowing',
    accountId: input.accountId,
    counterpartyId: input.counterpartyId,
    amount: decAmount.toFixed(2),
    date: txnDate,
    description: input.description || `Borrowed money from counterparty`,
    notes: input.notes,
    idempotencyKey,
    sourceType: 'payable',
    sourceId: payableId,
  });

  if (!ledgerResult.success) {
    return { success: false, error: ledgerResult.error || 'Failed to post borrowing entry to authoritative ledger' };
  }

  // Synchronize downstream legacy projection
  try {
    await (supabase.from('payables') as any).upsert(
      {
        id: payableId,
        user_id: input.userId,
        counterparty_id: input.counterpartyId,
        original_amount: decAmount.toNumber(),
        amount_paid: 0,
        due_date: txnDate,
        reason: input.description || 'Borrowing',
        status: 'PENDING',
        notes: `[Ledger: ${ledgerResult.journalEntryId}]`,
      },
      { onConflict: 'id' }
    );
  } catch (projErr) {
    console.warn('Downstream projection warning on borrowing:', projErr);
  }

  return {
    success: true,
    journalEntryId: ledgerResult.journalEntryId!,
    payableId,
  };
}

/**
 * Authoritative Repayment Operation with Strict Overpayment Rejection.
 * Supports:
 * - Direction 'in' (Person pays User): Dr Asset:<account>, Cr Asset:Receivable:<counterparty> (Key: REC:REPAY:<id>)
 * - Direction 'out' (User pays Person): Dr Liability:Payable:<counterparty>, Cr Asset:<account> (Key: PAY:REPAY:<id>)
 */
export async function recordRepayment(
  supabase: SupabaseClient<Database>,
  input: RecordRepaymentInput
): Promise<{ success: true; journalEntryId: string; repaymentId: string } | { success: false; error: string }> {
  const decAmount = new Decimal(input.amount || 0);
  if (decAmount.lte(0)) {
    return { success: false, error: 'Repayment amount must be strictly greater than ₹0.00' };
  }
  if (decAmount.decimalPlaces() > 2) {
    return { success: false, error: 'Repayment amount exceeds INR 2-decimal paise precision.' };
  }

  // 1. Fetch current authoritative balance before processing
  const currentBalances = await getCounterpartyAuthoritativeBalance(supabase, input.userId, input.counterpartyId);
  const repaymentId = input.repaymentId || crypto.randomUUID();
  const txnDate = input.date ? input.date.split('T')[0] : new Date().toISOString().split('T')[0];

  if (input.direction === 'in') {
    // Person pays User -> reduces Receivable balance
    const outstandingReceivable = new Decimal(currentBalances.receivableBalance);
    if (decAmount.gt(outstandingReceivable)) {
      return {
        success: false,
        error: `Overpayment Error: Requested repayment of ₹${decAmount.toFixed(2)} exceeds current outstanding receivable balance of ₹${outstandingReceivable.toFixed(2)}.`,
      };
    }

    const idempotencyKey = `REC:REPAY:${repaymentId}`;
    const ledgerResult = await recordFinancialTransaction(supabase, {
      userId: input.userId,
      type: 'repayment',
      accountId: input.accountId,
      counterpartyId: input.counterpartyId,
      amount: decAmount.toFixed(2),
      date: txnDate,
      description: input.description || `Repayment received from ${currentBalances.name}`,
      notes: input.notes,
      idempotencyKey,
      sourceType: 'receivable_repayment',
      sourceId: repaymentId,
      metadata: { direction: 'in' },
    });

    if (!ledgerResult.success) {
      return { success: false, error: ledgerResult.error || 'Failed to post repayment to ledger' };
    }

    return {
      success: true,
      journalEntryId: ledgerResult.journalEntryId!,
      repaymentId,
    };
  } else {
    // User pays Person -> reduces Payable balance
    const outstandingPayable = new Decimal(currentBalances.payableBalance);
    if (decAmount.gt(outstandingPayable)) {
      return {
        success: false,
        error: `Overpayment Error: Requested repayment of ₹${decAmount.toFixed(2)} exceeds current outstanding payable balance of ₹${outstandingPayable.toFixed(2)}.`,
      };
    }

    const idempotencyKey = `PAY:REPAY:${repaymentId}`;
    const ledgerResult = await recordFinancialTransaction(supabase, {
      userId: input.userId,
      type: 'repayment',
      accountId: input.accountId,
      counterpartyId: input.counterpartyId,
      amount: decAmount.toFixed(2),
      date: txnDate,
      description: input.description || `Repayment made to ${currentBalances.name}`,
      notes: input.notes,
      idempotencyKey,
      sourceType: 'payable_repayment',
      sourceId: repaymentId,
      metadata: { direction: 'out', isDebtRepayment: true },
    });

    if (!ledgerResult.success) {
      return { success: false, error: ledgerResult.error || 'Failed to post debt repayment to ledger' };
    }

    return {
      success: true,
      journalEntryId: ledgerResult.journalEntryId!,
      repaymentId,
    };
  }
}
