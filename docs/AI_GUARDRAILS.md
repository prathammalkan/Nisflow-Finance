# NisFlow Finance — AI Financial Guardian Guardrails

**Module:** `src/lib/ai/capabilities.ts`, `src/lib/ledger/ai-orchestrator.ts`
**Last Updated:** 2026-09-02

## Authority Levels

| Level | Name | Examples | Confirmation Required |
|-------|------|---------|----------------------|
| L0 | READ | balances, net worth, spending | No |
| L1 | PREPARE | financial plans, split calculations | No |
| L2 | NON_FINANCIAL_MUTATION | create account, create person, set budget | Yes |
| L3 | FINANCIAL_POSTING | expense, income, transfer, loan EMI | Yes (mandatory) |
| L4 | HIGH_RISK_DESTRUCTIVE | reversal, delete loan, reset data | Yes (strong) |

## What AI CAN Do

- Explain accounts, balances, transactions
- Warn about risks and compliance
- Recommend lawful strategies
- Ask clarifying questions for ambiguous transactions
- Prepare multi-step plans for review
- Calculate splits, tax comparisons, projections
- Classify transactions when intent is clear
- Summarize financial position across accounts
- Guide cross-account payment decisions

## What AI CANNOT Do

- Invent bank limits not in the bank registry
- Invent tax rules not in the tax engine
- Silently alter posted financial history
- Auto-classify ambiguous transactions without asking
- Bypass the confirmation requirement for L3/L4 actions
- Claim an action succeeded without database verification
- Execute L4 destructive operations autonomously
- Override the Transaction Guard clarification requirement
- Access another user's data

## Transaction Guard Integration

Before any L3 financial posting, the AI:
1. Calls `evaluateTransactionGuard()` on the description + amount
2. If `canProceed = false`, STOPS and asks the clarification questions
3. Does NOT assume gift/loan/income/expense on ambiguous descriptions
4. Presents a structured confirmation block before posting

## Ambiguous Transaction Examples

These ALWAYS require clarification — never auto-classified:

- "Papa gave me Rs 50,000" → gift from relative (exempt)? loan (liability)? return of earlier money?
- "Rahul sent Rs 80,000" → loan repayment (asset decrease)? gift? income?
- "I paid Rs 50,000 to BOB" → Bank of Baroda loan EMI? vendor payment? transfer?
- "I invested Rs 1 lakh" → which account? which asset? which broker?

## Cross-Account Guidance

When user asks "Which account should I use?", AI evaluates:
1. Available balances in each account
2. Account purpose and type
3. Bank/payment channel constraints (UPI limits, RTGS minimums)
4. Tax implications of funding from that account
5. Cash flow impact and existing commitments
6. Risk and documentation considerations

AI does NOT simply recommend the account with highest balance.

## Security Constraints

- System prompt non-disclosure rule in every request
- User data in XML boundary `<user_financial_data>...</user_financial_data>`
- `escapeForPrompt()` sanitizes all user strings before LLM injection
- Database UUIDs NOT exposed to LLM (index-based references)
- Rate limiting: 20 chat/60s, 60 categorize/60s, 15 insights/hr per user:IP
- Upstash Redis distributed rate limiter; fails closed to 503 on Redis failure
- AI actions validated server-side before execution — client cannot bypass

## Prompt Injection Protection

- XML injection prevented via `escapeForPrompt()` (HTML entity encoding)
- Prompt injection test suite: `test/security/06-ai-security-prompt-injection.test.ts`
- 6 injection test cases covering boundary violation, instruction override, role elevation
