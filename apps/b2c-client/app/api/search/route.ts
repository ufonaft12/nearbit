import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase/client';
import { getQueryEmbedding, generateSearchAnswer } from '@/lib/ai/openai';
import { redis, CACHE_TTL_SECONDS } from '@/lib/redis';
import type { SearchResult, SearchResultWithStore, CachedResult, CachedSearchPayload } from '@/types/nearbit';

// ============================================================
// GET /api/search?q=<query>[&store=<uuid>][&limit=<n>]
//                          [&user_lat=<lat>&user_lng=<lng>]
//
// Pipeline:
//   0. Check Redis cache  (key: search:cache:<sha256(q)>)
//   1. Embed the query with text-embedding-3-small
//   2. Call match_products / search_products RPC (cosine similarity)
//   3. Fetch store names + coordinates (single DB round-trip)
//   4. Use GPT-4o-mini to produce a natural-language answer
//   5. Write { answer, results+storeLat/Lng } to Redis (24 h TTL)
//   6. Attach per-user distanceKm and return { answer, results }
// ============================================================

// ── Haversine distance (km) ──────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Attach per-request distances without modifying the cached payload
function withDistances(
  results: CachedResult[],
  userLat: number | null,
  userLng: number | null,
): SearchResultWithStore[] {
  return results.map(({ storeLat, storeLng, ...r }) => ({
    ...r,
    distanceKm:
      userLat != null && userLng != null && storeLat != null && storeLng != null
        ? Math.round(haversineKm(userLat, userLng, storeLat, storeLng) * 10) / 10
        : undefined,
  }));
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const query       = searchParams.get('q')?.trim();
  const storeFilter = searchParams.get('store') ?? undefined;
  const limit       = Math.min(parseInt(searchParams.get('limit') ?? '10', 10) || 10, 50);
  const userLat     = searchParams.get('user_lat') ? parseFloat(searchParams.get('user_lat')!) : null;
  const userLng     = searchParams.get('user_lng') ? parseFloat(searchParams.get('user_lng')!) : null;

  if (!query) {
    return NextResponse.json({ error: 'Missing required param: q' }, { status: 400 });
  }

  // ── 0. Redis cache check ──────────────────────────────────────────────────
  const cacheKey = `search:cache:${createHash('sha256').update(query.toLowerCase()).digest('hex')}`;

  if (redis) {
    try {
      const cached = await redis.get<CachedSearchPayload>(cacheKey);
      if (cached) {
        console.log(`[search] cache HIT — ${cacheKey}`);
        return NextResponse.json({
          answer:  cached.answer,
          results: withDistances(cached.results, userLat, userLng),
        });
      }
    } catch (err) {
      // Cache read failure is non-fatal; fall through to live pipeline
      console.warn('[search] Redis read error (continuing without cache)', err);
    }
  }

  // ── 1. Embed the query ────────────────────────────────────────────────────
  let queryEmbedding: number[];
  try {
    queryEmbedding = await getQueryEmbedding(query);
  } catch (err) {
    console.error('[search] embedding error', err);
    return NextResponse.json({ error: 'Failed to embed query' }, { status: 502 });
  }

  // ── 2. Semantic search via RPC ────────────────────────────────────────────
  const rpcParams: Record<string, unknown> = {
    query_embedding: queryEmbedding,
    match_threshold: 0.25,
    match_count: limit,
  };

  const { data: rows, error: rpcError } = storeFilter
    ? await supabaseAdmin.rpc('search_products', { ...rpcParams, store_id_filter: storeFilter })
    : await supabaseAdmin.rpc('match_products', rpcParams);

  if (rpcError) {
    console.error('[search] RPC error', rpcError);
    return NextResponse.json({ error: 'Search failed', details: rpcError.message }, { status: 500 });
  }

  const rawResults = (rows ?? []) as Array<{
    id: string;
    store_id: string;
    normalized_name: string;
    name_he: string | null;
    name_ru: string | null;
    name_en: string | null;
    category: string | null;
    price: number | null;
    quantity: number | null;
    unit: string | null;
    barcode: string | null;
    similarity: number;
  }>;

  // ── 3. Fetch store names + coordinates (single DB round-trip) ─────────────
  const storeIds = [...new Set(rawResults.map((r) => r.store_id))];
  const storeMap = new Map<string, { name: string; lat: number | null; lng: number | null }>();

  if (storeIds.length > 0) {
    const { data: stores } = await supabaseAdmin
      .from('stores')
      .select('id, name, lat, lng')
      .in('id', storeIds);

    (stores ?? []).forEach((s: { id: string; name: string; lat: number | null; lng: number | null }) => {
      storeMap.set(s.id, { name: s.name, lat: s.lat, lng: s.lng });
    });
  }

  // ── 4. Shape results ──────────────────────────────────────────────────────
  const results: (SearchResult & { storeName: string })[] = rawResults.map((r) => ({
    id: r.id,
    storeId: r.store_id,
    storeName: storeMap.get(r.store_id)?.name ?? 'Unknown Store',
    normalizedName: r.normalized_name,
    nameHe: r.name_he,
    nameRu: r.name_ru,
    nameEn: r.name_en,
    category: r.category,
    price: r.price,
    quantity: r.quantity,
    unit: r.unit,
    barcode: r.barcode,
    similarity: r.similarity,
  }));

  // ── 5. GPT-4o-mini answer ─────────────────────────────────────────────────
  let answer: string;
  try {
    answer = await generateSearchAnswer(
      query,
      results.map((r) => ({
        normalizedName: r.normalizedName,
        price: r.price,
        quantity: r.quantity,
        unit: r.unit,
        storeName: r.storeName,
      })),
    );
  } catch (err) {
    console.error('[search] answer generation error', err);
    answer =
      results.length > 0
        ? `Found ${results.length} result(s) for "${query}".`
        : `No results found for "${query}".`;
  }

  // ── 6. Write to Redis (TTL 24 h) ──────────────────────────────────────────
  // storeLat/Lng are stored per-result so future cache hits can re-compute
  // distances for any user location without an extra DB round-trip.
  const cachedResults: CachedResult[] = results.map((r) => ({
    ...r,
    storeLat: storeMap.get(r.storeId)?.lat ?? null,
    storeLng: storeMap.get(r.storeId)?.lng ?? null,
  }));

  if (redis) {
    redis
      .set<CachedSearchPayload>(cacheKey, { answer, results: cachedResults }, { ex: CACHE_TTL_SECONDS })
      .catch((err) => console.warn('[search] Redis write error', err));
  }

  return NextResponse.json({
    answer,
    results: withDistances(cachedResults, userLat, userLng),
  });
}
