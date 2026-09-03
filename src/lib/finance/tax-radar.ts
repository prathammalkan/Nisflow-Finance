/**
 * NISFLOW FINANCE â€” TAX RADAR (Proactive Tax Monitor)
 *
 * Deterministic risk calculation with AI-explainable results.
 * Uses GREEN / YELLOW / ORANGE / RED risk classification.
 *
 * Risk calculations are rule-based and deterministic.
 * AI explains the deterministic results â€” it does not calculate them.
 *
 * @module tax-radar
 */

import Decimal from 'decimal.js';
import { CURRENT_FY, type TaxYear, type TaxCalculationInput, calculateTax, getTaxConfig } from './tax-engine-v2.ts';

// --- Types --------------------------------------------------------------------

export type RadarStatus = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export interface RadarFlag {
  flagId: string;
  status: RadarStatus;
  title: string;
  description: string;
  /** Deterministic explanation of how this status was computed */
  calculation: string;
  /** Recommended action */
  action: string;
  /** Relevant deadline if applicable */
  deadline?: string;
  /** Regulatory reference */
  reference?: string;
  /** Amount in Rs if quantifiable */
  amountInRs?: number;
}

export interface AdvanceTaxSchedule {
  installment: number;
  dueDate: string;
  cumulativePercent: number;
  amountDue: Decimal;
  amountPaid: Decimal;
  status: RadarStatus;
  shortfall: Decimal;
}

export interface TaxRadarReport {
  taxYear: TaxYear;
  assessmentYear: string;
  generatedAt: string;
  overallStatus: RadarStatus;
  flags: RadarFlag[];
  projectedTotalTax: Decimal;
  projectedTaxableIncome: Decimal;
  tdsCreditAvailable: Decimal;
  advanceTaxPaid: Decimal;
  estimatedTaxPayable: Decimal;
  advanceTaxSchedule: AdvanceTaxSchedule[];
  optimizationOpportunities: string[];
}

// --- Advance Tax Due Dates (FY 2025-26) --------------------------------------

export const ADVANCE_TAX_SCHEDULE_FY2526 = [
  { installment: 1, dueDate: '2025-06-15', cumulativePercent: 15 },
  { installment: 2, dueDate: '2025-09-15', cumulativePercent: 45 },
  { installment: 3, dueDate: '2025-12-15', cumulativePercent: 75 },
  { installment: 4, dueDate: '2026-03-15', cumulativePercent: 100 },
] as const;

// --- Helper --------------------------------------------------------------------

function statusFromRatio(ratio: number): RadarStatus {
  if (ratio < 0.5) return 'GREEN';
  if (ratio < 0.75) return 'YELLOW';
  if (ratio < 0.9) return 'ORANGE';
  return 'RED';
}

function getToday(): Date {
  return new Date();
}

// --- Core Tax Radar ------------------------------------------------------------

export interface TaxRadarInput {
  taxYear: TaxYear;
  regime: 'old' | 'new';
  taxInput: TaxCalculationInput;
  /** TDS deducted by employer/bank (from Form 26AS / Form 16) */
  tdsDeducted: Decimal;
  /** Advance tax already paid */
  advanceTaxPaid: Decimal;
  /** Interest income (FD/savings) */
  interestIncome?: Decimal;
  /** Dividend income */
  dividendIncome?: Decimal;
  /** Capital gains */
  ltcgEquity?: Decimal;
  stcgEquity?: Decimal;
  /** Documentation gaps */
  missingDocuments?: string[];
  /** Cash transactions in FY */
  cashDepositsInFY?: Decimal;
  cashWithdrawalsInFY?: Decimal;
}

