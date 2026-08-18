import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export type RateLimitResult =
  | { status: 'allowed'; limit: number; remaining: number }
  | { status: 'rate_limited'; limit: number; remaining: number; retryAfter: number }
  | { status: 'service_unavailable'; error: string };

// Helper to extract client IP safely
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

// Check if Upstash Redis credentials are provided
const hasRedisCredentials = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

let redisClient: Redis | null = null;
if (hasRedisCredentials) {
  try {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  } catch (err) {
    console.error('[RateLimit] Failed to initialize Upstash Redis client:', err);
    redisClient = null;
  }
}

// In-memory fallback limiter for local dev / offline unit testing
const localLimiterStore = new Map<string, { count: number; resetAt: number }>();

function checkLocalRateLimit(
  key: string,
  maxReqs: number,
  windowSeconds: number
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const entry = localLimiterStore.get(key);

  if (!entry || now > entry.resetAt) {
    localLimiterStore.set(key, { count: 1, resetAt: now + windowMs });
    return { status: 'allowed', limit: maxReqs, remaining: maxReqs - 1 };
  }

  if (entry.count >= maxReqs) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return {
      status: 'rate_limited',
      limit: maxReqs,
      remaining: 0,
      retryAfter,
    };
  }

  entry.count++;
  return { status: 'allowed', limit: maxReqs, remaining: maxReqs - entry.count };
}

// Generalized rate limiter function
export async function limitRequest(
  prefix: string,
  identifier: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const key = `${prefix}:${identifier}`;

  // If Redis is configured, use distributed enforcement
  if (redisClient) {
    try {
      const ratelimit = new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(maxRequests, `${windowSeconds} s`),
        prefix: `nisflow:ratelimit:${prefix}`,
      });

      const { success, limit, remaining, reset } = await ratelimit.limit(identifier);

      if (!success) {
        const now = Date.now();
        const retryAfter = Math.max(1, Math.ceil((reset - now) / 1000));
        return {
          status: 'rate_limited',
          limit,
          remaining: 0,
          retryAfter,
        };
      }

      return {
        status: 'allowed',
        limit,
        remaining,
      };
    } catch (err: any) {
      console.error(`[RateLimit:Outage] Redis failure on ${prefix}:`, err?.message || err);
      // In production or when Redis is configured, fail closed for security & cost protection
      return {
        status: 'service_unavailable',
        error: 'Security and rate-limiting infrastructure temporarily unavailable. Please try again shortly.',
      };
    }
  }

  // Local development / offline testing fallback
  return checkLocalRateLimit(key, maxRequests, windowSeconds);
}

// 1. AI Chat Limiter: 20 requests per 60 seconds per user
export async function checkChatRateLimit(userId: string, req: Request): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const identifier = `${userId}:${ip}`;
  return limitRequest('chat', identifier, 20, 60);
}

// 2. AI Categorize Limiter: 60 requests per 60 seconds per user
export async function checkCategorizeRateLimit(userId: string, req: Request): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const identifier = `${userId}:${ip}`;
  return limitRequest('categorize', identifier, 60, 60);
}

// 3. AI Insights Limiter: 15 requests per hour (3600s) per user
export async function checkInsightRateLimit(userId: string, req: Request): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const identifier = `${userId}:${ip}`;
  return limitRequest('insights', identifier, 15, 3600);
}
