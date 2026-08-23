import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Decimal } from 'decimal.js';
import { recordFinancialTransaction, reverseFinancialTransaction } from '../src/lib/ledger/service.ts';
import { resolveSupportedAccountType } from '../src/lib/ai/capabilities.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const TEST_USER = '11111111-1111-4111-a111-111111111111';

// Test 1: Rules hook targets automation_rules table
test('REMEDIATION [BUG-001 & BUG-002]: use-rules hook strictly targets automation_rules schema table', () => {
  const rulesHookPath = path.join(process.cwd(), 'src', 'lib', 'hooks', 'use-rules.ts');
  assert.ok(fs.existsSync(rulesHookPath), 'use-rules.ts must exist');
  const code = fs.readFileSync(rulesHookPath, 'utf8');

  // Must query automation_rules, not classification_rules
  assert.match(code, /\.from\("automation_rules"\)/, 'Must query canonical automation_rules table');
  assert.doesNotMatch(code, /classification_rules/, 'Must NOT query nonexistent classification_rules table');
});

// Test 2: Dialog component uses Radix UI and explicitly types close buttons as button
test('REMEDIATION [BUG-001]: Dialog uses Radix UI and prevents implicit form submissions on close buttons', () => {
  const dialogPath = path.join(process.cwd(), 'src', 'components', 'ui', 'dialog.tsx');
  assert.ok(fs.existsSync(dialogPath), 'dialog.tsx must exist');
  const code = fs.readFileSync(dialogPath, 'utf8');

  // Must import Radix Dialog primitive
  assert.match(code, /@radix-ui\/react-dialog/, 'Dialog must use @radix-ui/react-dialog primitive');
  // Must set type="button" on DialogPrimitive.Close
  assert.match(code, /type="button"/, 'DialogPrimitive.Close must have type="button"');
  // Must export standard components
  assert.match(code, /export\s*\{\s*Dialog,\s*DialogPortal,\s*DialogOverlay,\s*DialogClose,\s*DialogTrigger,\s*DialogContent,\s*DialogHeader,\s*DialogFooter,\s*DialogTitle,\s*DialogDescription/);
});

// Test 3: AI endpoints use canonical Gemini models
test('REMEDIATION [BUG-003]: AI routes use canonical Google Gemini model IDs', () => {
  const chatRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'chat', 'route.ts');
  const categorizeRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'ai', 'categorize', 'route.ts');
  const insightsRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'ai', 'insights', 'route.ts');

  const chatCode = fs.readFileSync(chatRoutePath, 'utf8');
  const categorizeCode = fs.readFileSync(categorizeRoutePath, 'utf8');
  const insightsCode = fs.readFileSync(insightsRoutePath, 'utf8');

  assert.match(chatCode, /gemini-3\.6-flash/, 'Chat route must use gemini-3.6-flash');
  assert.doesNotMatch(chatCode, /gemini-3\.5-flash-lite/, 'Chat route must NOT use nonexistent gemini-3.5-flash-lite');

  assert.match(categorizeCode, /gemini-3\.6-flash/, 'Categorize route must use gemini-3.6-flash');
  assert.doesNotMatch(categorizeCode, /gemini-3\.5-flash-lite/, 'Categorize route must NOT use nonexistent gemini-3.5-flash-lite');

  assert.match(insightsCode, /gemini-3\.6-flash/, 'Insights route must use gemini-3.6-flash');
  assert.doesNotMatch(insightsCode, /gemini-3\.5-flash-lite/, 'Insights route must NOT use nonexistent gemini-3.5-flash-lite');
});

// Test 4: Companion Drawer stream resilience
test('REMEDIATION [BUG-003]: Companion drawer validates empty stream and preserves partial tokens on disconnect', () => {
  const drawerPath = path.join(process.cwd(), 'src', 'components', 'ai', 'companion-drawer.tsx');
  const code = fs.readFileSync(drawerPath, 'utf8');

  // Must check for empty stream
  assert.match(code, /fullContent\.trim\(\)\.length === 0/, 'Must detect empty stream');
  // Must preserve partial content in catch handler
  assert.match(code, /partialContent/, 'Must preserve partial tokens on connection drop');
  // Must handle 429 and 503 status
  assert.match(code, /response\.status === 429/, 'Must handle 429 status');
  assert.match(code, /response\.status === 503/, 'Must handle 503 status');
});

