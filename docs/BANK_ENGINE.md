# NisFlow Finance — Bank Intelligence Engine

**Module:** `src/lib/finance/bank-registry.ts`  
**Last Updated:** 2026-09-02

---

## Architecture

The Bank Registry is a maintainable, versioned architecture.
Rules are NEVER hard-coded inside React components.

### Separation of Concerns

```
bank product          ? what type of account (savings, current, FD, etc.)
account purpose       ? what the account is FOR (salary, emergency, business)
accounting class      ? asset / liability / equity / income / expense
tax classification    ? how income/deductions are treated
bank rule             ? what limits / policies apply
```

---

## Rule Versioning

Every rule carries:
- `id` — unique rule identifier
- `ruleType` — categorized rule type
- `effectiveFrom` / `effectiveTo` — date validity
- `source.authority` — who issued this rule (RBI, NPCI, CBDT, bank)
- `source.url` — authoritative URL
- `verifiedAt` — when last verified
- `status` — ACTIVE / UNVERIFIED / SUPERSEDED / BANK_SPECIFIC
- `isRbiNpciRule` — true = regulatory; false = bank-specific

**Staleness:** Rules older than 90 days since `verifiedAt` are surfaced with UNVERIFIED status and a "Verification required" warning.

---

## RBI / NPCI Universal Rules (as of 2025-01-15)

| Rule | Value | Source |
|------|-------|--------|
| UPI P2P Daily Limit | Rs 1,00,000/day | NPCI/2021/UPI/OC-65 |
| UPI Single Transaction | Rs 1,00,000 | NPCI |
| UPI Tax Payment | Rs 5,00,000 | NPCI/2023/UPI/OC-137 |
| UPI IPO/ASBA | Rs 5,00,000 | SEBI |
| UPI Lite per transaction | Rs 500 | NPCI |
| RTGS Minimum | Rs 2,00,000 | RBI |
| NEFT Minimum | Re 1 (no minimum) | RBI |
| Savings Cash Deposit SFT | Rs 10,00,000/FY | CBDT Rule 114E |
| Current Cash Deposit SFT | Rs 50,00,000/FY | CBDT Rule 114E |
| TDS on Interest Threshold | Rs 40,000/year | Section 194A |

> **IMPORTANT:** These are NPCI/RBI defaults. Individual banks may set lower limits. Never present a generic limit as a bank-specific limit without verification.

---

## Supported Banks

| Bank ID | Name | Category | IFSC Prefix |
|---------|------|----------|-------------|
| HDFC | HDFC Bank Limited | Private | HDFC |
| SBI | State Bank of India | Public | SBIN, SBIY |
| ICICI | ICICI Bank Limited | Private | ICIC |
| AXIS | Axis Bank Limited | Private | UTIB |
| KOTAK | Kotak Mahindra Bank | Private | KKBK |
| BOB | Bank of Baroda | Public | BARB |

> **Note:** This registry is designed to be extended. Additional banks can be added to `INDIAN_BANK_REGISTRY` array.

---

## Account Products

| Product Type | Description | Accounting Class |
|-------------|-------------|-----------------|
| savings | Standard savings account | Asset |
| salary | Employer payroll account | Asset |
| current | Business transaction account | Asset |
| cash | Physical cash | Asset |
| credit_card | Revolving credit facility | Liability |
| fixed_deposit | Term deposit | Asset |
| recurring_deposit | Monthly savings deposit | Asset |
| loan | Borrowing facility | Liability |
| demat | Securities holding account | Asset |

---

## Design Constraints

1. Banks are NOT assumed to offer every product
2. Bank-specific limits are only stated when sourced from that bank
3. Generic NPCI limits are clearly labeled as such
4. The AI layer reads from this registry — it does not invent rules
5. The registry is the single source of truth for all bank/limit guidance

---

## Staleness Policy

```typescript
export const RULE_STALENESS_DAYS = 90; // re-verify every 90 days

export function isRuleStale(rule: BankRule): boolean {
  const daysSince = (Date.now() - new Date(rule.verifiedAt).getTime()) / 86400000;
  return daysSince > RULE_STALENESS_DAYS;
}
```

If a rule is stale:
- It is NOT silently presented as current
- UI shows: "Verification required — verify current limits with your bank"
- The source URL is always provided so the user can verify directly
