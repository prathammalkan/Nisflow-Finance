# NISFLOW FINANCE — MOBILE & PWA AUDIT

**Date:** 2026-08-20  
**Auditor:** Mobile & Progressive Web Application Specialist  
**Scope:** PWA Manifest, Service Worker, Responsive Layouts, Touch Targets, iOS Safe Area Insets, and Viewport Behavior.

---

## 1. PWA Configuration

### 1.1 Web App Manifest
- **Manifest Location**: `src/app/manifest.ts` & `public/manifest.webmanifest`.
- **Properties**:
  - `name`: "NisFlow Finance"
  - `short_name`: "NisFlow"
  - `start_url`: "/dashboard"
  - `display`: "standalone"
  - `theme_color`: "#09090b"
  - `background_color`: "#09090b"
  - `icons`: 192x192 and 512x512 maskable and any icons configured.

### 1.2 Service Worker & Offline Support
- **Service Worker**: `public/sw.js` caches core static assets, app shell fonts, and fallback offline page.
- **Cache Strategy**: Stale-while-revalidate for static assets; network-first for API requests to ensure real-time financial data freshness.

---

## 2. Mobile Responsive Layout & Navigation

### 2.1 Navigation Structure
- **Desktop**: Collapsible left sidebar (`src/components/layout/sidebar.tsx`).
- **Mobile (< 768px)**: Bottom navigation bar (`src/components/layout/bottom-nav.tsx`) with 5 primary shortcuts (Dashboard, Transactions, People, Loans, More/Settings).
- **Floating Action Button**: Quick-add menu accessible from bottom navigation.

### 2.2 Touch Target Sizing (WCAG 2.5.5)
- All primary interactive elements in `bottom-nav.tsx` and main action buttons exceed the minimum 44x44px touch target.
- Secondary table row actions in `DataTable` are 36x36px on mobile and should be padded to 44px for optimal ergonomics.

### 2.3 Safe Area Insets & Notches
- `bottom-nav.tsx` includes `pb-safe` / `env(safe-area-inset-bottom)` padding to prevent home indicator overlap on iOS devices.
- `header.tsx` respects `pt-safe` / `env(safe-area-inset-top)`.

---

## 3. Mobile Findings & Remediation

| ID | Issue | Severity | File | Recommendation |
|---|---|---|---|---|
| **MOB-001** | Global search input hidden on mobile viewports without dedicated mobile trigger button. | P3 | `src/components/layout/header.tsx` | Add mobile search icon button to header that opens full-screen search dialog. |
| **MOB-002** | Virtual keyboard overlap in AI companion drawer on portrait phones. | P2 | `src/components/ai/companion-drawer.tsx` | Use `100dvh` and auto-scroll confirmation card above keyboard. |
| **MOB-003** | Horizontal scroll on wide financial tables (e.g. Reports, Tax Records). | P3 | `src/components/ui/data-table.tsx` | Wrap tables with sticky first column or card-based layout switch below 640px. |
