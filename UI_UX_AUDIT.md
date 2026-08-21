# NISFLOW FINANCE — UI/UX & DESIGN SYSTEM AUDIT

**Date:** 2026-08-20  
**Auditor:** Principal UX Architect & Mobile Engineer  
**Scope:** Visual Hierarchy, Interactive States, Design System Primitives, Screen-by-Screen User Experience, Navigation, and Modals.

---

## 1. Visual Hierarchy & Design System Cohesion

### 1.1 Color, Elevation, and Dark Mode
- **Palette**: The app uses zinc/slate dark-mode base tokens (`bg-background: #09090b`, `card: #18181b`, `primary: #22c55e / #16a34a`).
- **Contrast**: Text contrast meets WCAG AA (4.5:1) for primary text (`text-foreground`), but secondary metadata (`text-[10px] text-muted-foreground`) occasionally falls around 3.8:1 on disabled cards.
- **Elevation**: Shadow layers are subtle (`shadow-sm`) with 1px border dividers (`border-border`).

### 1.2 Interactive Primitives (`src/components/ui/`)
- **Button (`src/components/ui/button.tsx`)**:
  - `asChild` prop is declared in `ButtonProps` but NOT implemented with `@radix-ui/react-slot`. When using `<Button asChild><Link ...></Button>`, it creates invalid nested `<button><a>` DOM elements.
- **DropdownMenu (`src/components/ui/dropdown-menu.tsx`)**:
  - Re-implemented with custom React Context and plain divs rather than using the installed `@radix-ui/react-dropdown-menu` package. Lacks collision detection, keyboard arrow navigation, and portal rendering.
- **Tabs (`src/components/ui/tabs.tsx`)**:
  - Custom context wrapper. `TabsList` lacks `role="tablist"` ARIA markup.
- **Currency Input (`src/components/ui/currency-input.tsx`)**:
  - Formats correctly with ₹ prefix and comma grouping via `Intl.NumberFormat('en-IN')`. Handles paise decimals cleanly.

---

## 2. Screen-by-Screen UX Findings

### 2.1 Dashboard (`/dashboard`)
- **5-Second Comprehension**: High. Net Worth, Liquid Cash, and Debt cards are immediately visible.
- **Money Flow & Spending Charts**: Render properly with responsive containers. Empty states are styled cleanly.
- **Recent Transactions Widget**: Displays last 5 transactions with direct navigation to full transaction list.

### 2.2 Accounts (`/accounts`)
- **Defect [FIN-001]**: Net worth header calculates total using `account.balance`, whereas individual account cards display `account.current_balance`. If columns differ, the top total does not equal the sum of the cards below.

### 2.3 Investments & Loans (`/investments`, `/loans`)
- **Critical Layout Defect [UI-003]**: In `src/app/(dashboard)/investments/page.tsx` and `loans/page.tsx`, the primary Add button `<Dialog>` is passed as `children` to `<PageHeader>`. However, `PageHeader` only renders `actions?: React.ReactNode`, causing the primary call-to-action button to be omitted from the header layout.

### 2.4 Transactions (`/transactions`)
- **Summary Bar**: Displays Total Inflow, Total Outflow, Net Balance.
- **Filters**: Account, category, type, date range, search, reconciliation status.
- **Pagination**: Dual pagination controls (table footer and external page selector) can cause double pagination confusion.

### 2.5 People & Counterparties (`/people`, `/people/[id]`)
- **People Ledger**: Clear visual indicators for `THEY OWE YOU` (emerald) vs `YOU OWE THEM` (rose).
- **Repayment & WhatsApp Reminders**: Direct action buttons are discoverable and work smoothly.

### 2.6 Documents (`/documents`)
- **Defect [UI-004]**: `UploadDialog` uses an ad-hoc custom modal with fixed positioning rather than the design system's Radix `Dialog` component. Lacks scroll-lock on background content.

### 2.7 AI Companion (`CompanionDrawer`)
- **Virtual Keyboard Behavior**: On mobile devices with the on-screen keyboard open, the action confirmation card can be partially obscured by the sticky input bar.

---

## 3. UI/UX Remediation Summary

| ID | Component / Route | Severity | Remediation |
|---|---|---|---|
| **UI-001** | `src/components/ui/button.tsx` | P2 | Import `Slot` from `@radix-ui/react-slot` to support `asChild`. |
| **UI-002** | `src/components/layout/header.tsx` | P2 | Replace custom user dropdown with Radix `DropdownMenu`. |
| **UI-003** | `investments/page.tsx`, `loans/page.tsx` | P1 | Pass creation dialogs into `actions={<Dialog ... />}` prop of `PageHeader`. |
| **UI-004** | `src/components/documents/upload-dialog.tsx` | P3 | Migrate custom modal to Radix `Dialog`. |
| **UI-005** | `src/components/ai/companion-drawer.tsx` | P2 | Use dynamic viewport height (`100dvh`) and scroll active action cards into view. |
