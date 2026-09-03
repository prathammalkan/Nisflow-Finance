import { Decimal } from 'decimal.js';

export const ZERO = new Decimal(0);

export function parseMoney(amount: number | string | Decimal): Decimal {
  if (amount instanceof Decimal) return amount;
  return new Decimal(amount || 0);
}

export function formatINR(amount: number | string | Decimal): string {
  const dec = parseMoney(amount);
  
  // Format with standard Indian numbering system grouping
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dec.toNumber());
}

export function addMoney(a: number | string | Decimal, b: number | string | Decimal): Decimal {
  return parseMoney(a).plus(parseMoney(b));
}

export function subtractMoney(a: number | string | Decimal, b: number | string | Decimal): Decimal {
  return parseMoney(a).minus(parseMoney(b));
}

export function multiplyMoney(a: number | string | Decimal, factor: number | string | Decimal): Decimal {
  return parseMoney(a).times(parseMoney(factor));
}

export function isZero(amount: number | string | Decimal): boolean {
  return parseMoney(amount).isZero();
}

export function isPositive(amount: number | string | Decimal): boolean {
  return parseMoney(amount).isPositive() && !parseMoney(amount).isZero();
}

export function isNegative(amount: number | string | Decimal): boolean {
  return parseMoney(amount).isNegative();
}

export function compareMoney(a: number | string | Decimal, b: number | string | Decimal): number {
  return parseMoney(a).comparedTo(parseMoney(b));
}
