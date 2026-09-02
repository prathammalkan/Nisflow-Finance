/**
 * NISFLOW FINANCE — AIS / TIS RECONCILIATION FOUNDATION
 *
 * Architecture to reconcile:
 *   - Bank records
 *   - TDS certificates (Form 16 / Form 16A)
 *   - Interest certificates
 *   - Investment records
 *   - AIS (Annual Information Statement) — from IT Portal
 *   - TIS (Taxpayer Information Summary) — from IT Portal
 *   - Tax records (ITR filed)
 *
 * IMPORTANT:
 *   - AIS/TIS data comes from the Income Tax Portal (external).
 *   - This system does NOT fabricate AIS/TIS data.
 *   - Unavailable external data is clearly marked as such.
 *   - Mismatches are flagged for user review — not auto-corrected.
 *
 * @module ais-tis-reconciliation
 */

// --- Types --------------------------------------------------------------------

export type AISTransactionType =
  | 'salary'
  | 'interest_savings'
  | 'interest_fd'
  | 'dividend'
  | 'securities_purchase'
  | 'securities_sale'
  | 'mutual_fund_purchase'
  | 'mutual_fund_sale'
  | 'ipo_application'
  | 'advance_tax'
  | 'self_assessment_tax'
  | 'tds_salary'
  | 'tds_interest'
  | 'tds_other'
  | 'cash_deposit'
  | 'foreign_remittance'
  | 'property_purchase'
  | 'property_sale';

export type DataSource =
  | 'bank'
  | 'employer'
  | 'broker'
  | 'mca'
  | 'gstn'
  | 'registrar'
  | 'nsdl'
  | 'cdsl'
  | 'npci'
  | 'it_portal';

export type MismatchType =
  | 'amount_mismatch'
  | 'present_in_ais_not_books'
  | 'present_in_books_not_ais'
  | 'date_mismatch'
  | 'counterparty_mismatch'
  | 'classification_mismatch';

export type MismatchSeverity = 'INFORMATION' | 'REVIEW' | 'ACTION_REQUIRED';

export type ReconciliationStatus = 'MATCHED' | 'MISMATCH' | 'PENDING' | 'EXTERNAL_UNAVAILABLE';

// --- AIS Record Structure ----------------------------------------------------

export interface AISRecord {
  /** UUID generated locally when user imports AIS data */
  id: string;
  userId: string;
  taxYear: string;
  /** Transaction type as per AIS */
  transactionType: AISTransactionType;
  /** Source institution that reported to IT dept */
  reportedBy: string;
  reportedByPAN?: string;
  amount: number;
  date?: string;
  /** AIS displays as: "You have accepted / not confirmed" */
  isUserAccepted: boolean | null;
  /** Raw AIS description */
  aisDescription: string;
  /** Data source that filed the SFT */
  dataSource: DataSource;
  /** When was this AIS data imported */
  importedAt: string;
  /** Flag: data came from actual IT Portal or was manually entered */
  isFromITPortal: boolean;
  /** IMPORTANT: If false, data is not verified from official source */
  isVerified: boolean;
}

// --- NisFlow Internal Record for Reconciliation ----------------------------

export interface ReconciliationRecord {
  /** NisFlow internal ID */
  nisflowRecordId: string;
  transactionType: AISTransactionType;
  amount: number;
  date?: string;
  description: string;
  accountId?: string;
  counterpartyName?: string;
  documentUploaded: boolean;
}

// --- Reconciliation Result ----------------------------------------------------

