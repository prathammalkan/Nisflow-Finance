import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Decimal from 'decimal.js';

// ==============================================================================
// 1. NAV-001: GLOBAL NAVIGATION - LOANS PRESENCE & STRUCTURE
// ==============================================================================
test('NAV-001: Sidebar navigation includes Loans route under Finance with Landmark icon', () => {
  const sidebarFile = fs.readFileSync(
    path.join(process.cwd(), 'src/components/layout/sidebar.tsx'),
    'utf-8'
  );

  assert.match(sidebarFile, /Landmark/i, 'Landmark icon must be imported and used');
  assert.match(
    sidebarFile,
    /{\s*name:\s*["']Loans["'],\s*href:\s*["']\/loans["'],\s*icon:\s*Landmark\s*}/,
    'Loans navigation item must be defined with href /loans and icon Landmark'
  );
  assert.match(
    sidebarFile,
    /title:\s*["']Finance["'][\s\S]*?name:\s*["']Loans["']/,
    'Loans must be situated under the Finance navigation section'
  );
});

// ==============================================================================
// 2. LAY-001: TABLET / DESKTOP BREAKPOINT ALIGNMENT
// ==============================================================================
test('LAY-001: AppShell content padding aligns with Sidebar md breakpoint (no tablet occlusion)', () => {
  const appShellFile = fs.readFileSync(
    path.join(process.cwd(), 'src/components/layout/app-shell.tsx'),
    'utf-8'
  );
  const sidebarFile = fs.readFileSync(
    path.join(process.cwd(), 'src/components/layout/sidebar.tsx'),
    'utf-8'
  );

  // Sidebar appears at md (768px)
  assert.match(sidebarFile, /md:translate-x-0/, 'Sidebar must expand at md breakpoint');

  // AppShell must pad at md (768px), NOT lg (1024px)
  assert.match(
    appShellFile,
    /collapsed\s*\?\s*["']md:pl-\[72px\]["']\s*:\s*["']md:pl-\[260px\]["']/,
    'AppShell must apply md:pl-[260px] to prevent tablet viewport occlusion under fixed sidebar'
  );
  assert.doesNotMatch(
    appShellFile,
    /lg:pl-\[260px\]/,
    'AppShell must not use lg:pl-[260px] which causes tablet clipping'
  );
});

// ==============================================================================
// 3. DAT-001: ACCOUNT METADATA PERSISTENCE (INSTITUTION, PURPOSE, COLOR)
// ==============================================================================
test('DAT-001: Database schema and account form persist institution, purpose, and color', () => {
  const dbTypesFile = fs.readFileSync(
    path.join(process.cwd(), 'src/types/database.ts'),
    'utf-8'
  );
  const accountFormFile = fs.readFileSync(
    path.join(process.cwd(), 'src/components/accounts/account-form.tsx'),
    'utf-8'
  );
  const initialSchemaFile = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/001_initial_schema.sql'),
    'utf-8'
  );

  // 1. Verify columns genuinely exist in canonical SQL schema
  assert.match(initialSchemaFile, /institution\s+TEXT/, 'SQL schema must define institution');
  assert.match(initialSchemaFile, /purpose\s+TEXT/, 'SQL schema must define purpose');
  assert.match(initialSchemaFile, /color\s+TEXT/, 'SQL schema must define color');

  // 2. Verify database.ts accounts type defines metadata columns
  assert.match(dbTypesFile, /institution\?:\s*string\s*\|\s*null/, 'database.ts must include institution in accounts table');
  assert.match(dbTypesFile, /purpose\?:\s*string\s*\|\s*null/, 'database.ts must include purpose in accounts table');
  assert.match(dbTypesFile, /color\?:\s*string\s*\|\s*null/, 'database.ts must include color in accounts table');

  // 3. Verify AccountForm passes metadata on create
  assert.match(
    accountFormFile,
    /createAccount\.mutateAsync\([\s\S]*?institution:\s*data\.institution/m,
    'createAccount mutation must pass institution'
  );
  assert.match(
    accountFormFile,
    /createAccount\.mutateAsync\([\s\S]*?purpose:\s*data\.purpose/m,
    'createAccount mutation must pass purpose'
  );
  assert.match(
    accountFormFile,
    /createAccount\.mutateAsync\([\s\S]*?color:\s*data\.color/m,
    'createAccount mutation must pass color'
  );

  // 4. Verify AccountForm passes metadata on update
  assert.match(
    accountFormFile,
    /updateAccount\.mutateAsync\([\s\S]*?institution:\s*data\.institution/m,
    'updateAccount mutation must pass institution'
  );
  assert.match(
    accountFormFile,
    /updateAccount\.mutateAsync\([\s\S]*?purpose:\s*data\.purpose/m,
    'updateAccount mutation must pass purpose'
  );
  assert.match(
    accountFormFile,
    /updateAccount\.mutateAsync\([\s\S]*?color:\s*data\.color/m,
    'updateAccount mutation must pass color'
  );
});

// ==============================================================================
// 4. UI-001: ACCOUNT DETAIL TRANSACTION HISTORY INTEGRATION
// ==============================================================================
test('UI-001: Account detail page renders real transaction history without placeholder text', () => {
  const accountDetailFile = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/accounts/[id]/page.tsx'),
    'utf-8'
  );

  // Placeholder must be gone
  assert.doesNotMatch(
    accountDetailFile,
    /Transactions component will be integrated here/i,
    'Developer placeholder text must be completely removed'
  );

  // Must query transactions for account
  assert.match(
    accountDetailFile,
    /useTransactions\(\{\s*account_id:\s*id/m,
    'Account detail page must query transactions filtered by account_id'
  );

  // Must have desktop table and mobile cards
  assert.match(accountDetailFile, /hidden md:block/, 'Must render desktop table');
  assert.match(accountDetailFile, /md:hidden/, 'Must render mobile transaction cards');
  assert.match(accountDetailFile, /formatINR/, 'Must format currency using formatINR');
});

// ==============================================================================
// 5. UI-002: TRANSACTION EDIT MODAL AND ROW ACTIONS
// ==============================================================================
test('UI-002: TransactionForm supports edit mode and row actions open the edit modal', () => {
  const txFormFile = fs.readFileSync(
    path.join(process.cwd(), 'src/components/transactions/transaction-form.tsx'),
    'utf-8'
  );
  const rowActionsFile = fs.readFileSync(
    path.join(process.cwd(), 'src/components/transactions/transaction-row-actions.tsx'),
    'utf-8'
  );
  const detailFile = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/transactions/[id]/page.tsx'),
    'utf-8'
  );

  // TransactionForm must accept transaction prop and support updateTransaction
  assert.match(txFormFile, /useUpdateTransaction/, 'TransactionForm must use useUpdateTransaction');
  assert.match(txFormFile, /transaction\?:/m, 'TransactionForm must accept optional transaction prop');
  assert.match(txFormFile, /isEditing \? ['"]Edit Transaction['"] : ['"]Add Transaction['"]/, 'Dialog title must reflect edit mode');

  // Row actions and detail page must connect Edit to TransactionForm
  assert.match(rowActionsFile, /<TransactionForm[\s\S]*?open=\{isEditOpen\}[\s\S]*?transaction=\{transaction\}/m, 'Row actions must mount TransactionForm in edit mode');
  assert.match(detailFile, /<TransactionForm[\s\S]*?open=\{isEditOpen\}[\s\S]*?transaction=\{transaction\}/m, 'Transaction detail page must mount TransactionForm in edit mode');
});

// ==============================================================================
// 6. MOB-001: MOBILE TRANSACTION CARDS INTERACTION
// ==============================================================================
test('MOB-001: Transactions page mobile cards provide navigation link and action menu', () => {
  const txPageFile = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/transactions/page.tsx'),
    'utf-8'
  );

  assert.match(
    txPageFile,
    /Link\s+href=\{`\/transactions\/\$\{tx\.id\}`\}/,
    'Mobile transaction cards must link to transaction detail view'
  );
  assert.match(
    txPageFile,
    /<TransactionRowActions\s+transaction=\{tx\}\s*\/>/,
    'Mobile transaction cards must render TransactionRowActions menu'
  );
});

// ==============================================================================
// 7. MOB-002: RECEIVABLES / PAYABLES RESPONSIVE MOBILE PRESENTATION
// ==============================================================================
test('MOB-002: Receivables and Payables pages contain responsive mobile card views', () => {
  const recFile = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/receivables/page.tsx'),
    'utf-8'
  );
  const payFile = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/payables/page.tsx'),
    'utf-8'
  );

  // Receivables responsive layout
  assert.match(recFile, /hidden md:block/, 'Receivables must have hidden md:block for desktop table');
  assert.match(recFile, /md:hidden/, 'Receivables must have md:hidden for mobile card list');
  assert.match(recFile, /openWhatsAppReminder/, 'Mobile receivables must expose WhatsApp reminder action');

  // Payables responsive layout
  assert.match(payFile, /hidden md:block/, 'Payables must have hidden md:block for desktop table');
  assert.match(payFile, /md:hidden/, 'Payables must have md:hidden for mobile card list');
  assert.match(payFile, /PageHeader/, 'Payables must use PageHeader component');
});

// ==============================================================================
// 8. PERF-001: RECONCILIATION ATOMICITY & SERVER ACTION ROLLBACK
// ==============================================================================
test('PERF-001: Reconciliation server action provides tenant isolation, batch execution, and rollback', () => {
  const recActionFile = fs.readFileSync(
    path.join(process.cwd(), 'src/app/actions/reconciliation.ts'),
    'utf-8'
  );
  const recPageFile = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/reconciliation/page.tsx'),
    'utf-8'
  );

  // Server Action validation & security
  assert.match(recActionFile, /'use server'/, 'reconciliation action must be a use server action');
  assert.match(recActionFile, /auth\.getUser\(\)/, 'Must authenticate session caller on server');
  assert.match(recActionFile, /\.eq\('user_id',\s*user\.id\)/, 'Must enforce tenant isolation on transactions and accounts');
  assert.match(recActionFile, /successfullyUpdatedBankIds/, 'Must track updated bank items for rollback');

  // Reconciliation page must delegate to executeReconciliationServer
  assert.match(recPageFile, /executeReconciliationServer/, 'Reconciliation page must call executeReconciliationServer');
});

// ==============================================================================
// 9. UX-001: REMOVAL OF NATIVE ALERT/CONFIRM & ADOPTION OF CONFIRMDIALOG
// ==============================================================================
test('UX-001: All browser alert() and confirm() calls are replaced with ConfirmDialog / toast', () => {
  const filesToCheck = [
    'src/app/(dashboard)/accounts/[id]/page.tsx',
    'src/app/(dashboard)/documents/page.tsx',
    'src/app/(dashboard)/recurring/page.tsx',
    'src/app/(dashboard)/rules/page.tsx',
    'src/app/(dashboard)/transactions/[id]/page.tsx',
    'src/components/savings/savings-goal-form.tsx',
    'src/components/transactions/transaction-row-actions.tsx',
    'src/components/rules/rule-form.tsx',
  ];

  for (const relativePath of filesToCheck) {
    const content = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8');
    assert.doesNotMatch(content, /\bwindow\.confirm\s*\(/, `${relativePath} must not use window.confirm`);
    assert.doesNotMatch(content, /(?<!\w)confirm\s*\(/, `${relativePath} must not use confirm()`);
    assert.doesNotMatch(content, /\balert\s*\(/, `${relativePath} must not use alert()`);
  }

  const confirmDialogPath = path.join(process.cwd(), 'src/components/ui/confirm-dialog.tsx');
  assert.ok(fs.existsSync(confirmDialogPath), 'src/components/ui/confirm-dialog.tsx must exist');
});

// ==============================================================================
// 10. LOG-001: SPENDING ANALYSIS "THIS MONTH" DATE FILTERING
// ==============================================================================
test('LOG-001: Spending analysis filters largestTransactions strictly to active calendar month', () => {
  const spendingFile = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/spending/page.tsx'),
    'utf-8'
  );

  assert.match(
    spendingFile,
    /txDate\.getFullYear\(\)\s*===\s*currentYear\s*&&\s*txDate\.getMonth\(\)\s*===\s*currentMonth/,
    'Spending analysis must filter largestTransactions by both current year and current month'
  );

  // Behavioral test for month boundary logic
  const now = new Date(2026, 7, 21); // Aug 2026
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const sampleTransactions = [
    { id: '1', amount: 5000, direction: 'out', date: '2026-08-10T10:00:00Z' }, // This month
    { id: '2', amount: 15000, direction: 'out', date: '2026-07-25T10:00:00Z' }, // Last month (should be excluded)
    { id: '3', amount: 3000, direction: 'out', date: '2026-08-01T10:00:00Z' }, // This month
    { id: '4', amount: 20000, direction: 'in', date: '2026-08-05T10:00:00Z' }, // Income (should be excluded)
    { id: '5', amount: 12000, direction: 'out', date: '2025-08-10T10:00:00Z' }, // Last year (should be excluded)
  ];

  const filtered = sampleTransactions
    .filter(tx => {
      if (tx.direction !== 'out') return false;
      const txDate = new Date(tx.date);
      return txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth;
    })
    .sort((a, b) => b.amount - a.amount);

  assert.equal(filtered.length, 2, 'Must only include 2 expenses from current month');
  assert.equal(filtered[0].id, '1', 'Largest current month expense must be first');
  assert.equal(filtered[1].id, '3', 'Second largest current month expense must be second');
});

// ==============================================================================
// 11. A11Y-001: ACCESSIBLE PASSWORD VISIBILITY TOGGLES
// ==============================================================================
test('A11Y-001: Login and Register password toggles have aria-label and accessible focus', () => {
  const loginFile = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(auth)/login/page.tsx'),
    'utf-8'
  );
  const registerFile = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(auth)/register/page.tsx'),
    'utf-8'
  );

  // Login page
  assert.match(loginFile, /aria-label=\{showPassword\s*\?\s*["']Hide password["']\s*:\s*["']Show password["']\}/, 'Login password toggle must have aria-label');
  assert.match(loginFile, /focus-visible:ring-2/, 'Login password toggle must have visible focus styling');
  assert.doesNotMatch(loginFile, /tabIndex=\{-1\}/, 'Login password toggle must not be removed from tab order');

  // Register page
  assert.match(registerFile, /aria-label=\{showPassword\s*\?\s*["']Hide password["']\s*:\s*["']Show password["']\}/, 'Register password toggle must have aria-label');
  assert.match(registerFile, /focus-visible:ring-2/, 'Register password toggle must have visible focus styling');
  assert.doesNotMatch(registerFile, /tabIndex=\{-1\}/, 'Register password toggle must not be removed from tab order');
});
