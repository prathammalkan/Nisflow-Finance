/**
 * Deterministic reserved UUID constants for system-level ledger accounts.
 * Ensures PostgreSQL UUID validation always succeeds when accounts are created
 * for general/uncategorized entries, reconciliation adjustments, and capital gains.
 */

export const SYSTEM_RESERVED_UUIDS = {
  // Uncategorized general expense/income categories
  GENERAL_EXPENSE: '00000000-0000-0000-0000-000000000001',
  GENERAL_INCOME: '00000000-0000-0000-0000-000000000002',

  // General counterparties / entities
  GENERAL_COUNTERPARTY: '00000000-0000-0000-0000-000000000003',
  GENERAL_LOAN: '00000000-0000-0000-0000-000000000004',
  GENERAL_INVESTMENT: '00000000-0000-0000-0000-000000000005',

  // Realized capital gain/loss equity & income accounts
  CAPITAL_GAIN: '00000000-0000-0000-0000-000000000006',
  CAPITAL_LOSS: '00000000-0000-0000-0000-000000000007',

  // Dividends and Opening Balance
  DIVIDEND: '00000000-0000-0000-0000-000000000008',
  OPENING_BALANCE: '00000000-0000-0000-0000-000000000009',

  // Reconciliation adjustments
  RECONCILIATION_SURPLUS: '00000000-0000-0000-0000-00000000000a',
  RECONCILIATION_SHORTFALL: '00000000-0000-0000-0000-00000000000b',
} as const;

/**
 * Validates whether a string matches standard UUID v4/nil format.
 */
export function isValidUUID(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

/**
 * Normalizes an entityId to a valid UUID. If invalid or null, falls back to a provided default UUID.
 */
export function normalizeEntityUUID(id: string | null | undefined, fallbackUUID: string): string {
  if (id && isValidUUID(id)) {
    return id.trim().toLowerCase();
  }
  return fallbackUUID;
}
