/**
 * NisFlow Finance â€” Financial Intelligence API
 *
 * GET /api/finance/intelligence?type=<query>
 *
 * All authenticated types require valid Supabase session.
 * Public types (upi-limits, payment-recommend, account-purpose, transaction-guard)
 * are usable without auth but rate-limited by Vercel edge defaults.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Decimal from 'decimal.js';

// Phase 4 engine imports
import {
  getUPILimit,
  getRbiNpciRules,
  findBankByIFSC,
  getAllBankIds,
  type BankRuleType,
} from '@/lib/finance/bank-registry';

import {
  ACCOUNT_PURPOSES,
  getAccountPurpose,
  getAIGuidance,
  getPurposesForProduct,
  listAllPurposes,
} from '@/lib/finance/account-purpose';

import {
  evaluatePayment,
  recommendPaymentMethod,
  canPayViaUPI,
  type PaymentMethod,
  type PaymentCategory,
} from '@/lib/finance/upi-engine';

import {
  calculateTax,
  compareRegimesV2,
  getApplicableDeductions,
  getTaxConfig,
  CURRENT_FY,
  CURRENT_AY,
  TAX_ENGINE_VERSION,
  type TaxYear,
} from '@/lib/finance/tax-engine-v2';

import {
  generateTaxRadar,
  type TaxRadarInput,
} from '@/lib/finance/tax-radar';

import {
  generateOptimizationRecommendations,
  type OptimizationInput,
} from '@/lib/finance/tax-optimization';

import {
  evaluateTransactionRisk,
  evaluateApproachingLimits,
  aggregateRiskLevel,
} from '@/lib/finance/financial-risk-monitor';

import {
  evaluateTransactionGuard,
  isAmbiguous,
  getAmbiguityClarifications,
} from '@/lib/finance/transaction-guard';

import {
  reconcileAISTIS,
  getAISDownloadGuidance,
  RECONCILIATION_DISCLAIMER,
} from '@/lib/finance/ais-tis-reconciliation';

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get('type');

  if (!type) {
    return badRequest('Missing ?type= parameter. Valid types: upi-limits, payment-recommend, account-purpose, account-purposes, tax-config, tax-compare, tax-radar, tax-optimize, risk-flags, transaction-guard, ais-guidance, bank-rules');
  }

  // â”€â”€ UPI Limits (public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'upi-limits') {
    const category = (searchParams.get('category') || 'p2p') as 'p2p' | 'p2m' | 'tax' | 'ipo' | 'lite';
    const amount = Number(searchParams.get('amount') || 0);
    const bankId = searchParams.get('bankId') || undefined;

    const limit = getUPILimit(category, bankId);
    const answer = amount > 0 ? canPayViaUPI({ amount, category, bankId }) : null;

    return NextResponse.json({
      category,
      limit: limit.limitAmount,
      unit: limit.unit,
      description: limit.description,
      isStale: limit.isStale,
      source: limit.source,
      ruleId: limit.ruleId,
      bankSpecificNote: limit.bankSpecificNote,
      ...(answer ? { canPay: answer.canPay, answer: answer.answer, caveats: answer.caveats } : {}),
      disclaimer: 'Limits are sourced from NPCI/RBI. Bank-specific limits may vary. Verify with your bank.',
    });
  }

  // â”€â”€ Payment Recommendation (public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'payment-recommend') {
    const amount = Number(searchParams.get('amount'));
    const category = (searchParams.get('category') || 'personal_transfer') as PaymentCategory;
    const bankId = searchParams.get('bankId') || undefined;
    const isBusinessExpense = searchParams.get('isBusinessExpense') === 'true';

    if (!amount || amount <= 0) return badRequest('amount must be a positive number');

    const rankings = recommendPaymentMethod({ amount, category, isBusinessExpense, bankId });
    const evaluation = (method: PaymentMethod) => evaluatePayment({ amount, method, category, bankId, isBusinessExpense });

    return NextResponse.json({
      amount,
      category,
      topRecommendation: rankings[0]?.method || null,
      rankings: rankings.slice(0, 5).map(r => ({
        rank: r.rank,
        method: r.method,
        score: r.score,
        reason: r.reason,
        documentationQuality: r.profile.documentationQuality,
        taxEvidenceQuality: r.profile.taxEvidenceQuality,
        pros: r.profile.pros,
        cons: r.profile.cons,
      })),
      cashEvaluation: evaluation('CASH'),
    });
  }

  // â”€â”€ Account Purpose (public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'account-purpose') {
    const purposeId = searchParams.get('purposeId');
    if (!purposeId) return badRequest('purposeId required');

    const def = getAccountPurpose(purposeId);
    if (!def) return NextResponse.json({ error: 'Unknown purposeId', validPurposes: listAllPurposes().map(p => p.purposeId) }, { status: 404 });

    return NextResponse.json(def);
  }

  // â”€â”€ All Account Purposes (public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'account-purposes') {
    return NextResponse.json({
      purposes: listAllPurposes(),
      count: ACCOUNT_PURPOSES.length,
    });
  }

  // â”€â”€ Transaction Guard (public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'transaction-guard') {
    const description = searchParams.get('description') || '';
    const amount = Number(searchParams.get('amount') || 0);
    const accountType = searchParams.get('accountType') || undefined;
    const accountPurposeId = searchParams.get('accountPurposeId') || undefined;
    const counterpartyName = searchParams.get('counterpartyName') || undefined;
    const userStatedType = searchParams.get('userStatedType') || undefined;
    const isCash = searchParams.get('isCash') === 'true';

    if (!description) return badRequest('description required');
    if (amount <= 0) return badRequest('amount must be positive');

    const result = evaluateTransactionGuard({ description, amount, accountType, accountPurposeId, counterpartyName, userStatedType, isCash });
    return NextResponse.json(result);
  }

  // â”€â”€ Bank Rules (public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'bank-rules') {
    const ruleType = searchParams.get('ruleType') as BankRuleType | undefined;
    const rules = getRbiNpciRules(ruleType || undefined);
    return NextResponse.json({ rules, count: rules.length, disclaimer: 'Rules are sourced from official RBI/NPCI/CBDT publications. Verify currency before relying on these limits.' });
  }

  // â”€â”€ Tax Config (public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'tax-config') {
    const regime = (searchParams.get('regime') || 'new') as 'old' | 'new';
    const taxYear = (searchParams.get('taxYear') || CURRENT_FY) as TaxYear;
    const config = getTaxConfig(regime, taxYear);
    if (!config) return NextResponse.json({ error: 'No tax config for this year/regime' }, { status: 404 });
    return NextResponse.json({ config, currentFY: CURRENT_FY, currentAY: CURRENT_AY, engineVersion: TAX_ENGINE_VERSION });
  }

  // â”€â”€ Tax Comparison (public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'tax-compare') {
    const grossIncome = Number(searchParams.get('grossIncome'));
    if (!grossIncome || grossIncome <= 0) return badRequest('grossIncome required');

    const deduction80C = Number(searchParams.get('deduction80C') || 0);
    const deduction80D = Number(searchParams.get('deduction80D') || 0);
    const homeLoanInterest = Number(searchParams.get('homeLoanInterest') || 0);
    const nps = Number(searchParams.get('nps') || 0);

    const input = {
      grossIncome: new Decimal(grossIncome),
      deduction80C: deduction80C ? new Decimal(deduction80C) : undefined,
      deduction80D: deduction80D ? new Decimal(deduction80D) : undefined,
      homeLoanInterest24B: homeLoanInterest ? new Decimal(homeLoanInterest) : undefined,
      deduction80CCD1B: nps ? new Decimal(nps) : undefined,
    };

    const comparison = compareRegimesV2(input, CURRENT_FY);

    return NextResponse.json({
      taxYear: CURRENT_FY,
      assessmentYear: CURRENT_AY,
      old: {
        totalTax: comparison.old.totalTax.toFixed(2),
        taxableIncome: comparison.old.taxableIncome.toFixed(2),
        totalDeductions: comparison.old.totalDeductions.toFixed(2),
        effectiveRate: comparison.old.effectiveRate.toFixed(2) + '%',
        inHandMonthly: comparison.old.inHandMonthly.toFixed(2),
      },
      new: {
        totalTax: comparison.new.totalTax.toFixed(2),
        taxableIncome: comparison.new.taxableIncome.toFixed(2),
        totalDeductions: comparison.new.totalDeductions.toFixed(2),
        effectiveRate: comparison.new.effectiveRate.toFixed(2) + '%',
        inHandMonthly: comparison.new.inHandMonthly.toFixed(2),
      },
      recommended: comparison.recommended,
      savingsVsAlternative: comparison.savings.toFixed(2),
      disclaimer: 'This is an estimate only. Consult a CA for authoritative tax advice.',
    });
  }

  // â”€â”€ AIS Guidance (public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'ais-guidance') {
    return NextResponse.json({
      steps: getAISDownloadGuidance(),
      disclaimer: RECONCILIATION_DISCLAIMER,
    });
  }

  // â”€â”€ All routes below require authentication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return unauthorized();

  // â”€â”€ Tax Radar (authenticated) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'tax-radar') {
    const regime = (searchParams.get('regime') || 'new') as 'old' | 'new';
    const grossIncome = Number(searchParams.get('grossIncome') || 0);
    const tdsDeducted = Number(searchParams.get('tdsDeducted') || 0);
    const advanceTaxPaid = Number(searchParams.get('advanceTaxPaid') || 0);

    if (!grossIncome || grossIncome <= 0) return badRequest('grossIncome required');

    const radarInput: TaxRadarInput = {
      taxYear: CURRENT_FY,
      regime,
      taxInput: { grossIncome: new Decimal(grossIncome) },
      tdsDeducted: new Decimal(tdsDeducted),
      advanceTaxPaid: new Decimal(advanceTaxPaid),
    };

    const report = generateTaxRadar(radarInput);

    return NextResponse.json({
      taxYear: report.taxYear,
      assessmentYear: report.assessmentYear,
      overallStatus: report.overallStatus,
      projectedTotalTax: report.projectedTotalTax.toFixed(2),
      estimatedTaxPayable: report.estimatedTaxPayable.toFixed(2),
      flags: report.flags,
      optimizationOpportunities: report.optimizationOpportunities,
      advanceTaxSchedule: report.advanceTaxSchedule.map(s => ({
        ...s,
        amountDue: s.amountDue.toFixed(2),
        amountPaid: s.amountPaid.toFixed(2),
        shortfall: s.shortfall.toFixed(2),
      })),
      disclaimer: 'Tax estimates are based on inputs provided. Consult a qualified CA for authoritative advice.',
    });
  }

  // â”€â”€ Tax Optimization (authenticated) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'tax-optimize') {
    const regime = (searchParams.get('regime') || 'new') as 'old' | 'new';
    const grossIncome = Number(searchParams.get('grossIncome') || 0);

    if (!grossIncome || grossIncome <= 0) return badRequest('grossIncome required');

    const optInput: OptimizationInput = {
      taxYear: CURRENT_FY,
      regime,
      grossIncome: new Decimal(grossIncome),
      current80C: searchParams.get('current80C') ? new Decimal(searchParams.get('current80C')!) : undefined,
      current80D: searchParams.get('current80D') ? new Decimal(searchParams.get('current80D')!) : undefined,
      currentNPS80CCD1B: searchParams.get('nps') ? new Decimal(searchParams.get('nps')!) : undefined,
    };

    const recommendations = generateOptimizationRecommendations(optInput);

    return NextResponse.json({
      regime,
      grossIncome,
      recommendations: recommendations.map(r => ({
        id: r.id,
        type: r.type,
        title: r.title,
        why: r.why,
        legalBasis: r.legalBasis,
        estimatedSavingRs: r.estimatedSavingRs,
        calculation: r.calculation,
        actionSteps: r.actionSteps,
        deadline: r.deadline,
        confidence: r.confidence,
        applicableRegimes: r.applicableRegimes,
        ethicalNote: r.ethicalNote,
      })),
      disclaimer: 'All recommendations are for lawful tax planning only. Never misrepresent facts to obtain tax benefits.',
    });
  }

  // â”€â”€ Risk Flags (authenticated) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'risk-flags') {
    // Fetch recent transactions for the user
    const { data: txns, error: txErr } = await supabase
      .from('transactions')
      .select('id, amount, description, date, type, direction')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(50);

    if (txErr) {
      return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 });
    }

    const transactionsForRisk = (txns || []).map((t: any) => ({
      id: t.id,
      amount: Number(t.amount),
      description: t.description || '',
      date: t.date,
      type: t.direction === 'in' ? 'income' : 'expense',
      accountId: '',
    }));

    const flags = evaluateTransactionRisk({ transactions: transactionsForRisk });
    const level = aggregateRiskLevel(flags);

    return NextResponse.json({
      overallRiskLevel: level,
      flagCount: flags.length,
      flags: flags.filter(f => f.riskLevel !== 'NORMAL'),
      disclaimer: 'Risk flags are for your awareness only. An unusual transaction may have a valid explanation.',
    });
  }

  return badRequest(`Unknown type: "${type}". Valid: upi-limits, payment-recommend, account-purpose, account-purposes, tax-config, tax-compare, tax-radar, tax-optimize, risk-flags, transaction-guard, ais-guidance, bank-rules`);
}
