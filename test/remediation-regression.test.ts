/**
 * NisFlow Finance — Regression Tests for Phase 0 Remediation
 *
 * Covers:
 *   - Tabs accessibility (role=tablist, keyboard nav, aria attributes)
 *   - Dropdown Menu Radix migration (API surface preserved)
 *   - Upload Dialog Radix migration (API, form reset, aria)
 *   - Sidebar accessibility (aria-label, aria-expanded, aria-controls)
 *   - Category schema consolidation (transaction_categories, not categories)
 *   - People Ledger single-query RPC with fallback
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readSrc(...parts: string[]): string {
  return readFileSync(path.join(root, 'src', ...parts), 'utf8');
}

function readMigration(name: string): string {
  return readFileSync(path.join(root, 'supabase', 'migrations', name), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. TABS ACCESSIBILITY
// ---------------------------------------------------------------------------
describe('TABS A11Y', () => {
  const tabs = readSrc('components', 'ui', 'tabs.tsx');

  test('TAB-001: TabsList has role="tablist"', () => {
    assert.ok(
      tabs.includes('role="tablist"'),
      'TabsList must have role="tablist" for WCAG WAI-ARIA tablist pattern'
    );
  });

  test('TAB-002: TabsTrigger has role="tab"', () => {
    assert.ok(tabs.includes('role="tab"'), 'TabsTrigger must have role="tab"');
  });

  test('TAB-003: TabsTrigger has aria-selected', () => {
    assert.ok(
      tabs.includes('aria-selected'),
      'TabsTrigger must declare aria-selected'
    );
  });

  test('TAB-004: TabsContent has role="tabpanel"', () => {
    assert.ok(
      tabs.includes('role="tabpanel"'),
      'TabsContent must have role="tabpanel"'
    );
  });

  test('TAB-005: TabsTrigger has aria-controls linking to panel id', () => {
    assert.ok(
      tabs.includes('aria-controls'),
      'TabsTrigger must have aria-controls to associate with its panel'
    );
  });

  test('TAB-006: TabsContent has aria-labelledby linking back to trigger', () => {
    assert.ok(
      tabs.includes('aria-labelledby'),
      'TabsContent must have aria-labelledby to associate with its trigger'
    );
  });

  test('TAB-007: ArrowRight keyboard navigation is implemented', () => {
    assert.ok(
      tabs.includes('ArrowRight'),
      'TabsList must handle ArrowRight for keyboard navigation'
    );
  });

  test('TAB-008: ArrowLeft keyboard navigation is implemented', () => {
    assert.ok(
      tabs.includes('ArrowLeft'),
      'TabsList must handle ArrowLeft for keyboard navigation'
    );
  });

  test('TAB-009: Home key moves to first tab', () => {
    assert.ok(tabs.includes('"Home"'), 'TabsList must handle Home key');
  });

  test('TAB-010: End key moves to last tab', () => {
    assert.ok(tabs.includes('"End"'), 'TabsList must handle End key');
  });

  test('TAB-011: TabsTrigger uses roving tabIndex (0 for active, -1 for inactive)', () => {
    assert.ok(
      tabs.includes('tabIndex={isActive ? 0 : -1}'),
      'TabsTrigger must use roving tabIndex for keyboard navigation'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. DROPDOWN MENU — RADIX MIGRATION
// ---------------------------------------------------------------------------
describe('DROPDOWN MENU RADIX', () => {
  const dd = readSrc('components', 'ui', 'dropdown-menu.tsx');

  test('DD-001: Uses @radix-ui/react-dropdown-menu', () => {
    assert.ok(
      dd.includes('@radix-ui/react-dropdown-menu'),
      'dropdown-menu.tsx must import from @radix-ui/react-dropdown-menu'
    );
  });

  test('DD-002: DropdownMenu is exported', () => {
    assert.ok(dd.includes('export const DropdownMenu'), 'DropdownMenu must be exported');
  });

  test('DD-003: DropdownMenuTrigger is exported', () => {
    assert.ok(dd.includes('export const DropdownMenuTrigger'), 'DropdownMenuTrigger must be exported');
  });

  test('DD-004: DropdownMenuContent is exported with Portal wrapper', () => {
    assert.ok(dd.includes('DropdownMenuPrimitive.Portal'), 'DropdownMenuContent must render inside a Portal for z-index isolation');
  });

  test('DD-005: DropdownMenuItem is exported', () => {
    assert.ok(dd.includes('export const DropdownMenuItem'), 'DropdownMenuItem must be exported');
  });

  test('DD-006: DropdownMenuLabel is exported', () => {
    assert.ok(dd.includes('export const DropdownMenuLabel'), 'DropdownMenuLabel must be exported');
  });

  test('DD-007: DropdownMenuSeparator is exported', () => {
    assert.ok(dd.includes('export const DropdownMenuSeparator'), 'DropdownMenuSeparator must be exported');
  });

  test('DD-008: No custom div-based fallback implementation remains', () => {
    // The old implementation created a div with relative inline-block positioning
    assert.ok(
      !dd.includes('relative inline-block text-left'),
      'Custom div-based dropdown implementation must be completely replaced'
    );
  });

  test('DD-009: header.tsx import API is unchanged (no breaking change)', () => {
    const header = readSrc('components', 'layout', 'header.tsx');
    assert.ok(
      header.includes("from \"@/components/ui/dropdown-menu\""),
      'header.tsx must still import from @/components/ui/dropdown-menu'
    );
    assert.ok(header.includes('DropdownMenu'), 'header.tsx must use DropdownMenu');
    assert.ok(header.includes('DropdownMenuTrigger'), 'header.tsx must use DropdownMenuTrigger');
    assert.ok(header.includes('DropdownMenuContent'), 'header.tsx must use DropdownMenuContent');
    assert.ok(header.includes('DropdownMenuItem'), 'header.tsx must use DropdownMenuItem');
  });
});

// ---------------------------------------------------------------------------
// 3. UPLOAD DIALOG — RADIX MIGRATION
// ---------------------------------------------------------------------------
describe('UPLOAD DIALOG RADIX', () => {
  const ud = readSrc('components', 'documents', 'upload-dialog.tsx');

  test('UD-001: Uses Radix Dialog primitives', () => {
    assert.ok(
      ud.includes("from '@/components/ui/dialog'"),
      'upload-dialog.tsx must import from design system Dialog'
    );
  });

  test('UD-002: DialogContent is used (provides focus trap and scroll-lock)', () => {
    assert.ok(ud.includes('DialogContent'), 'Must use DialogContent for focus trap');
  });

  test('UD-003: DialogTrigger is used (proper trigger semantics)', () => {
    assert.ok(ud.includes('DialogTrigger'), 'Must use DialogTrigger');
  });

  test('UD-004: DialogTitle is present (WCAG: dialog must be labelled)', () => {
    assert.ok(ud.includes('DialogTitle'), 'Dialog must have DialogTitle for screen readers');
  });

  test('UD-005: No custom fixed-position overlay remains', () => {
    assert.ok(
      !ud.includes('fixed inset-0'),
      'Custom fixed-position overlay must be removed — Radix Dialog handles this'
    );
  });

  test('UD-006: onOpenChange resets form state (no stale file after close)', () => {
    assert.ok(
      ud.includes('resetForm'),
      'Dialog close handler must reset file/form state to prevent stale uploads'
    );
  });

  test('UD-007: File input has htmlFor/id pair (accessible label)', () => {
    assert.ok(
      ud.includes('htmlFor="doc-upload"') || ud.includes("htmlFor='doc-upload'"),
      'File input label must have matching htmlFor and id'
    );
    assert.ok(
      ud.includes('id="doc-upload"') || ud.includes("id='doc-upload'"),
      'File input must have matching id for label association'
    );
  });

  test('UD-008: Upload button is disabled while uploading (prevents double-submit)', () => {
    assert.ok(
      ud.includes('disabled={isPending || !file}'),
      'Upload button must be disabled while pending or when no file is selected'
    );
  });
});

// ---------------------------------------------------------------------------
// 4. SIDEBAR ACCESSIBILITY
// ---------------------------------------------------------------------------
describe('SIDEBAR A11Y', () => {
  const sidebar = readSrc('components', 'layout', 'sidebar.tsx');

  test('SB-001: Collapse button has aria-label', () => {
    assert.ok(
      sidebar.includes('aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}') ||
      sidebar.includes("aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}"),
      'Sidebar collapse button must have a descriptive aria-label'
    );
  });

  test('SB-002: Collapse button has aria-expanded', () => {
    assert.ok(
      sidebar.includes('aria-expanded={!collapsed}'),
      'Sidebar collapse button must declare aria-expanded to indicate state'
    );
  });

  test('SB-003: Collapse button has aria-controls pointing to nav', () => {
    assert.ok(
      sidebar.includes('aria-controls="sidebar-nav"'),
      'Sidebar collapse button must reference the nav with aria-controls'
    );
  });

  test('SB-004: Sidebar nav has matching id for aria-controls', () => {
    assert.ok(
      sidebar.includes('id="sidebar-nav"'),
      'Sidebar nav must have id="sidebar-nav" to match aria-controls'
    );
  });

  test('SB-005: Logout button has aria-label (not just title)', () => {
    assert.ok(
      sidebar.includes('aria-label="Sign out"'),
      'Logout button must have aria-label — title alone is insufficient for screen readers'
    );
  });
});

// ---------------------------------------------------------------------------
// 5. CATEGORY SCHEMA CONSOLIDATION
// ---------------------------------------------------------------------------
describe('CATEGORY SCHEMA', () => {
  const useCategories = readSrc('lib', 'hooks', 'use-categories.ts');
  const analytics = readSrc('lib', 'ledger', 'analytics.ts');

  test('CAT-001: use-categories.ts queries transaction_categories (canonical table)', () => {
    assert.ok(
      useCategories.includes("from('transaction_categories')"),
      'useCategories must query transaction_categories'
    );
  });

  test('CAT-002: use-categories.ts does NOT query categories (non-existent table)', () => {
    assert.ok(
      !useCategories.includes("from('categories')"),
      'useCategories must NOT query the non-existent categories table'
    );
  });

  test('CAT-003: Type reference is transaction_categories, not categories', () => {
    assert.ok(
      useCategories.includes("transaction_categories']"),
      'Type reference must be transaction_categories'
    );
    assert.ok(
      !useCategories.includes("'categories']['Row']"),
      'Stale categories type reference must be removed'
    );
  });

  test('CAT-004: analytics.ts queries transaction_categories (not categories)', () => {
    assert.ok(
      analytics.includes("from('transaction_categories')"),
      'analytics.ts must query transaction_categories'
    );
    assert.ok(
      !analytics.includes("from('categories')"),
      'analytics.ts must NOT query the non-existent categories table'
    );
  });
});

// ---------------------------------------------------------------------------
// 6. PEOPLE LEDGER — SINGLE-QUERY AGGREGATION
// ---------------------------------------------------------------------------
describe('PEOPLE LEDGER AGGREGATION', () => {
  const people = readSrc('lib', 'ledger', 'people.ts');
  const migration = readMigration('018_people_ledger_aggregation.sql');

  test('PL-001: getPeopleAuthoritativeSummary attempts RPC get_people_ledger_summary', () => {
    assert.ok(
      people.includes('get_people_ledger_summary'),
      'getPeopleAuthoritativeSummary must attempt the single-query RPC'
    );
  });

  test('PL-002: Has fallback for missing RPC (backward compatibility)', () => {
    assert.ok(
      people.includes('Fallback'),
      'Must have a fallback path for when the RPC is not yet available in production'
    );
  });

  test('PL-003: Migration 018 defines get_people_ledger_summary function', () => {
    assert.ok(
      migration.includes('CREATE OR REPLACE FUNCTION public.get_people_ledger_summary'),
      'Migration 018 must create the get_people_ledger_summary RPC'
    );
  });

  test('PL-004: Migration 018 rejects anonymous callers', () => {
    assert.ok(
      migration.includes("'anon'"),
      'Migration 018 RPC must reject anonymous callers'
    );
  });

  test('PL-005: Migration 018 enforces tenant isolation (auth.uid check)', () => {
    assert.ok(
      migration.includes('auth.uid()') && migration.includes('p_user_id'),
      'Migration 018 RPC must validate auth.uid() === p_user_id'
    );
  });

  test('PL-006: Migration 018 uses single JOIN query (not N loops)', () => {
    assert.ok(
      migration.includes('LEFT JOIN public.journal_lines'),
      'Migration 018 must use a single JOIN rather than procedural loops'
    );
  });

  test('PL-007: Migration 018 grants execute to authenticated only', () => {
    assert.ok(
      migration.includes('GRANT EXECUTE ON FUNCTION public.get_people_ledger_summary') &&
      migration.includes('TO authenticated'),
      'RPC must be granted to authenticated role only'
    );
    assert.ok(
      migration.includes('REVOKE EXECUTE'),
      'Must REVOKE from PUBLIC before granting to authenticated'
    );
  });

  test('PL-008: Migration 018 uses SECURITY DEFINER', () => {
    assert.ok(
      migration.includes('SECURITY DEFINER'),
      'RPC must be SECURITY DEFINER to run with elevated privileges securely'
    );
  });

  test('PL-009: Both receivable and payable entries included in posted AND reversed status', () => {
    assert.ok(
      migration.includes("'posted', 'reversed'") || migration.includes("IN ('posted', 'reversed')"),
      'Balance aggregation must include both posted and reversed entries for correct netting'
    );
  });
});
