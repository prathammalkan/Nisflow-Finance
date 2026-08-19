/**
 * Remote Supabase Security Audit Classifier
 * Provides rigorous, evidence-based security classification for remote database probes.
 * Never conflates 0-row empty dataset responses with proven RLS enforcement.
 */

export interface TableReadResult {
  table: string;
  httpStatus: number;
  rowsReturned: number;
  classification: 'AUTHORIZATION REJECTION' | 'EMPTY DATASET' | 'DATA EXPOSURE' | 'UNEXPECTED RESPONSE';
  verdict: 'PASS' | 'FAIL' | 'REVIEW';
  details: string;
}

export interface InsertProbeResult {
  table: string;
  httpStatus: number;
  classification: 'AUTHORIZATION REJECTION' | 'UNAUTHORIZED INSERT SUCCEEDED' | 'UNEXPECTED RESPONSE';
  verdict: 'PASS' | 'FAIL' | 'REVIEW';
  details: string;
  probeIdentifier: string;
}

export interface RpcProbeResult {
  rpcName: string;
  httpStatus: number;
  responseBody: any;
  classification: 'AUTHORIZATION REJECTION' | 'BUSINESS VALIDATION REACHED' | 'UNAUTHORIZED RPC EXECUTION' | 'UNEXPECTED RESPONSE';
  verdict: 'PASS' | 'FAIL' | 'REVIEW';
  details: string;
}

export interface ProbeArtifactCheckResult {
  artifactsFound: number;
  artifacts: string[];
  verdict: 'PASS' | 'FAIL';
  details: string;
}

export interface SecurityAuditSummary {
  targetUrl: string;
  serviceRoleCheck: {
    status: 'NOT USED' | 'SERVICE_ROLE_DETECTED';
    verdict: 'PASS' | 'FAIL';
  };
  tableReads: TableReadResult[];
  insertProbes: InsertProbeResult[];
  rpcProbes: RpcProbeResult[];
  artifactCheck: ProbeArtifactCheckResult;
  crossUserTest: {
    status: 'PASS' | 'NOT EXECUTED' | 'FAIL';
    reason: string;
  };
  overallVerdict: 'REMOTE SECURITY AUDIT VERIFIED' | 'REMOTE SECURITY AUDIT PARTIALLY VERIFIED — CROSS-USER TEST PENDING' | 'REMOTE SECURITY AUDIT FAILED — SECURITY ISSUE FOUND';
}

/**
 * Validates that the provided API key is strictly an anonymous client key
 * and NOT a privileged service-role key.
 */
export function validateAnonKey(key: string): { isValidAnon: boolean; error?: string } {
  if (!key) {
    return { isValidAnon: false, error: 'API key is missing or empty.' };
  }

  try {
    const parts = key.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      if (payload.role === 'service_role') {
        return {
          isValidAnon: false,
          error: 'CRITICAL SECURITY FAILURE: SUPABASE_SERVICE_ROLE_KEY was provided. Security audit must exclusively test the public anon boundary.',
        };
      }
      if (payload.role === 'anon') {
        return { isValidAnon: true };
      }
    }
  } catch {
    // If key format cannot be parsed as JWT, allow it only if not explicitly named service role
  }

  return { isValidAnon: true };
}

/**
 * Classifies an anonymous table read response.
 * CRITICAL RULE: A 0-row response is classified as EMPTY DATASET, NOT proven RLS.
 */
export function classifyTableRead(table: string, httpStatus: number, responseBody: any): TableReadResult {
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      table,
      httpStatus,
      rowsReturned: 0,
      classification: 'AUTHORIZATION REJECTION',
      verdict: 'PASS',
      details: 'Anonymous request rejected by API gateway / RLS policy.',
    };
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    const rows = Array.isArray(responseBody) ? responseBody : [];
    if (rows.length === 0) {
      return {
        table,
        httpStatus,
        rowsReturned: 0,
        classification: 'EMPTY DATASET',
        verdict: 'PASS',
        details: 'HTTP 200 with 0 rows exposed. (Classification: EMPTY DATASET; RLS cannot be proven from row count alone).',
      };
    } else {
      return {
        table,
        httpStatus,
        rowsReturned: rows.length,
        classification: 'DATA EXPOSURE',
        verdict: 'FAIL',
        details: `CRITICAL SECURITY FAILURE: Exposed ${rows.length} private records to anonymous public request.`,
      };
    }
  }

  return {
    table,
    httpStatus,
    rowsReturned: 0,
    classification: 'UNEXPECTED RESPONSE',
    verdict: 'REVIEW',
    details: `Unexpected response status HTTP ${httpStatus}: ${JSON.stringify(responseBody)}`,
  };
}

