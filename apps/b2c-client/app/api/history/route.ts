import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redis } from '@/lib/redis';

// ── Cache TTLs ─────────────────────────────────────────────────────────────────
// History is user-specific and changes on every new search/purchase.
// 5-minute TTL balances freshness vs DB load for active users.
const HISTORY_TTL_SEC = 300; // 5 min

function cacheKey(userId: string, type: 'search' | 'purchases') {
  return `history:${type}:${userId}`;
}

// ── Validation schemas ─────────────────────────────────────────────────────────

const SearchRecordSchema = z.object({
  type: z.literal('search'),
  query: z.string().min(1),
  results_count: z.number().int().min(0).default(0),
  locale: z.string().default('he'),
});

const PurchaseRecordSchema = z.object({
  type: z.literal('purchase'),
  product_id: z.string().uuid().optional(),
  product_name: z.string().min(1),
  store_id: z.string().uuid().optional(),
  store_name: z.string().min(1),
  price_paid: z.number().nullable().optional(),
});

const PostBodySchema = z.discriminatedUnion('type', [SearchRecordSchema, PurchaseRecordSchema]);

// ── GET /api/history?type=search|purchases ─────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type !== 'search' && type !== 'purchases') {
    return NextResponse.json({ error: 'type must be "search" or "purchases"' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Cache check ──────────────────────────────────────────────────────────────
  const key = cacheKey(user.id, type);
  try {
    const cached = await redis.get<string>(key);
    if (cached) {
      return NextResponse.json(JSON.parse(cached as string), {
        headers: { 'X-Cache': 'HIT' },
      });
    }
  } catch {
    // Redis unavailable — fall through to Supabase
  }

  // ── Supabase query ────────────────────────────────────────────────────────────
  const table = type === 'search' ? 'search_history' : 'purchase_log';
  const orderColumn = type === 'search' ? 'searched_at' : 'purchased_at';

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', user.id)
    .order(orderColumn, { ascending: false })
    .limit(50);

  if (error) {
    console.error('[history GET]', error.message);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  // ── Write to cache ────────────────────────────────────────────────────────────
  try {
    await redis.set(key, JSON.stringify(data), { ex: HISTORY_TTL_SEC });
  } catch {
    // Redis write failure is non-fatal
  }

  return NextResponse.json(data, {
    headers: {
      'X-Cache': 'MISS',
      'Cache-Control': 'private, no-store', // user-specific — never CDN-cache
    },
  });
}

// ── POST /api/history — record a search or purchase ────────────────────────────

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    // Determine if the type was valid but fields were missing (422) or type unknown (400)
    const typeCheck = z.object({ type: z.string() }).safeParse(body);
    const knownType = typeCheck.success && (typeCheck.data.type === 'search' || typeCheck.data.type === 'purchase');
    // Zod v4 uses .issues; fall back to .errors for v3 compatibility
    const msg = (parsed.error.issues ?? parsed.error.errors)?.[0]?.message ?? 'Invalid request';
    return NextResponse.json(
      { error: msg },
      { status: knownType ? 422 : 400 },
    );
  }

  const record = parsed.data;
  let insertError: { message: string } | null = null;

  if (record.type === 'search') {
    const { error } = await supabase.from('search_history').insert({
      user_id: user.id,
      query: record.query,
      results_count: record.results_count,
      locale: record.locale,
    });
    insertError = error;
  } else {
    const { error } = await supabase.from('purchase_log').insert({
      user_id: user.id,
      product_id: record.product_id ?? null,
      product_name: record.product_name,
      store_id: record.store_id ?? null,
      store_name: record.store_name,
      price_paid: record.price_paid ?? null,
    });
    insertError = error;
  }

  if (insertError) {
    console.error('[history POST]', insertError.message);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  // ── Invalidate cache so next GET returns fresh data ──────────────────────────
  const cacheType = record.type === 'search' ? 'search' : 'purchases';
  try {
    await redis.del(cacheKey(user.id, cacheType));
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