export function generateTaxRadar(input: TaxRadarInput): TaxRadarReport {
  const today = getToday();
  const flags: RadarFlag[] = [];
  const optimizationOpportunities: string[] = [];

  // -- Calculate projected tax ------------------------------------------------
  const taxResult = calculateTax(input.taxInput, input.regime, input.taxYear);
  const projectedTotalTax = taxResult.totalTax;
  const projectedTaxableIncome = taxResult.taxableIncome;
  const tdsCreditAvailable = input.tdsDeducted;
  const estimatedTaxPayable = Decimal.max(projectedTotalTax.minus(tdsCreditAvailable).minus(input.advanceTaxPaid), new Decimal(0));

  // -- Flag: Advance Tax ------------------------------------------------------
  const advanceTaxThreshold = new Decimal(10000);
  const advanceTaxScheduleDetails: AdvanceTaxSchedule[] = [];

  if (projectedTotalTax.gt(advanceTaxThreshold)) {
    const schedule = ADVANCE_TAX_SCHEDULE_FY2526;
    for (const s of schedule) {
      const dueDate = new Date(s.dueDate);
      const isDue = today >= dueDate;
      const amountDue = projectedTotalTax.times(s.cumulativePercent).div(100);
      const shortfall = Decimal.max(amountDue.minus(input.advanceTaxPaid), new Decimal(0));
      const status: RadarStatus = !isDue ? 'GREEN'
        : shortfall.lte(0) ? 'GREEN'
        : shortfall.div(amountDue).lte(0.1) ? 'YELLOW'
        : shortfall.div(amountDue).lte(0.5) ? 'ORANGE'
        : 'RED';

      advanceTaxScheduleDetails.push({
        installment: s.installment,
        dueDate: s.dueDate,
        cumulativePercent: s.cumulativePercent,
        amountDue,
        amountPaid: Decimal.min(input.advanceTaxPaid, amountDue),
        status,
        shortfall,
      });

      if (isDue && shortfall.gt(0)) {
        const ratio = shortfall.div(amountDue).toNumber();
        flags.push({
          flagId: `ADVANCE-TAX-INSTALLMENT-${s.installment}`,
          status: statusFromRatio(ratio),
          title: `Advance Tax Installment ${s.installment} Shortfall`,
          description: `Advance tax installment ${s.installment} was due on ${s.dueDate} (${s.cumulativePercent}% of estimated tax = Rs ${amountDue.toFixed(0)}).`,
          calculation: `Projected tax = Rs ${projectedTotalTax.toFixed(0)} | Due this installment = Rs ${amountDue.toFixed(0)} | Paid = Rs ${input.advanceTaxPaid.toFixed(0)} | Shortfall = Rs ${shortfall.toFixed(0)}`,
          action: shortfall.gt(0)
            ? `Pay advance tax of Rs ${shortfall.toFixed(0)} immediately to avoid interest under Section 234C.`
            : 'Advance tax installment is covered.',
          deadline: s.dueDate,
          reference: 'Section 208/234C of Income Tax Act 1961',
          amountInRs: shortfall.toNumber(),
        });
      }
    }
  } else {
    flags.push({
      flagId: 'ADVANCE-TAX-NOT-REQUIRED',
      status: 'GREEN',
      title: 'Advance Tax Not Required',
      description: 'Projected tax liability is Rs ' + projectedTotalTax.toFixed(0) + ', which is below the Rs 10,000 threshold for advance tax.',
      calculation: `Projected total tax = Rs ${projectedTotalTax.toFixed(0)} < Rs 10,000 threshold`,
      action: 'No advance tax payment required. Pay self-assessment tax by 31 July if applicable.',
    });
  }

  // -- Flag: High Cash Deposits -----------------------------------------------
  const cashDeposits = input.cashDepositsInFY ?? new Decimal(0);
  if (cashDeposits.gte(800000)) {
    const ratio = cashDeposits.div(1000000).toNumber();
    flags.push({
      flagId: 'HIGH-CASH-DEPOSITS',
      status: cashDeposits.gte(1000000) ? 'RED' : 'ORANGE',
      title: 'High Cash Deposits â€” SFT Risk',
      description: `Cash deposits of Rs ${cashDeposits.toFixed(0)} in FY may approach or exceed the Rs 10,00,000 threshold that triggers SFT-005 reporting to Income Tax Department.`,
      calculation: `Cash deposits = Rs ${cashDeposits.toFixed(0)} | SFT threshold (savings) = Rs 10,00,000 | Usage = ${(ratio * 100).toFixed(0)}%`,
      action: 'Ensure all cash deposits have documented source (salary, withdrawal, gifts with deed, sale proceeds, etc.).',
      reference: 'Rule 114E of Income Tax Rules 1962 (SFT-005)',
      amountInRs: cashDeposits.toNumber(),
    });
  } else {
    flags.push({
      flagId: 'CASH-DEPOSITS-NORMAL',
      status: 'GREEN',
      title: 'Cash Deposits Within Normal Range',
      description: `Cash deposits Rs ${cashDeposits.toFixed(0)} are below the SFT reporting threshold.`,
      calculation: `Cash deposits = Rs ${cashDeposits.toFixed(0)} < Rs 10,00,000 SFT threshold`,
      action: 'Continue maintaining documentation for all cash receipts.',
    });
  }

  // -- Flag: TDS Mismatch -----------------------------------------------------
  const interestIncome = input.interestIncome ?? new Decimal(0);
  const expectedTdsOnInterest = interestIncome.gt(40000)
    ? interestIncome.minus(40000).times(10).div(100)
    : new Decimal(0);

  if (expectedTdsOnInterest.gt(0)) {
    flags.push({
      flagId: 'INTEREST-TDS-CHECK',
      status: 'YELLOW',
      title: 'TDS on Interest Income â€” Verify Form 26AS',
      description: `Interest income of Rs ${interestIncome.toFixed(0)} may attract TDS under Section 194A. Verify TDS credit in Form 26AS.`,
      calculation: `Interest income = Rs ${interestIncome.toFixed(0)} | TDS threshold = Rs 40,000 | Estimated TDS = Rs ${expectedTdsOnInterest.toFixed(0)}`,
      action: 'Download Form 26AS / AIS and verify TDS credit matches bank Form 16A. Submit Form 15G/15H if applicable to avoid TDS.',
      reference: 'Section 194A of Income Tax Act 1961',
      amountInRs: expectedTdsOnInterest.toNumber(),
    });
  }

  // -- Flag: Missing Documents ------------------------------------------------
  if (input.missingDocuments && input.missingDocuments.length > 0) {
    flags.push({
      flagId: 'MISSING-DOCUMENTS',
      status: 'ORANGE',
      title: `${input.missingDocuments.length} Missing Document(s) for Tax Filing`,
      description: `The following documents are required but not uploaded: ${input.missingDocuments.join(', ')}.`,
      calculation: `Missing document count = ${input.missingDocuments.length}`,
      action: 'Collect and upload missing documents before filing ITR.',
      deadline: '2026-07-31',
    });
  }

  // -- Flag: Capital Gains ----------------------------------------------------
  const ltcgEquity = input.ltcgEquity ?? new Decimal(0);
  if (ltcgEquity.gt(0)) {
    const exemptionLimit = new Decimal(125000);
    const taxableLTCG = Decimal.max(ltcgEquity.minus(exemptionLimit), new Decimal(0));
    const ltcgTax = taxableLTCG.times(12.5).div(100);

    flags.push({
      flagId: 'LTCG-EQUITY',
      status: ltcgTax.gt(0) ? 'YELLOW' : 'GREEN',
      title: 'Long-Term Capital Gains on Equity',
      description: `LTCG of Rs ${ltcgEquity.toFixed(0)} on equity investments. Rs ${Decimal.min(ltcgEquity, exemptionLimit).toFixed(0)} is exempt; Rs ${taxableLTCG.toFixed(0)} is taxable at 12.5%.`,
      calculation: `LTCG = Rs ${ltcgEquity.toFixed(0)} | Exemption = Rs 1,25,000 | Taxable = Rs ${taxableLTCG.toFixed(0)} | Tax at 12.5% = Rs ${ltcgTax.toFixed(0)}`,
      action: ltcgTax.gt(0)
        ? `Ensure Rs ${ltcgTax.toFixed(0)} LTCG tax is paid. Consider tax-loss harvesting to offset gains.`
        : 'LTCG is within exemption limit. No tax liability.',
      reference: 'Section 112A of Income Tax Act 1961',
      amountInRs: ltcgTax.toNumber(),
    });

    if (ltcgEquity.gt(125000)) {
      optimizationOpportunities.push('Tax-loss harvesting: Sell loss-making investments before 31 March to offset LTCG and reduce tax.');
    }
  }

  // -- Flag: Old vs New Regime Check ------------------------------------------
  const oldResult = calculateTax(input.taxInput, 'old', input.taxYear);
  const newResult = calculateTax(input.taxInput, 'new', input.taxYear);
  const regimeSavings = oldResult.totalTax.minus(newResult.totalTax).abs();
  const betterRegime = oldResult.totalTax.lte(newResult.totalTax) ? 'old' : 'new';

  if (regimeSavings.gt(5000) && betterRegime !== input.regime) {
    flags.push({
      flagId: 'REGIME-SUBOPTIMAL',
      status: 'YELLOW',
      title: `${betterRegime === 'new' ? 'New' : 'Old'} Regime Could Save Rs ${regimeSavings.toFixed(0)}`,
      description: `You are currently using the ${input.regime} regime. Switching to the ${betterRegime} regime could save Rs ${regimeSavings.toFixed(0)} in taxes.`,
      calculation: `Old regime tax = Rs ${oldResult.totalTax.toFixed(0)} | New regime tax = Rs ${newResult.totalTax.toFixed(0)} | Savings = Rs ${regimeSavings.toFixed(0)}`,
      action: `Consider switching to ${betterRegime} regime for FY ${input.taxYear}. Salaried employees can switch every year.`,
      deadline: '2026-04-01',
    });
    optimizationOpportunities.push(`Switch to ${betterRegime} regime to save Rs ${regimeSavings.toFixed(0)}.`);
  }

  // -- Overall Status ----------------------------------------------------------
  const statusOrder: RadarStatus[] = ['GREEN', 'YELLOW', 'ORANGE', 'RED'];
  const overallStatus = flags.reduce((worst, f) => {
    return statusOrder.indexOf(f.status) > statusOrder.indexOf(worst) ? f.status : worst;
  }, 'GREEN' as RadarStatus);

  return {
    taxYear: input.taxYear,
    assessmentYear: input.taxYear === 'FY2025-26' ? 'AY2026-27' : 'AY2025-26',
    generatedAt: today.toISOString(),
    overallStatus,
    flags,
    projectedTotalTax,
    projectedTaxableIncome,
    tdsCreditAvailable,
    advanceTaxPaid: input.advanceTaxPaid,
    estimatedTaxPayable,
    advanceTaxSchedule: advanceTaxScheduleDetails,
    optimizationOpportunities,
  };
}
