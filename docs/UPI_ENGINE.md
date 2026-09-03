# NisFlow Finance — UPI / Payment Intelligence Engine

**Module:** `src/lib/finance/upi-engine.ts`
**Last Updated:** 2026-09-02

## Supported Payment Methods

| Method | Score (1-10) | Evidence Quality | Tax Evidence |
|--------|-------------|-----------------|-------------|
| UPI | 9 | Good | Good |
| UPI AutoPay | 8 | Excellent | Good |
| RTGS | 9 | Excellent | Excellent |
| NEFT | 8 | Excellent | Excellent |
| IMPS | 8 | Excellent | Excellent |
| Cheque | 6 | Good | Good |
| Credit Card | 7 | Excellent | Good |
| UPI Lite | 6 | Fair | Fair |
| Cash | 3 | Poor | Poor |
| Demand Draft | 6 | Excellent | Excellent |

## UPI Transaction Limits (NPCI Defaults)

| Category | Limit | Source |
|----------|-------|--------|
| P2P / P2M | Rs 1,00,000/day | NPCI OC-65 (verified 2025-01-15) |
| Tax Payment | Rs 5,00,000/txn | NPCI OC-137 (verified 2025-01-15) |
| IPO/ASBA | Rs 5,00,000 | SEBI (verified 2025-01-15) |
| UPI Lite | Rs 500/txn | NPCI (verified 2025-01-15) |

> IMPORTANT: These are NPCI defaults. Banks may set lower limits. Never present generic limits as bank-specific.

## Cash Compliance (Hard Rules)

- Section 269ST: Cash receipt/payment >= Rs 2,00,000 in single transaction PROHIBITED. Penalty = 100%.
- Section 40A(3): Business cash > Rs 10,000/day to single vendor = non-deductible expense.

## Design Constraints

1. Engine does NOT invent bank-specific rules without source data
2. All limits attributed to RBI/NPCI unless bank data exists
3. Staleness checked on every rule lookup (RULE_STALENESS_DAYS = 90)
4. Cash rules enforced deterministically
5. AI reads from this engine; it does not override its outputs
6. Recommendations NEVER encourage cash to avoid monitoring
