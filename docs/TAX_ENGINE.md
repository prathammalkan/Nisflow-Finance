# NisFlow Finance — Tax Engine Reference

**Module:** `src/lib/finance/tax-engine-v2.ts`  
**Version:** 2.0.0  
**Last Updated:** 2026-09-02  
**Current FY:** FY2025-26 (AY2026-27)

---

## Overview

The Tax Engine V2 is a versioned, rule-based tax computation system for Indian individual taxpayers.

**Key design principles:**
- Tax rules are versioned by tax year, regime, effective date, and authority
- Rules are NOT hard-coded in UI components
- Accounting treatment is SEPARATE from tax treatment
- All rules carry source authority, URL, and verification date
- Stale rules (>365 days since verification) are flagged as UNVERIFIED

---

## Supported Tax Years

| Tax Year | Assessment Year | Status |
|----------|----------------|--------|
| FY2025-26 | AY2026-27 | **ACTIVE** |
| FY2024-25 | AY2025-26 | SUPERSEDED |
| FY2023-24 | AY2024-25 | Historical |

---

## FY2025-26 — New Regime Slabs

**Standard Deduction:** Rs 75,000  
**87A Rebate:** Full rebate if taxable income = Rs 12,00,000  
**Source:** Finance Act 2025

| Income Slab | Tax Rate |
|-------------|----------|
| 0 – 4,00,000 | 0% |
| 4,00,001 – 8,00,000 | 5% |
| 8,00,001 – 12,00,000 | 10% |
| 12,00,001 – 16,00,000 | 15% |
| 16,00,001 – 20,00,000 | 20% |
| 20,00,001 – 24,00,000 | 25% |
| Above 24,00,000 | 30% |

---

## FY2025-26 — Old Regime Slabs

**Standard Deduction:** Rs 50,000  
**87A Rebate:** Up to Rs 12,500 if taxable income = Rs 5,00,000  
**Source:** Income Tax Act 1961 (as amended)

| Income Slab | Tax Rate |
|-------------|----------|
| 0 – 2,50,000 | 0% |
| 2,50,001 – 5,00,000 | 5% |
| 5,00,001 – 10,00,000 | 20% |
| Above 10,00,000 | 30% |

---

## Surcharge Rates

| Income | New Regime | Old Regime |
|--------|-----------|-----------|
| Above Rs 50L | 10% | 10% |
| Above Rs 1 Cr | 15% | 15% |
| Above Rs 2 Cr | 25% | 25% |
| Above Rs 5 Cr | 25% | 37% |

**Cess:** 4% on (tax + surcharge) for all regimes.

---

## Versioned Deduction Rules

### Section 80C (Old Regime Only)
- **Limit:** Rs 1,50,000
- **Instruments:** ELSS, PPF, EPF, NSC, LIC, SCSS, tax-saving FD, home loan principal, tuition fees
- **Source:** Section 80C, Income Tax Act 1961
- **Status:** ACTIVE (verified 2025-04-01)

### Section 80D (Old Regime Only)
- **Limit:** Rs 25,000 self/family (Rs 50,000 if senior citizen); additional Rs 25,000 for parents
- **Source:** Section 80D, Income Tax Act 1961
- **Status:** ACTIVE (verified 2025-04-01)

### Section 80TTA (Old Regime Only)
- **Limit:** Rs 10,000 on savings account interest
- **Note:** Senior citizens (60+): use Section 80TTB (Rs 50,000 on all bank interest)
- **Status:** ACTIVE (verified 2025-04-01)

### Section 80CCD(1B) — NPS (Old Regime Only)
- **Limit:** Rs 50,000 additional (over 80C)
- **Source:** Section 80CCD(1B), Income Tax Act 1961
- **Status:** ACTIVE (verified 2025-04-01)

### Section 24(b) — Home Loan Interest (Old Regime)
- **Limit:** Rs 2,00,000 for self-occupied; unlimited for let-out
- **Status:** ACTIVE (verified 2025-04-01)

### Section 80E — Education Loan Interest (Old Regime)
- **Limit:** No upper limit; 8-year deduction period
- **Status:** ACTIVE (verified 2025-04-01)

---

## Capital Gains Rules (FY2025-26)

### LTCG on Listed Equity / Equity MF (Section 112A)
- **Rate:** 12.5% (effective 23 July 2024)
- **Exemption:** Rs 1,25,000/year
- **Holding period:** > 12 months
- **Source:** Finance (No. 2) Act 2024, Section 112A

### STCG on Listed Equity (Section 111A)
- **Rate:** 20% (effective 23 July 2024)
- **Holding period:** = 12 months
- **Source:** Finance (No. 2) Act 2024, Section 111A

---

## TDS Rules

### Section 194A — Interest Income
- **Threshold:** Rs 40,000/year per bank (Rs 50,000 for senior citizens)
- **Rate:** 10% (20% without PAN)
- **Remedy:** Form 15G (below 60) / Form 15H (60+) to avoid TDS

---

## Tax Radar — Risk Levels

| Status | Meaning |
|--------|---------|
| GREEN | No action required |
| YELLOW | Advisory — review recommended |
| ORANGE | Attention required — potential shortfall |
| RED | Urgent action required — compliance risk |

---

## Accounting vs Tax — Key Distinctions

| Event | Accounting Treatment | Tax Treatment |
|-------|---------------------|---------------|
| FD creation | Asset transfer (cash ? FD) | No income at creation |
| FD interest | Income in P&L | Taxable on accrual annually |
| Loan received | Liability increase, asset increase | NOT income |
| Gift from relative | Equity (capital receipt) | Tax exempt |
| Gift from non-relative > Rs 50k | Income | Taxable u/s 56(2)(x) |
| Investment purchase | Asset transfer | No income/expense |
| Investment sale gain | Income (capital gain) | Taxable at special rates |

---

## Sources and Authority

| Rule | Authority | URL |
|------|-----------|-----|
| New Regime Slabs | Finance Act 2025 | incometax.gov.in |
| Old Regime Slabs | Income Tax Act 1961 | incometax.gov.in |
| Section 80C | CBDT | incometax.gov.in |
| Section 112A LTCG | Finance (No. 2) Act 2024 | incometax.gov.in |
| Section 111A STCG | Finance (No. 2) Act 2024 | incometax.gov.in |
| Section 194A TDS | Income Tax Act 1961 | incometax.gov.in |
