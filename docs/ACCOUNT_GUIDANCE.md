# NisFlow Finance — Account Purpose Advisor

**Module:** `src/lib/finance/account-purpose.ts`
**Last Updated:** 2026-09-02

## Purpose

Formal account-purpose intelligence layer. Separates:
- Bank product type (savings, current, credit card, FD, etc.)
- Account purpose (salary, emergency fund, business, etc.)
- Accounting classification (asset / liability / equity / income / expense)
- Tax classification (interest income, business income, capital asset, loan, etc.)

## Supported Account Purposes

| Purpose ID | Name | Product | Accounting | Tax Class |
|-----------|------|---------|-----------|----------|
| savings-general | General Savings | savings | asset | savings_interest |
| salary-account | Salary Account | salary | asset | salary_income |
| current-business | Current / Business | current | asset | business_income |
| cash-wallet | Cash / Petty Cash | cash | asset | not_directly_taxable |
| credit-card | Credit Card | credit_card | liability | credit_facility |
| fixed-deposit | Fixed Deposit (FD) | fixed_deposit | asset | savings_interest |
| recurring-deposit | Recurring Deposit | recurring_deposit | asset | savings_interest |
| demat-investment | Demat / Investment | demat | asset | investment_asset |
| loan-liability | Loan Account | loan | liability | loan_liability |

## Each Definition Contains

- **PURPOSE** — Primary description of the account type
- **USE WHEN** — Appropriate use cases
- **USE WITH CAUTION** — Scenarios requiring extra care
- **DO NOT USE FOR** — Prohibited or inadvisable uses
- **EXPECTED TRANSACTIONS** — Normal transaction types
- **DOCUMENTATION** — Documents to retain
- **TAX CONSIDERATIONS** — Tax rules applicable
- **AUDIT CONSIDERATIONS** — Audit trail requirements
- **AI GUIDANCE** — Instructions for AI when classifying ambiguous transactions

## Key Tax Distinctions by Purpose

| Event | Savings Account | Current Account | Credit Card |
|-------|----------------|----------------|------------|
| Interest | Taxable (80TTA deduction) | Not applicable | Not deductible |
| Cash deposit > Rs 10L/FY | SFT-005 reported | SFT at Rs 50L | N/A |
| Unexplained credit | Section 68 risk | Section 68 risk | N/A |
| Personal expense | Fine | Audit risk | Fine |

## Credit Card Accounting Note

A credit card is a LIABILITY account. Paying the credit card bill REDUCES the liability — it is NOT an expense. The expense occurred at the point of purchase. The AI and ledger enforce this distinction.

## Loan Accounting Note

A loan disbursement is NOT income. It increases bank asset AND loan liability equally — net worth unchanged. EMI principal reduces liability; interest portion is an expense. The AI and ledger enforce this.

## AI Guidance Integration

The `getAIGuidance(purposeId)` function returns purpose-specific instructions that are injected into the AI context when evaluating transactions for that account type. This prevents the AI from making incorrect assumptions.
