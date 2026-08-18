import Decimal from 'decimal.js';

export interface AmortizationRow {
  month: number;
  openingBalance: Decimal;
  paymentAmount: Decimal;
  principalComponent: Decimal;
  interestComponent: Decimal;
  remainingBalance: Decimal;
}

/**
 * Calculates the Equated Monthly Installment (EMI) for a loan using Decimal.js.
 * @param principal The total loan amount
 * @param annualInterestRate The annual interest rate as a percentage (e.g., 10.5 for 10.5%)
 * @param tenureMonths The total duration of the loan in months
 * @returns The monthly EMI amount as a Decimal
 */
export function calculateEMI(
  principal: number | Decimal,
  annualInterestRate: number | Decimal,
  tenureMonths: number
): Decimal {
  const p = new Decimal(principal || 0);
  const rate = new Decimal(annualInterestRate || 0);
  
  if (p.lte(0) || tenureMonths <= 0) {
    return new Decimal(0);
  }

  // Zero-interest loan handling
  if (rate.lte(0)) {
    return p.dividedBy(tenureMonths);
  }

  // Monthly interest rate = Annual Rate / 12 / 100
  const r = rate.dividedBy(12).dividedBy(100);
  const n = new Decimal(tenureMonths);

  // EMI = [P * r * (1+r)^n] / [(1+r)^n - 1]
  const onePlusRToN = new Decimal(1).plus(r).pow(n);
  const numerator = p.times(r).times(onePlusRToN);
  const denominator = onePlusRToN.minus(1);

  if (denominator.isZero()) {
    return p.dividedBy(tenureMonths);
  }

  return numerator.dividedBy(denominator);
}

/**
 * Generates the complete amortization schedule for a loan.
 * Ensures zero-interest edge cases and final balance rounding are handled strictly.
 */
export function generateAmortizationSchedule(
  principal: number | Decimal,
  annualInterestRate: number | Decimal,
  tenureMonths: number
): AmortizationRow[] {
  const p = new Decimal(principal || 0);
  const rate = new Decimal(annualInterestRate || 0);

  if (p.lte(0) || tenureMonths <= 0) {
    return [];
  }

  const emi = calculateEMI(p, rate, tenureMonths);
  const schedule: AmortizationRow[] = [];

  let balance = p;
  const isZeroRate = rate.lte(0);
  const r = isZeroRate ? new Decimal(0) : rate.dividedBy(12).dividedBy(100);

  for (let month = 1; month <= tenureMonths; month++) {
    if (balance.lte(0)) break;

    const openingBalance = balance;
    // Interest for the current month = Remaining Balance * r
    const interest = isZeroRate ? new Decimal(0) : balance.times(r);
    
    // Principal for the current month = EMI - Interest
    let principalPayment = isZeroRate ? emi : emi.minus(interest);
    let paymentAmount = emi;

    // Final installment or boundary adjustment to prevent negative closing balance
    if (month === tenureMonths || principalPayment.gte(balance)) {
      principalPayment = balance;
      paymentAmount = principalPayment.plus(interest);
    }

    balance = balance.minus(principalPayment);
    if (balance.abs().lt(0.005) || balance.lt(0)) {
      balance = new Decimal(0);
    }

    schedule.push({
      month,
      openingBalance,
      paymentAmount,
      principalComponent: principalPayment,
      interestComponent: interest,
      remainingBalance: balance,
    });
  }

  return schedule;
}
