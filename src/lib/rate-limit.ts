import { ApiError } from "./api-utils";

/**
 * In-memory rate limiter — single-instance only.
 *
 * Limitations :
 * - Les compteurs sont perdus au redemarrage du processus.
 * - Ne fonctionne pas en mode multi-instances (pas de store partage).
 *
 * Pour un deploiement single-instance derriere Traefik (cas standard),
 * ce niveau de protection est suffisant. Pour un deploiement distribue,
 * remplacer par un store Redis (ex: @upstash/ratelimit).
 *
 * Hypothese proxy : l'en-tete x-forwarded-for est injecte par Traefik.
 * Configurer Traefik pour ecraser cet en-tete afin d'empecher un client
 * de le falsifier (directive trustedIPs / forwardedHeaders dans Traefik).
 * Sans cette configuration, le rate-limit par IP est contournable.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

interface RateLimitOptions {
  windowMs?: number; // Time window in ms (default 60s)
  max?: number; // Max requests per window (default 60)
}

export function rateLimit(
  key: string,
  options: RateLimitOptions = {}
): { success: boolean; remaining: number } {
  const { windowMs = 60_000, max = 60 } = options;
  const now = Date.now();

  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: max - 1 };
  }

  entry.count++;

  if (entry.count > max) {
    return { success: false, remaining: 0 };
  }

  return { success: true, remaining: max - entry.count };
}

// Presets for different route types
export const RATE_LIMIT_AUTH: RateLimitOptions = { windowMs: 60_000, max: 10 };
export const RATE_LIMIT_MUTATION: RateLimitOptions = { windowMs: 60_000, max: 30 };
export const RATE_LIMIT_SENSITIVE: RateLimitOptions = { windowMs: 60_000, max: 10 };

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Throws ApiError(429) if the rate limit is exceeded.
 * Use `prefix` to namespace the key (e.g., "auth", "mut:userId").
 * When no prefix is given, keys by IP (for unauthenticated routes).
 */
export function requireRateLimit(
  request: Request,
  options: RateLimitOptions & { prefix?: string } = {}
) {
  const { prefix, ...rateLimitOpts } = options;
  const key = prefix ?? `ip:${getClientIp(request)}`;
  const result = rateLimit(key, rateLimitOpts);
  if (!result.success) {
    throw new ApiError(429, "Trop de requêtes. Réessayez plus tard.");
  }
}

// Cleanup stale entries periodically (every 5 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
      if (now > entry.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }, 300_000);
}
