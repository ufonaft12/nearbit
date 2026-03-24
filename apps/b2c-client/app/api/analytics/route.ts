import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redis } from '@/lib/redis';
import { buildAnalytics } from '@/lib/utils/analytics';
import type { PurchaseLogRow } from '@/types/history';

// ── Cache TTL ──────────────────────────────────────────────────────────────────
// Analytics data changes only when the user records a new purchase, so a
// 1-hour TTL is safe. The purchase POST route invalidates the purchase
// cache key; analytics uses its own key and is lazily recomputed on the
// next analytics fetch after a new purchase.
const ANALYTICS_TTL_SEC = 3600; // 1 hour

function cacheKey(userId: string) {
  return `analytics:prices:${userId}`;
}

/**
 * GET /api/analytics/prices
 *
 * Returns price-over-time analytics grouped by product name.
 *
 * Response shape:
 * {
 *   [productName: string]: {
 *     timeline: { date: string; price: number }[];
 *     stats: { min, max, first, latest, change } | null;
 *   }
 * }
 *
 * Caching:
 *  - Redis: 1-hour TTL (historical data changes rarely)
 *  - Cache-Control: private, no-store (user-specific, never CDN-cached)
 *  - X-Cache: HIT/MISS header for observability
 */
export async function GET(_request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Cache check ──────────────────────────────────────────────────────────────
  const key = cacheKey(user.id);
  if (redis) {
    try {
      const cached = await redis.get<string>(key);
      if (cached) {
        return NextResponse.json(JSON.parse(cached as string), {
          headers: { 'X-Cache': 'HIT', 'Cache-Control': 'private, no-store' },
        });
      }
    } catch {
      // Redis unavailable — fall through
    }
  }

  // ── Fetch purchases from Supabase ─────────────────────────────────────────────
  const { data, error } = await supabase
    .from('purchase_log')
    .select('id, product_id, product_name, store_id, store_name, price_paid, purchased_at')
    .eq('user_id', user.id)
    .order('purchased_at', { ascending: true })
    .limit(500); // reasonable upper bound

  if (error) {
    console.error('[analytics GET]', error.message);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  // ── Build analytics ───────────────────────────────────────────────────────────
  const analytics = buildAnalytics(data as PurchaseLogRow[]);

  // ── Write to cache (1h TTL) ───────────────────────────────────────────────────
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(analytics), { ex: ANALYTICS_TTL_SEC });
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json(analytics, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, no-store' },
  });
}
