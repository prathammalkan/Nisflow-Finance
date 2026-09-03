import { Decimal } from 'decimal.js';

/**
 * NISFLOW FINANCE — CANONICAL ACCOUNT BALANCE RESOLUTION
 * 
 * Standardizes account summary and balance calculations across:
 * - Account cards
 * - Totals / Net Worth calculations
 * - Dashboard widgets
 * - Account detail views
 * - Bill splitter / transaction selectors
 * 
 * Canonical Priority:
 * 1. account.current_balance (most specific cached authoritative balance)
 * 2. account.balance (legacy cached balance fallback)
 * 3. 0 (safe zero fallback)
 */

export interface AccountBalanceLike {
  current_balance?: number | string | null;
  balance?: number | string | null;
}

/**
 * Returns the numeric authoritative balance for an account with standard fallback priority.
 */
export function getAccountAuthoritativeBalance(account: AccountBalanceLike | null | undefined): number {
  if (!account) return 0;
  const raw = account.current_balance ?? account.balance ?? 0;
  const num = Number(raw);
  return isNaN(num) ? 0 : num;
}

/**
 * Returns a high-precision Decimal instance for authoritative financial arithmetic.
 */
export function getAccountAuthoritativeDecimalBalance(account: AccountBalanceLike | null | undefined): Decimal {
  if (!account) return new Decimal(0);
  const raw = account.current_balance ?? account.balance ?? 0;
  try {
    return new Decimal(raw || 0);
  } catch {
    return new Decimal(0);
  }
}
