import Decimal from 'decimal.js';

export interface TaxInput {
  grossIncome: Decimal;
  deduction80C: Decimal;      // max 150000
  deduction80D: Decimal;      // health insurance
  hra: Decimal;               // HRA exemption
  lta: Decimal;               // LTA exemption
  otherDeductions: Decimal;   // 80CCD(1B), 80G, home loan interest, etc.
}

export interface TaxResult {
  regime: 'old' | 'new';
  grossIncome: Decimal;
  standardDeduction: Decimal;
  totalDeductions: Decimal;
  taxableIncome: Decimal;
  taxBeforeCess: Decimal;
  surcharge: Decimal;
  rebate87A: Decimal;
  cess: Decimal;
  totalTax: Decimal;
  effectiveRate: Decimal;
  inHandMonthly: Decimal;
  slabBreakdown: Array<{ slab: string; tax: Decimal }>;
}

function calcSlab(income: Decimal, slabs: Array<{from: number; to: number; rate: number}>): { total: Decimal; breakdown: Array<{slab: string; tax: Decimal}> } {
  let total = new Decimal(0);
  const breakdown: Array<{slab: string; tax: Decimal}> = [];
  for (const s of slabs) {
    if (income.lte(s.from)) break;
    const taxable = Decimal.min(income, s.to).minus(s.from);
    const tax = taxable.times(s.rate).div(100);
    if (tax.gt(0)) {
      breakdown.push({ slab: `₹${(s.from/100000).toFixed(0)}L - ${s.to === Infinity ? 'above' : '₹'+(s.to/100000).toFixed(0)+'L'}`, tax });
      total = total.plus(tax);
    }
  }
  return { total, breakdown };
}

function calcSurcharge(taxableIncome: Decimal, tax: Decimal, isNew: boolean): Decimal {
  const inc = taxableIncome.toNumber();
  let rate = 0;
  if (inc > 50000000) rate = isNew ? 25 : 37;
  else if (inc > 20000000) rate = 25;
  else if (inc > 10000000) rate = 15;
  else if (inc > 5000000) rate = 10;
  return tax.times(rate).div(100);
}

export function calculateOldRegimeTax(input: TaxInput): TaxResult {
  const SD = new Decimal(50000);
  const cap80C = Decimal.min(input.deduction80C, new Decimal(150000));
  const totalDeductions = SD.plus(cap80C).plus(input.deduction80D).plus(input.hra).plus(input.lta).plus(input.otherDeductions);
  const taxableIncome = Decimal.max(input.grossIncome.minus(totalDeductions), new Decimal(0));
  
  const slabs = [
    { from: 0, to: 250000, rate: 0 },
    { from: 250000, to: 500000, rate: 5 },
    { from: 500000, to: 1000000, rate: 20 },
    { from: 1000000, to: Infinity, rate: 30 },
  ];
  const { total: taxBeforeCess, breakdown } = calcSlab(taxableIncome, slabs);
  // 87A rebate: full rebate if taxable income <= 5L
  const rebate87A = taxableIncome.lte(500000) ? taxBeforeCess : new Decimal(0);
  const taxAfterRebate = Decimal.max(taxBeforeCess.minus(rebate87A), new Decimal(0));
  const surcharge = calcSurcharge(taxableIncome, taxAfterRebate, false);
  const cess = taxAfterRebate.plus(surcharge).times(4).div(100);
  const totalTax = taxAfterRebate.plus(surcharge).plus(cess);
  const effectiveRate = input.grossIncome.gt(0) ? totalTax.div(input.grossIncome).times(100) : new Decimal(0);
  const inHandMonthly = input.grossIncome.minus(totalTax).div(12);
  return { regime: 'old', grossIncome: input.grossIncome, standardDeduction: SD, totalDeductions, taxableIncome, taxBeforeCess, surcharge, rebate87A, cess, totalTax, effectiveRate, inHandMonthly, slabBreakdown: breakdown };
}

export function calculateNewRegimeTax(input: TaxInput): TaxResult {
  const SD = new Decimal(75000);
  const taxableIncome = Decimal.max(input.grossIncome.minus(SD), new Decimal(0));
  
  const slabs = [
    { from: 0, to: 400000, rate: 0 },
    { from: 400000, to: 800000, rate: 5 },
    { from: 800000, to: 1200000, rate: 10 },
    { from: 1200000, to: 1600000, rate: 15 },
    { from: 1600000, to: 2000000, rate: 20 },
    { from: 2000000, to: 2400000, rate: 25 },
    { from: 2400000, to: Infinity, rate: 30 },
  ];
  const { total: taxBeforeCess, breakdown } = calcSlab(taxableIncome, slabs);
  // 87A rebate: full rebate if taxable income <= 12L under new regime
  const rebate87A = taxableIncome.lte(1200000) ? taxBeforeCess : new Decimal(0);
  const taxAfterRebate = Decimal.max(taxBeforeCess.minus(rebate87A), new Decimal(0));
  const surcharge = calcSurcharge(taxableIncome, taxAfterRebate, true);
  const cess = taxAfterRebate.plus(surcharge).times(4).div(100);
  const totalTax = taxAfterRebate.plus(surcharge).plus(cess);
  const effectiveRate = input.grossIncome.gt(0) ? totalTax.div(input.grossIncome).times(100) : new Decimal(0);
  const inHandMonthly = input.grossIncome.minus(totalTax).div(12);
  return { regime: 'new', grossIncome: input.grossIncome, standardDeduction: SD, totalDeductions: SD, taxableIncome, taxBeforeCess, surcharge, rebate87A, cess, totalTax, effectiveRate, inHandMonthly, slabBreakdown: breakdown };
}

export function compareRegimes(input: TaxInput): { old: TaxResult; new: TaxResult; recommended: 'old' | 'new'; savings: Decimal } {
  const oldResult = calculateOldRegimeTax(input);
  const newResult = calculateNewRegimeTax(input);
  const recommended = oldResult.totalTax.lte(newResult.totalTax) ? 'old' : 'new';
  const savings = oldResult.totalTax.minus(newResult.totalTax).abs();
  return { old: oldResult, new: newResult, recommended, savings };
}
