/**
 * Nearbit – server-side request guard
 *
 * Applied at the start of every API route handler.
 * Runs three checks in order (fast → slow):
 *
 *  1. Rate limiting  — fixed window via Redis (30 req/min, 200 req/hr per IP)
 *  2. Geo-blocking   — only Israeli IPs allowed (countryCode === 'IL')
 *  3. VPN / proxy    — detected via ip-api.com free tier; blocked
 *
 * Geo + VPN results are cached in Redis for 24 h so ip-api.com is only
 * called once per unique IP per day (well within the 45 req/min free limit).
 *
 * Fail-open policy: if Redis or ip-api.com are unavailable the request is
 * allowed through — availability beats over-blocking legitimate users.
 *
 * Local / private IPs (localhost, 192.168.x.x, 10.x.x.x) bypass
 * geo + VPN checks so development works without a real Israeli IP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

// ── Types ────────────────────────────────────────────────────────────────────

interface IpApiResponse {
  status:      string;       // "success" | "fail"
  countryCode: string;       // ISO 3166-1 alpha-2, e.g. "IL"
  proxy:       boolean;      // true = proxy / VPN detected
  hosting:     boolean;      // true = known hosting / datacenter IP
  query:       string;       // echoed IP address
}

export interface GuardResult {
  allowed:   boolean;
  response?: NextResponse;  // set when allowed === false
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the originating client IP from request headers. */
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

/** True for loopback / RFC-1918 private addresses — skip geo checks in dev. */
function isPrivateIp(ip: string): boolean {
  return (
    ip === '127.0.0.1'      ||
    ip === '::1'             ||
    ip.startsWith('10.')     ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

function deny(message: string, status: number, extra?: Record<string, string>): GuardResult {
  return {
    allowed: false,
    response: NextResponse.json({ error: message }, { status, headers: extra }),
  };
}

// ── 1. Rate limiting ─────────────────────────────────────────────────────────

const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_PER_HOUR   = 200;

/**
 * Fixed-window rate limiter using Redis INCR + EXPIRE.
 * Two windows: 1-minute (burst) and 1-hour (sustained).
 * Returns { limited: false } if Redis is unavailable — fail open.
 */
async function checkRateLimit(ip: string): Promise<{ limited: boolean; retryAfter?: number }> {
  if (!redis) return { limited: false };
  const r = redis;

  try {
    const minKey  = `rate:min:${ip}`;
    const hourKey = `rate:hr:${ip}`;

    const [minCount, hourCount] = await Promise.all([
      r.incr(minKey).then(async (c) => { if (c === 1) await r.expire(minKey, 60);   return c; }),
      r.incr(hourKey).then(async (c) => { if (c === 1) await r.expire(hourKey, 3600); return c; }),
    ]);

    if (minCount  > RATE_LIMIT_PER_MINUTE) return { limited: true, retryAfter: 60   };
    if (hourCount > RATE_LIMIT_PER_HOUR  ) return { limited: true, retryAfter: 3600 };
    return { limited: false };
  } catch {
    return { limited: false }; // Redis error → allow
  }
}

// ── 2 & 3. Geo-block + VPN detection ────────────────────────────────────────

const IP_INFO_TTL = 60 * 60 * 24; // cache per-IP result for 24 h

/**
 * Fetch geolocation + proxy info from ip-api.com (free tier).
 * Result is cached in Redis to stay well within the 45 req/min free limit.
 * Returns null on any network / parse error — caller should fail open.
 */
async function getIpInfo(ip: string): Promise<IpApiResponse | null> {
  const cacheKey = `ipinfo:${ip}`;

  // Try Redis cache first
  if (redis) {
    try {
      const cached = await redis.get<IpApiResponse>(cacheKey);
      if (cached) return cached;
    } catch { /* ignore */ }
  }

  // Call ip-api.com (HTTP only on the free tier — fine for server-to-server)
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,countryCode,proxy,hosting,query`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as IpApiResponse;
    if (data.status !== 'success') return null;

    // Back-fill Redis asynchronously
    if (redis) {
      redis.set<IpApiResponse>(cacheKey, data, { ex: IP_INFO_TTL }).catch(() => {});
    }

    return data;
  } catch {
    return null; // timeout / network error → fail open
  }
}

// ── Main guard ───────────────────────────────────────────────────────────────

/**
 * Run all security checks and return a GuardResult.
 *
 * Usage in an API route:
 * ```ts
 * const guard = await guardRequest(req);
 * if (!guard.allowed) return guard.response!;
 * ```
 */
export async function guardRequest(req: NextRequest): Promise<GuardResult> {
  const ip = getClientIp(req);

  // ── 1. Rate limiting (applied to all IPs including localhost) ──────────────
  const rateCheck = await checkRateLimit(ip);
  if (rateCheck.limited) {
    return deny(
      'Too many requests — please slow down.',
      429,
      { 'Retry-After': String(rateCheck.retryAfter ?? 60) },
    );
  }

  // ── Skip geo + VPN checks for private / local IPs (development) ───────────
  if (isPrivateIp(ip)) return { allowed: true };

  // ── 2 & 3. Geo-block + VPN detection ─────────────────────────────────────
  const info = await getIpInfo(ip);

  if (info) {
    // Block requests from outside Israel
    if (info.countryCode !== 'IL') {
      console.warn(`[guard] Blocked non-IL IP: ${ip} (${info.countryCode})`);
      return deny('This service is only available in Israel.', 403);
    }

    // Block VPN, proxy, and hosting/datacenter IPs
    if (info.proxy || info.hosting) {
      console.warn(`[guard] Blocked VPN/proxy IP: ${ip} (proxy=${info.proxy} hosting=${info.hosting})`);
      return deny('VPN and proxy connections are not permitted.', 403);
    }
  }
  // info === null → ip-api.com unreachable → fail open (allow the request)

  return { allowed: true };
}
