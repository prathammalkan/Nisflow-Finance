import { createGoogle } from '@ai-sdk/google';

/**
 * NISFLOW FINANCE — CANONICAL AI ARCHITECTURE & ERROR NORMALIZATION
 * 
 * Server-only AI configuration and provider abstraction.
 * Enforces single source of truth for AI models, credentials, and error normalization.
 * 
 * Security & Reliability Invariants:
 * 1. API keys are NEVER exposed to client components or NEXT_PUBLIC_* variables.
 * 2. Model strings are resolved server-side with production-safe fallbacks.
 * 3. Quota exhaustion (HTTP 429) and upstream failures return sanitized, controlled application errors.
 * 4. Zero exposure of internal stack traces, API keys, URLs, or upstream error bodies to clients.
 */

// Production-safe canonical model: Google's active flash model
export const DEFAULT_AI_MODEL = 'gemini-2.5-flash';
export const FALLBACK_AI_MODEL = 'gemini-1.5-flash';

/**
 * Resolves the canonical AI model identifier from server environment.
 */
export function getCanonicalAIModel(): string {
  const envModel = process.env.GEMINI_MODEL?.trim();
  if (envModel) {
    // Sanitize and ignore deprecated or decommissioned models if mistakenly configured
    if (envModel === 'gemini-2.0-flash' || envModel === 'gemini-2.0-flash-exp') {
      return 'gemini-2.5-flash';
    }
    return envModel;
  }
  return DEFAULT_AI_MODEL;
}

/**
 * Returns a configured Google AI provider instance.
 * Throws a sanitized configuration error if API keys are missing.
 */
export function getGoogleAIProvider() {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new AIConfigurationError(
      'AI service is currently unconfigured in the server environment.'
    );
  }

  return createGoogle({ apiKey: apiKey.trim() });
}

export class AIConfigurationError extends Error {
  public readonly isConfigurationError = true;
  constructor(message: string) {
    super(message);
    this.name = 'AIConfigurationError';
  }
}

export interface SanitizedAIErrorResponse {
  error: string;
  statusCode: number;
  isRetryable: boolean;
}

/**
 * Normalizes upstream AI provider exceptions into controlled application-level errors.
 * Strictly prevents leaking provider internals, quota metrics, raw URLs, or credentials.
 */
export function normalizeAIProviderError(err: unknown, contextRequestId?: string): SanitizedAIErrorResponse {
  const errorObj = err as any;
  const message = String(errorObj?.message || errorObj || '');
  const status = Number(errorObj?.status || errorObj?.statusCode || 0);

  // Structured server-side logging without credentials
  console.error(`[AI_NORMALIZED_ERROR] reqId=${contextRequestId || 'n/a'} status=${status} message=${message.slice(0, 300)}`);

  // Detect 429 Quota Exhaustion / Rate Limit
  if (
    status === 429 ||
    message.includes('429') ||
    message.toLowerCase().includes('quota') ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('resource_exhausted')
  ) {
    return {
      error: 'NisFlow AI is temporarily experiencing high demand. Please wait a moment and try again.',
      statusCode: 429,
      isRetryable: true,
    };
  }

  // Detect Configuration / Missing API Key Error
  if (errorObj?.isConfigurationError || message.toLowerCase().includes('missing api key') || message.toLowerCase().includes('unconfigured')) {
    return {
      error: 'AI service is temporarily unavailable due to server configuration. Please try again later.',
      statusCode: 503,
      isRetryable: false,
    };
  }

  // Detect 404 / Model Not Found
  if (status === 404 || message.includes('404') || message.toLowerCase().includes('not found')) {
    return {
      error: 'The requested AI model is temporarily unavailable. Please try again later.',
      statusCode: 503,
      isRetryable: false,
    };
  }

  // General 5xx / Network / Stream Error
  return {
    error: 'NisFlow AI encountered a temporary issue. Please try again shortly.',
    statusCode: 500,
    isRetryable: true,
  };
}
