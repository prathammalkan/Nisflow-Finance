import Decimal from 'decimal.js';

export interface LoanCalcResult {
  principal: number;
  rate: number;
  tenureMonths: number;
  monthlyEMI: number;
  totalInterest: number;
  totalAmount: number;
}

export function calculateEMI(principal: number, annualRatePercent: number, tenureMonths: number): LoanCalcResult {
  if (principal <= 0 || tenureMonths <= 0) {
    return { principal: 0, rate: annualRatePercent, tenureMonths: 0, monthlyEMI: 0, totalInterest: 0, totalAmount: 0 };
  }

  const P = new Decimal(principal);
  const annualRate = new Decimal(annualRatePercent);
  
  if (annualRatePercent === 0) {
    const emi = P.dividedBy(tenureMonths).toDecimalPlaces(2).toNumber();
    return {
      principal,
      rate: 0,
      tenureMonths,
      monthlyEMI: emi,
      totalInterest: 0,
      totalAmount: principal,
    };
  }

  // Monthly interest rate r = Annual Rate / 12 / 100
  const r = annualRate.dividedBy(12).dividedBy(100);
  const n = new Decimal(tenureMonths);

  // EMI Formula: [P x r x (1+r)^n]/[(1+r)^n - 1]
  const onePlusR = new Decimal(1).plus(r);
  const pow = onePlusR.pow(tenureMonths);
  const numerator = P.times(r).times(pow);
  const denominator = pow.minus(1);

  const emi = numerator.dividedBy(denominator).toDecimalPlaces(2);
  const totalPayment = emi.times(n).toDecimalPlaces(2);
  const totalInterest = totalPayment.minus(P).toDecimalPlaces(2);

  return {
    principal,
    rate: annualRatePercent,
    tenureMonths,
    monthlyEMI: emi.toNumber(),
    totalInterest: Math.max(0, totalInterest.toNumber()),
    totalAmount: totalPayment.toNumber(),
  };
}

export function calculateSimpleInterest(principal: number, annualRatePercent: number, tenureMonths: number): LoanCalcResult {
  const P = new Decimal(principal);
  const R = new Decimal(annualRatePercent);
  const T = new Decimal(tenureMonths).dividedBy(12);

  // SI = (P * R * T) / 100
  const interest = P.times(R).times(T).dividedBy(100).toDecimalPlaces(2);
  const total = P.plus(interest);
  const emi = total.dividedBy(tenureMonths).toDecimalPlaces(2);

  return {
    principal,
    rate: annualRatePercent,
    tenureMonths,
    monthlyEMI: emi.toNumber(),
    totalInterest: interest.toNumber(),
    totalAmount: total.toNumber(),
  };
}