// Test 5: React Query Cache Key Normalization
test('REMEDIATION [BUG-008]: React Query cache keys are normalized to hyphenated dashboard-stats', () => {
  const txHookPath = path.join(process.cwd(), 'src', 'lib', 'hooks', 'use-transactions.ts');
  const peopleHookPath = path.join(process.cwd(), 'src', 'lib', 'hooks', 'use-people.ts');
  const importHookPath = path.join(process.cwd(), 'src', 'lib', 'hooks', 'use-import.ts');

  const txCode = fs.readFileSync(txHookPath, 'utf8');
  const peopleCode = fs.readFileSync(peopleHookPath, 'utf8');
  const importCode = fs.readFileSync(importHookPath, 'utf8');

  assert.doesNotMatch(txCode, /queryKey:\s*\['dashboard_stats'\]/, 'use-transactions must not use underscore dashboard_stats');
  assert.doesNotMatch(peopleCode, /queryKey:\s*\['dashboard_stats'\]/, 'use-people must not use underscore dashboard_stats');
  assert.doesNotMatch(importCode, /queryKey:\s*\['dashboard_stats'\]/, 'use-import must not use underscore dashboard_stats');

  assert.match(txCode, /queryKey:\s*\['dashboard-stats'\]/, 'use-transactions must use hyphenated dashboard-stats');
  assert.match(peopleCode, /queryKey:\s*\['dashboard-stats'\]/, 'use-people must use hyphenated dashboard-stats');
  assert.match(importCode, /queryKey:\s*\['dashboard-stats'\]/, 'use-import must use hyphenated dashboard-stats');
});

// Test 6: Investment Creation Mutation and Form Integration
test('REMEDIATION [BUG-008]: useCreateInvestment hook exists and is used in InvestmentForm for cache invalidation', () => {
  const invHookPath = path.join(process.cwd(), 'src', 'lib', 'hooks', 'use-investments.ts');
  const formPath = path.join(process.cwd(), 'src', 'components', 'investments', 'investment-form.tsx');

  const invCode = fs.readFileSync(invHookPath, 'utf8');
  const formCode = fs.readFileSync(formPath, 'utf8');

  assert.match(invCode, /export function useCreateInvestment\(\)/, 'use-investments must export useCreateInvestment');
  assert.match(invCode, /queryClient\.invalidateQueries\(\{\s*queryKey:\s*\['investments'\]\s*\}\)/, 'Must invalidate investments query');
  assert.match(formCode, /useCreateInvestment\(\)/, 'InvestmentForm must use useCreateInvestment hook');
});