export interface ReconciliationMismatch {
  mismatchId: string;
  type: MismatchType;
  severity: MismatchSeverity;
  /** AIS record involved (null if present in books but not AIS) */
  aisRecord?: AISRecord;
  /** NisFlow record involved (null if present in AIS but not books) */
  nisflowRecord?: ReconciliationRecord;
  explanation: string;
  /** What the user should do */
  recommendedAction: string;
  /** Whether user has responded/resolved */
  isResolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface ReconciliationReport {
  taxYear: string;
  generatedAt: string;
  status: ReconciliationStatus;
  /** Total AIS records imported */
  totalAISRecords: number;
  /** Total NisFlow records for the year */
  totalNisflowRecords: number;
  /** Matched records */
  matchedCount: number;
  /** Mismatches found */
  mismatches: ReconciliationMismatch[];
  /** If AIS data is unavailable */
  aisDataAvailable: boolean;
  /** Disclaimer */
  disclaimer: string;
}

// --- Core Functions ------------------------------------------------------------

/**
 * Reconcile NisFlow books against imported AIS data.
 *
 * IMPORTANT: AIS data must come from the user's own IT Portal download.
 * Never fabricate AIS data.
 */
export function reconcileAISTIS(params: {
  taxYear: string;
  aisRecords: AISRecord[];
  nisflowRecords: ReconciliationRecord[];
}): ReconciliationReport {
  const { taxYear, aisRecords, nisflowRecords } = params;
  const mismatches: ReconciliationMismatch[] = [];
  let matchedCount = 0;

  if (aisRecords.length === 0) {
    return {
      taxYear,
      generatedAt: new Date().toISOString(),
      status: 'EXTERNAL_UNAVAILABLE',
      totalAISRecords: 0,
      totalNisflowRecords: nisflowRecords.length,
      matchedCount: 0,
      mismatches: [],
      aisDataAvailable: false,
      disclaimer: RECONCILIATION_DISCLAIMER,
    };
  }

  const matchedAISIds = new Set<string>();
  const matchedNisflowIds = new Set<string>();

  // Match by amount + transactionType (±10% tolerance for rounding)
  for (const aisRec of aisRecords) {
    const matches = nisflowRecords.filter(n => {
      if (n.transactionType !== aisRec.transactionType) return false;
      const amountMatch = Math.abs(n.amount - aisRec.amount) / Math.max(aisRec.amount, 1) < 0.01; // 1% tolerance
      return amountMatch;
    });

    if (matches.length === 1) {
      matchedAISIds.add(aisRec.id);
      matchedNisflowIds.add(matches[0].nisflowRecordId);
      matchedCount++;
    } else if (matches.length === 0) {
      mismatches.push({
        mismatchId: `MISMATCH-AIS-ONLY-${aisRec.id}`,
        type: 'present_in_ais_not_books',
        severity: 'ACTION_REQUIRED',
        aisRecord: aisRec,
        explanation: `AIS shows ${aisRec.transactionType} of Rs ${aisRec.amount} from "${aisRec.reportedBy}" in ${taxYear}, but no matching record found in NisFlow books.`,
        recommendedAction: `Review whether this income/transaction was recorded in NisFlow. If missing, add it. If incorrect in AIS, raise a dispute on the IT Portal and document the response.`,
        isResolved: false,
      });
    } else if (matches.length > 1) {
      mismatches.push({
        mismatchId: `MISMATCH-MULTI-${aisRec.id}`,
        type: 'amount_mismatch',
        severity: 'REVIEW',
        aisRecord: aisRec,
        explanation: `Multiple NisFlow records match this AIS entry. Manual review needed to identify the correct match.`,
        recommendedAction: 'Review the matching records and mark the correct one. Ensure no duplicate recording.',
        isResolved: false,
      });
    }
  }

  // NisFlow records not matched to any AIS record
  for (const nRec of nisflowRecords) {
    if (!matchedNisflowIds.has(nRec.nisflowRecordId)) {
      // Only flag income-type records
      const incomeTypes: AISTransactionType[] = ['salary', 'interest_savings', 'interest_fd', 'dividend', 'securities_sale', 'mutual_fund_sale'];
      if (incomeTypes.includes(nRec.transactionType)) {
        mismatches.push({
          mismatchId: `MISMATCH-BOOKS-ONLY-${nRec.nisflowRecordId}`,
          type: 'present_in_books_not_ais',
          severity: 'REVIEW',
          nisflowRecord: nRec,
          explanation: `NisFlow records ${nRec.transactionType} of Rs ${nRec.amount} for "${nRec.description}", but no matching entry in AIS. This could be because: (a) the reporting institution did not file, (b) AIS data is not yet updated, or (c) the transaction is not subject to SFT reporting.`,
          recommendedAction: 'Verify this income in your Form 26AS and ensure it is declared in ITR. Check if the institution filed an SFT or TDS return.',
          isResolved: false,
        });
      }
    }
  }

  const overallStatus: ReconciliationStatus = mismatches.length === 0 ? 'MATCHED' : 'MISMATCH';

  return {
    taxYear,
    generatedAt: new Date().toISOString(),
    status: overallStatus,
    totalAISRecords: aisRecords.length,
    totalNisflowRecords: nisflowRecords.length,
    matchedCount,
    mismatches,
    aisDataAvailable: true,
    disclaimer: RECONCILIATION_DISCLAIMER,
  };
}

/**
 * Check if an AIS record has been flagged by the user as disputed or accepted.
 */
export function isAISRecordDisputed(aisRecord: AISRecord): boolean {
  return aisRecord.isUserAccepted === false;
}

export const RECONCILIATION_DISCLAIMER = `
IMPORTANT NOTICE:
AIS/TIS data must be downloaded directly from the Income Tax Portal (incometax.gov.in ? e-File ? AIS).
NisFlow does not have direct access to your AIS or TIS data.
Reconciliation is performed on data you manually import or enter.
Mismatches are flagged for your review — NisFlow does not automatically accept, dispute, or modify AIS records.
For AIS disputes, use the official IT Portal's "Feedback" mechanism.
For large discrepancies, consult a qualified Chartered Accountant.
`.trim();

/**
 * Generate guidance for how to access and download AIS/TIS.
 */
export function getAISDownloadGuidance(): string[] {
  return [
    'Log in to the Income Tax Portal at incometax.gov.in',
    'Go to: e-File ? Income Tax Returns ? AIS (Annual Information Statement)',
    'Click "View AIS" to see income, TDS, SFT, and other reported data',
    'Download AIS in JSON/PDF format for the relevant Financial Year',
    'Cross-check each AIS entry against your own records',
    'Use the AIS Feedback option on the portal to dispute any incorrect entries',
    'Download TIS (Taxpayer Information Summary) for aggregated view',
    'For any discrepancies, contact the reporting institution (bank, employer, broker) first',
  ];
}
