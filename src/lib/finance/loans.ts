import Decimal from 'decimal.js';

export interface AmortizationRow {
  month: number;
  paymentAmount: Decimal;
  principalComponent: Decimal;
  interestComponent: Decimal;
  remainingBalance: Decimal;
}

/**
 * Calculates the Equated Monthly Installment (EMI) for a loan.
 * @param principal The total loan amount
 * @param annualInterestRate The annual interest rate as a percentage (e.g., 10.5 for 10.5%)
 * @param tenureMonths The total duration of the loan in months
 * @returns The monthly EMI amount
 */
export function calculateEMI(principal: number | Decimal, annualInterestRate: number | Decimal, tenureMonths: number): Decimal {
  const p = new Decimal(principal);
  const rate = new Decimal(annualInterestRate);
  
  if (p.lte(0) || tenureMonths <= 0) {
    return new Decimal(0);
  }

  if (rate.lte(0)) {
    return p.dividedBy(tenureMonths);
  }

  // Monthly interest rate = Annual Rate / 12 / 100
  const r = rate.dividedBy(12).dividedBy(100);
  const n = new Decimal(tenureMonths);

  // EMI = P * r * (1+r)^n / ((1+r)^n - 1)
  const onePlusRToN = new Decimal(1).plus(r).pow(n);
  const numerator = p.times(r).times(onePlusRToN);
  const denominator = onePlusRToN.minus(1);

  return numerator.dividedBy(denominator);
}

/**
 * Generates the full amortization schedule for a loan.
 */
export function generateAmortizationSchedule(principal: number | Decimal, annualInterestRate: number | Decimal, tenureMonths: number): AmortizationRow[] {
  const p = new Decimal(principal);
  const rate = new Decimal(annualInterestRate);
  const emi = calculateEMI(p, rate, tenureMonths);
  const schedule: AmortizationRow[] = [];

  let balance = p;
  const r = rate.dividedBy(12).dividedBy(100);

  for (let month = 1; month <= tenureMonths; month++) {
    if (balance.lte(0)) break;

    // Interest for the current month = Remaining Balance * r
    const interest = balance.times(r);
    
    // Principal for the current month = EMI - Interest
    let principalPayment = emi.minus(interest);
    let paymentAmount = emi;

    if (principalPayment.gte(balance) || month === tenureMonths) {
      principalPayment = balance;
      paymentAmount = principalPayment.plus(interest);
    }

    balance = balance.minus(principalPayment);
    if (balance.lt(0.01)) balance = new Decimal(0);

    schedule.push({
      month,
      paymentAmount,
      principalComponent: principalPayment,
      interestComponent: interest,
      remainingBalance: balance,
    });
  }

  return schedule;
}
