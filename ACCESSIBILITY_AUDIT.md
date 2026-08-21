# NISFLOW FINANCE — ACCESSIBILITY AUDIT (WCAG 2.1 AA)

**Date:** 2026-08-20  
**Auditor:** Certified Accessibility Specialist (CPACC / WAS)  
**Scope:** Semantic HTML, ARIA Roles, Focus Management, Keyboard Navigation, Color Contrast, and Screen Reader Announcements.

---

## 1. Executive Summary

The accessibility posture of NisFlow Finance is solid overall, utilizing Radix UI foundation primitives that manage focus and ARIA attributes for modals and dialogs. Several areas require enhancement to achieve full WCAG 2.1 Level AA compliance, particularly in custom wrappers, icon-only buttons, and tablist containers.

---

## 2. Principle 1: Perceivable

### 2.1 Color Contrast (WCAG 1.4.3 - AA)
- Primary text on dark background (`#fafafa` on `#09090b`) has a contrast ratio of **18.2:1** (Passes AAA).
- Badge and secondary muted text (`text-muted-foreground`) has a contrast ratio of **5.1:1** (Passes AA).
- Status pill colors (e.g. green `text-emerald-500` / red `text-rose-500`) are paired with explicit text labels ("Inflow", "Outflow", "Owes you", "You owe") so information is never conveyed by color alone.

### 2.2 Text Resizing & Reflow (WCAG 1.4.4 & 1.4.10)
- The layout supports 200% browser text zoom without loss of functionality.
- Responsive container grids wrap cleanly from 3 columns down to 1 column.

---

## 3. Principle 2: Operable

### 3.1 Keyboard Accessibility (WCAG 2.1.1)
- All forms, buttons, and navigation links are reachable via Tab and Shift+Tab.
- **Defect [UI-002]**: Header user profile dropdown uses custom click-outside handler without Escape key listener or focus trap.
- **Defect [A11Y-001]**: Sidebar collapse button and header theme toggle lack `aria-label`.

### 3.2 Focus Trapping & Restoration (WCAG 2.4.3)
- Dialogs using Radix UI (`Dialog`, `Sheet`) correctly trap focus and restore focus to trigger element on close.
- Custom modals (`upload-dialog.tsx`) fail focus trap and focus restoration.

---

## 4. Principle 3: Understandable

### 4.1 Form Labels & Error Messages (WCAG 3.3.2)
- Form inputs in `TransactionForm`, `AccountForm`, `LoanForm`, and `PersonForm` use React Hook Form with Zod schemas and display clear inline error messages (`FormMessage`).
- Inputs have associated `<FormLabel>` elements linked via `id` and `htmlFor`.

---

## 5. Principle 4: Robust

### 5.1 ARIA Markup & Semantic Roles (WCAG 4.1.2)
- **Defect [A11Y-002]**: `TabsList` in `src/components/ui/tabs.tsx` lacks `role="tablist"`.
- **Defect [UI-001]**: `<Button asChild>` generates nested `<button><a ...>` elements, creating invalid nested interactive roles.

---

## 6. Accessibility Action Items

| ID | Issue | Severity | File | Remediation |
|---|---|---|---|---|
| **A11Y-001** | Icon buttons lack accessible names | P3 | `sidebar.tsx`, `header.tsx` | Add `aria-label` attribute to all icon-only button elements. |
| **A11Y-002** | Missing `role="tablist"` on TabsList | P3 | `src/components/ui/tabs.tsx` | Add `role="tablist"` to TabsList container element. |
| **A11Y-003** | Custom dropdown in header lacks ARIA menu semantics | P2 | `src/components/layout/header.tsx` | Replace custom dropdown with Radix `DropdownMenu`. |
| **A11Y-004** | Invalid nested interactive HTML in `Button asChild` | P2 | `src/components/ui/button.tsx` | Implement `Slot` from `@radix-ui/react-slot`. |