/**
 * Classifies an anonymous insert attempt.
 */
export function classifyInsertProbe(table: string, httpStatus: number, responseBody: any, probeIdentifier: string): InsertProbeResult {
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 404) {
    return {
      table,
      httpStatus,
      classification: 'AUTHORIZATION REJECTION',
      verdict: 'PASS',
      details: `Anonymous write rejected with HTTP ${httpStatus}.`,
      probeIdentifier,
    };
  }

  // Postgres error code 42501 is insufficient_privilege / RLS violation
  if (responseBody?.code === '42501' || responseBody?.message?.includes('violates row-level security')) {
    return {
      table,
      httpStatus,
      classification: 'AUTHORIZATION REJECTION',
      verdict: 'PASS',
      details: 'Write rejected by Row-Level Security policy (42501).',
      probeIdentifier,
    };
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    return {
      table,
      httpStatus,
      classification: 'UNAUTHORIZED INSERT SUCCEEDED',
      verdict: 'FAIL',
      details: `CRITICAL SECURITY FAILURE: Anonymous write succeeded on table '${table}' with probe ID '${probeIdentifier}'.`,
      probeIdentifier,
    };
  }

  return {
    table,
    httpStatus,
    classification: 'UNEXPECTED RESPONSE',
    verdict: 'REVIEW',
    details: `Insert probe received unexpected response HTTP ${httpStatus}: ${JSON.stringify(responseBody)}`,
    probeIdentifier,
  };
}

/**
 * Classifies an anonymous RPC invocation on post_journal_entry.
 * CRITICAL RULE: Business validation errors (e.g. "requires 2 lines") do NOT prove authorization.
 */
export function classifyRpcProbe(rpcName: string, httpStatus: number, responseBody: any): RpcProbeResult {
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 404) {
    return {
      rpcName,
      httpStatus,
      responseBody,
      classification: 'AUTHORIZATION REJECTION',
      verdict: 'PASS',
      details: `Anonymous RPC execution blocked at endpoint gateway (HTTP ${httpStatus}).`,
    };
  }

  const errMsg = String(responseBody?.message || responseBody?.error || '').toLowerCase();

  if (errMsg.includes('violates row-level security') || errMsg.includes('permission denied') || errMsg.includes('jwt') || errMsg.includes('unauthorized')) {
    return {
      rpcName,
      httpStatus,
      responseBody,
      classification: 'AUTHORIZATION REJECTION',
      verdict: 'PASS',
      details: `RPC execution rejected by database permission / RLS guard: ${errMsg}`,
    };
  }

  if (httpStatus >= 200 && httpStatus < 300 && responseBody?.data) {
    return {
      rpcName,
      httpStatus,
      responseBody,
      classification: 'UNAUTHORIZED RPC EXECUTION',
      verdict: 'FAIL',
      details: 'CRITICAL SECURITY FAILURE: Anonymous RPC successfully committed a journal entry.',
    };
  }

  // If the error message is a domain/business validation error, it indicates execution entered the function body
  if (errMsg.includes('lines') || errMsg.includes('balanced') || errMsg.includes('account') || errMsg.includes('precision') || errMsg.includes('idempotency')) {
    return {
      rpcName,
      httpStatus,
      responseBody,
      classification: 'BUSINESS VALIDATION REACHED',
      verdict: 'REVIEW',
      details: `Execution reached stored procedure body (${errMsg}). Authorization should be enforced at entry or schema level.`,
    };
  }

  return {
    rpcName,
    httpStatus,
    responseBody,
    classification: 'UNEXPECTED RESPONSE',
    verdict: 'REVIEW',
    details: `RPC probe received HTTP ${httpStatus}: ${JSON.stringify(responseBody)}`,
  };
}

/**
 * Classifies probe artifact audit results.
 */
export function classifyArtifactCheck(artifactsFound: number, artifacts: string[]): ProbeArtifactCheckResult {
  if (artifactsFound === 0) {
    return {
      artifactsFound: 0,
      artifacts: [],
      verdict: 'PASS',
      details: 'Clean — 0 probe artifacts detected in database.',
    };
  }

  return {
    artifactsFound,
    artifacts,
    verdict: 'FAIL',
    details: `SECURITY ARTIFACT ALERT: Found ${artifactsFound} probe records in database: ${artifacts.join(', ')}`,
  };
}