// Test 7: Double-Entry Balancing Invariant & Exact Paise Precision
test('FINANCIAL INTEGRITY: Double-Entry posting enforces Debit === Credit and exact paise precision', async () => {
  const state: any = {
    accounts: [
      { id: 'acc-1', user_id: TEST_USER, name: 'HDFC Bank', type: 'bank', current_balance: 10000, balance: 10000 },
      { id: 'acc-2', user_id: TEST_USER, name: 'Zerodha Demat', type: 'investment', current_balance: 50000, balance: 50000 },
    ],
    ledger_accounts: [
      { id: 'la-bank', user_id: TEST_USER, code: 'AST-ACC-acc-1', name: 'HDFC', account_type: 'asset', entity_type: 'account', entity_id: 'acc-1' },
      { id: 'la-demat', user_id: TEST_USER, code: 'AST-ACC-acc-2', name: 'Zerodha', account_type: 'asset', entity_type: 'account', entity_id: 'acc-2' },
    ],
    journal_entries: [],
    journal_lines: [],
    ledger_audit_log: [],
    transactions: [],
  };

  const mockDb: any = {
    auth: { getUser: async () => ({ data: { user: { id: TEST_USER } }, error: null }) },
    from: (table: string) => {
      const data = state[table] || [];
      const filters: Array<(r: any) => boolean> = [];
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: any) => { filters.push((r: any) => r[col] === val); return builder; },
        limit: () => builder,
        order: () => builder,
        ilike: () => builder,
        maybeSingle: async () => ({ data: data.filter((r: any) => filters.every(f => f(r)))[0] || null, error: null }),
        single: async () => {
          const matched = data.filter((r: any) => filters.every(f => f(r)))[0];
          return matched ? { data: matched, error: null } : { data: null, error: { message: 'Not found' } };
        },
        insert: (rows: any) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          arr.forEach((r: any) => {
            const rowWithId = { id: r.id || `gen-${Date.now()}-${Math.random()}`, ...r };
            data.push(rowWithId);
          });
          return {
            select: () => ({
              single: async () => ({ data: arr[0], error: null }),
            }),
          };
        },
        update: (updates: any) => ({
          eq: (col: string, val: any) => ({
            eq: (col2: string, val2: any) => ({
              select: () => ({
                single: async () => {
                  const target = data.find((r: any) => r[col] === val && r[col2] === val2);
                  if (target) Object.assign(target, updates);
                  return { data: target, error: null };
                },
              }),
            }),
          }),
        }),
      };
      return builder;
    },
    rpc: async (fn: string, params: any) => {
      if (fn === 'post_journal_entry') {
        const lines = params.p_lines;
        const totalDebit = lines.reduce((sum: Decimal, l: any) => sum.plus(l.debit_amount || 0), new Decimal(0));
        const totalCredit = lines.reduce((sum: Decimal, l: any) => sum.plus(l.credit_amount || 0), new Decimal(0));

        if (!totalDebit.equals(totalCredit)) {
          return { data: null, error: { message: `Unbalanced entry: Debits ${totalDebit} != Credits ${totalCredit}` } };
        }

        const entryId = `je-${Date.now()}`;
        state.journal_entries.push({
          id: entryId,
          user_id: params.p_user_id,
          description: params.p_description,
          idempotency_key: params.p_idempotency_key,
          status: 'posted',
        });

        lines.forEach((l: any) => {
          state.journal_lines.push({
            id: `jl-${Math.random()}`,
            journal_entry_id: entryId,
            ledger_account_id: l.ledger_account_id,
            debit_amount: l.debit_amount,
            credit_amount: l.credit_amount,
            user_id: params.p_user_id,
          });
        });

        return { data: entryId, error: null };
      }
      return { data: null, error: { message: 'Unknown RPC' } };
    },
  };

  // Execute valid transfer (₹46,000.50)
  const postRes = await recordFinancialTransaction(mockDb, {
    userId: TEST_USER,
    type: 'transfer',
    accountId: 'acc-1',
    toAccountId: 'acc-2',
    amount: '46000.50',
    date: '2026-08-20',
    description: 'Fund Demat for IPO',
    idempotencyKey: 'TEST:TRANSFER:001',
    sourceType: 'manual',
  });

  assert.equal(postRes.success, true, 'Transfer must succeed');
  assert.ok(postRes.journalEntryId, 'Must return journalEntryId');

  // Verify journal lines balance
  const entryLines = state.journal_lines.filter((l: any) => l.journal_entry_id === postRes.journalEntryId);
  assert.equal(entryLines.length, 2, 'Transfer must produce exactly 2 lines');

  const totalDebit = entryLines.reduce((sum: Decimal, l: any) => sum.plus(l.debit_amount || 0), new Decimal(0));
  const totalCredit = entryLines.reduce((sum: Decimal, l: any) => sum.plus(l.credit_amount || 0), new Decimal(0));

  assert.equal(totalDebit.toFixed(2), '46000.50');
  assert.equal(totalCredit.toFixed(2), '46000.50');
  assert.equal(totalDebit.equals(totalCredit), true, 'Debit must exactly equal Credit');

  // Reject fractional sub-paise amount (e.g. 46000.505)
  const invalidRes = await recordFinancialTransaction(mockDb, {
    userId: TEST_USER,
    type: 'expense',
    accountId: 'acc-1',
    amount: '46000.505',
    date: '2026-08-20',
    description: 'Sub-paise invalid',
    idempotencyKey: 'TEST:SUBPAISE:001',
    sourceType: 'manual',
  });

  assert.equal(invalidRes.success, false, 'Sub-paise amount must be rejected');
});
