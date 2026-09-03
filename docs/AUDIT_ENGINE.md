# NisFlow Finance — Audit Engine Reference

**Last Updated:** 2026-09-02

## Audit Trail Components

### 1. Ledger Audit Log (`ledger_audit_log`)
- SHA-256 hash of payload for tamper detection on every ledger event
- Records: event_type, journal_entry_id, payload_hash, payload_summary
- Immutable: no UPDATE/DELETE policies

### 2. Journal Entry Immutability
- `journal_lines` table: UPDATE and DELETE blocked by PostgreSQL trigger
- `prevent_journal_line_modification` trigger fires on any modification attempt
- Corrections use reversal entries only — never overwrites

### 3. Reversal Chain
- Each reversal references `reversal_of` UUID on the original entry
- Both original and reversal are retained in full
- Net effect is zero when reversed correctly

### 4. Monthly Closing Lock
- Closed periods prevent retroactive modification
- Enforced at RPC level

## Evidence Engine (`evidence_links` table)

Links documents to financial entities:

| Entity Type | Use Case |
|-------------|---------|
| transaction | Receipt or invoice for an expense/income |
| journal | Supporting document for ledger posting |
| loan | Loan agreement, EMI schedule, interest certificate |
| investment | Broker contract note, allotment advice |
| tax_record | Form 16, Form 16A, TDS certificate |
| ais_record | AIS import supporting document |

Each evidence link carries:
- `tax_year` — financial year relevance
- `tax_classification` — deduction_80c, tds_certificate, capital_gain_proof, etc.
- `audit_relevance` — why the document is kept
- `retention_until` — document retention deadline (minimum 6 years from AY)

## Document Storage Security

- Storage bucket: **private** (public = false)
- Path format: `{user_id}/{filename}` enforced by RLS
- Access: signed URLs only, 300 second TTL
- Upload limits: 10 MB max, PDF / PNG / JPEG / WEBP only
- No public access to document URLs ever

## AIS/TIS Reconciliation Audit Trail

- AIS data must come from the user's own IT Portal download
- Each AIS record tracks: `is_user_accepted`, `dispute_reason`, `is_resolved`
- Reconciliation mismatches are logged with severity and recommended action
- The system does NOT fabricate or modify AIS data

## Risk Flags Audit

- All risk flags stored in `risk_flags` table with full explanation
- Flags include: `detected_at`, `is_resolved`, `resolved_at`, `resolution_note`
- Resolution requires explicit user action — not auto-resolved

## Financial Data Reset Audit

- Reset is idempotent and transactional
- Before reset: full audit snapshot captured
- Reset operation: requires typed confirmation "RESET MY DATA" in UI
- L4 authority level — cannot be triggered by AI
- All reset events logged in `ledger_audit_log`

## Retention Policy

All financial records must be retained per Income Tax Act requirements:
- **Assessment records:** 6 years from relevant Assessment Year
- **Documents supporting deductions:** 6 years
- **Capital asset records:** Retained until 6 years after disposal
- NisFlow does NOT auto-delete financial history

## Audit Checklist for ITR Filing

1. Download Form 26AS from IT Portal
2. Download AIS from IT Portal
3. Compare with NisFlow interest income records
4. Verify TDS credits match Form 16A
5. Upload AIS to NisFlow for reconciliation
6. Resolve any mismatches before filing ITR
7. Ensure all large credits have documented source
8. Verify advance tax payments match Schedule IT in ITR
