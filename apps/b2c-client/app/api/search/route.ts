import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase/client';
import { getQueryEmbedding, generateSearchAnswer, generateBasketAnswer } from '@/lib/ai/openai';
import { redis, CACHE_TTL_SECONDS } from '@/lib/redis';
import type {
  SearchResult,
  SearchResultWithStore,
  CachedResult,
  CachedSearchPayload,
  BasketResult,
  BasketStoreOption,
} from '@/types/nearbit';

// ============================================================
// GET /api/search?q=<query>[&store=<uuid>][&limit=<n>]
//                          [&user_lat=<lat>&user_lng=<lng>]
//
// Modes:
//   • Single-item  — normal embed → RPC → LLM answer pipeline
//   • Basket       — detected when q contains commas / conjunctions
//                    (e.g. "milk, eggs, hummus" or "חלב ו ביצים")
//                    Runs parallel per-item searches, aggregates per-store
//                    basket totals, and produces a comparison answer.
//
// Caching (Redis, 24 h):
//   key: search:cache:<sha256(q)>         for single searches
//   key: search:cache:basket:<sha256(sorted-items)>  for basket
// ============================================================

// ── Raw DB row shape ──────────────────────────────────────────────────────────
type RawRow = {
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
};

// ── Shaped product (pre-cache, pre-distance) ──────────────────────────────────
type ShapedProduct = SearchResult & {
  storeName: string;
  storeLat: number | null;
  storeLng: number | null;
};

// ── Item search result (one basket component) ─────────────────────────────────
type ItemSearchResult = {
  query:    string;
  products: ShapedProduct[];
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

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

/** Convert CachedResult[] → SearchResultWithStore[], attaching per-user distances
 *  and passing storeLat/storeLng through to the client for directions links. */
function withDistances(
  results: CachedResult[],
  userLat: number | null,
  userLng: number | null,
): SearchResultWithStore[] {
  return results.map(({ storeLat, storeLng, ...r }) => ({
    ...r,
    storeLat,   // kept in response — used by the "Yalla!" directions button
    storeLng,
    distanceKm:
      userLat != null && userLng != null && storeLat != null && storeLng != null
        ? Math.round(haversineKm(userLat, userLng, storeLat, storeLng) * 10) / 10
        : undefined,
  }));
}

/**
 * Detect multi-item / basket queries.
 * Splits on commas and common conjunctions in Hebrew, Russian, and English.
 * Returns null for single-item queries.
 */
function parseBasketItems(query: string): string[] | null {
  const conjRe = /\s+(?:and|ו|או|и|или)\s+/gi;
  const items = query
    .replace(conjRe, ',')
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  return items.length >= 2 ? items : null;
}

/** Fetch store metadata for a set of store IDs. */
async function fetchStoreMap(
  storeIds: string[],
): Promise<Map<string, { name: string; lat: number | null; lng: number | null }>> {
  const map = new Map<string, { name: string; lat: number | null; lng: number | null }>();
  if (storeIds.length === 0) return map;

  const { data: stores } = await supabaseAdmin
    .from('stores')
    .select('id, name, lat, lng')
    .in('id', storeIds);

  (stores ?? []).forEach(
    (s: { id: string; name: string; lat: number | null; lng: number | null }) => {
      map.set(s.id, { name: s.name, lat: s.lat, lng: s.lng });
    },
  );
  return map;
}

/** Embed one item, run the RPC, fetch store data, return shaped products. */
async function runItemSearch(item: string, limit: number): Promise<ItemSearchResult> {
  const embedding = await getQueryEmbedding(item);

  const { data: rows, error } = await supabaseAdmin.rpc('match_products', {
    query_embedding: embedding,
    match_threshold: 0.25,
    match_count: limit,
  });

  if (error) throw new Error(`[runItemSearch] RPC error for "${item}": ${error.message}`);

  const rawRows = (rows ?? []) as RawRow[];
  const storeIds = [...new Set(rawRows.map((r) => r.store_id))];
  const storeMap = await fetchStoreMap(storeIds);

  const products: ShapedProduct[] = rawRows.map((r) => ({
    id: r.id,
    storeId: r.store_id,
    storeName: storeMap.get(r.store_id)?.name ?? 'Unknown Store',
    storeLat:  storeMap.get(r.store_id)?.lat  ?? null,
    storeLng:  storeMap.get(r.store_id)?.lng  ?? null,
    normalizedName: r.normalized_name,
    nameHe:   r.name_he,
    nameRu:   r.name_ru,
    nameEn:   r.name_en,
    category: r.category,
    price:    r.price,
    quantity: r.quantity,
    unit:     r.unit,
    barcode:  r.barcode,
    similarity: r.similarity,
  }));

  return { query: item, products };
}

/**
 * Aggregate per-item search results into basket store options.
 * For each store, tracks the cheapest match for every basket item.
 * Sorts stores: most-complete basket first, then cheapest total.
 */
function buildBasketResult(itemResults: ItemSearchResult[]): {
  allProducts: ShapedProduct[];
  basket: BasketResult;
} {
  type StoreEntry = {
    storeName: string;
    storeLat:  number | null;
    storeLng:  number | null;
    cheapest:  Map<string, { productName: string; price: number }>;
  };

  const storeData = new Map<string, StoreEntry>();

  for (const { query, products } of itemResults) {
    for (const p of products) {
      if (!storeData.has(p.storeId)) {
        storeData.set(p.storeId, {
          storeName: p.storeName,
          storeLat:  p.storeLat,
          storeLng:  p.storeLng,
          cheapest:  new Map(),
        });
      }
      const entry    = storeData.get(p.storeId)!;
      const existing = entry.cheapest.get(query);
      if (p.price != null && (existing == null || p.price < existing.price)) {
        entry.cheapest.set(query, {
          productName: p.nameHe ?? p.normalizedName,
          price: p.price,
        });
      }
    }
  }

  const totalItems = itemResults.length;
  const storeOptions: BasketStoreOption[] = [];

  for (const [storeId, { storeName, storeLat, storeLng, cheapest }] of storeData) {
    const foundItems = [...cheapest.entries()].map(([query, { productName, price }]) => ({
      query,
      productName,
      price,
    }));
    if (foundItems.length === 0) continue;

    const totalCost = Math.round(foundItems.reduce((s, i) => s + i.price, 0) * 100) / 100;
    storeOptions.push({
      storeId,
      storeName,
      storeLat,
      storeLng,
      itemsFound: foundItems.length,
      totalItems,
      totalCost,
      items: foundItems,
    });
  }

  // Rank: most items found first, then cheapest
  storeOptions.sort((a, b) =>
    b.itemsFound !== a.itemsFound
      ? b.itemsFound - a.itemsFound
      : a.totalCost - b.totalCost,
  );

  const complete = storeOptions.filter((s) => s.itemsFound === totalItems);
  const savings  =
    complete.length >= 2
      ? Math.round((complete[complete.length - 1].totalCost - complete[0].totalCost) * 100) / 100
      : 0;

  return {
    allProducts: itemResults.flatMap(({ products }) => products),
    basket: {
      items:        itemResults.map((r) => r.query),
      storeOptions: storeOptions.slice(0, 5),
      savings,
      bestStoreId:  storeOptions[0]?.storeId ?? null,
    },
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

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

  // ── Basket detection ──────────────────────────────────────────────────────
  const basketItems = parseBasketItems(query);
  const isBasket    = basketItems !== null;

  // ── Cache key ─────────────────────────────────────────────────────────────
  // Basket key: sort items alphabetically so "milk, eggs" and "eggs, milk" share cache.
  const cacheKey = isBasket
    ? `search:cache:basket:${createHash('sha256')
        .update([...basketItems!].sort().join('|').toLowerCase())
        .digest('hex')}`
    : `search:cache:${createHash('sha256').update(query.toLowerCase()).digest('hex')}`;

  // ── 0. Redis cache check ──────────────────────────────────────────────────
  if (redis) {
    try {
      const cached = await redis.get<CachedSearchPayload>(cacheKey);
      if (cached) {
        console.log(`[search] cache HIT — ${cacheKey}`);
        return NextResponse.json({
          answer:  cached.answer,
          results: withDistances(cached.results, userLat, userLng),
          ...(cached.basket ? { basket: cached.basket } : {}),
        });
      }
    } catch (err) {
      console.warn('[search] Redis read error (continuing without cache)', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── BASKET PIPELINE ──────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (isBasket) {
    const perItemLimit = Math.max(3, Math.ceil(limit / basketItems!.length) + 2);

    let itemResults: ItemSearchResult[];
    try {
      // Parallel: embed + search for every basket item simultaneously
      itemResults = await Promise.all(
        basketItems!.map((item) => runItemSearch(item, perItemLimit)),
      );
    } catch (err) {
      console.error('[search] basket item search error', err);
      return NextResponse.json({ error: 'Basket search failed' }, { status: 502 });
    }

    const { allProducts, basket } = buildBasketResult(itemResults);

    let answer: string;
    try {
      answer = await generateBasketAnswer(query, basket);
    } catch (err) {
      console.error('[search] basket answer error', err);
      answer = basket.storeOptions.length > 0
        ? `Found your basket at ${basket.storeOptions.length} store(s). Best deal: ${basket.storeOptions[0].storeName} for ₪${basket.storeOptions[0].totalCost.toFixed(2)}.`
        : `No stores carry the full basket.`;
    }

    const cachedResults: CachedResult[] = allProducts.map((p) => ({
      id: p.id,
      storeId: p.storeId,
      storeName: p.storeName,
      normalizedName: p.normalizedName,
      nameHe:   p.nameHe,
      nameRu:   p.nameRu,
      nameEn:   p.nameEn,
      category: p.category,
      price:    p.price,
      quantity: p.quantity,
      unit:     p.unit,
      barcode:  p.barcode,
      similarity: p.similarity,
      storeLat: p.storeLat,
      storeLng: p.storeLng,
    }));

    if (redis) {
      redis
        .set<CachedSearchPayload>(
          cacheKey,
          { answer, results: cachedResults, basket },
          { ex: CACHE_TTL_SECONDS },
        )
        .catch((err) => console.warn('[search] Redis write error', err));
    }

    return NextResponse.json({
      answer,
      results: withDistances(cachedResults, userLat, userLng),
      basket,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── SINGLE-ITEM PIPELINE ─────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  // 1. Embed
  let queryEmbedding: number[];
  try {
    queryEmbedding = await getQueryEmbedding(query);
  } catch (err) {
    console.error('[search] embedding error', err);
    return NextResponse.json({ error: 'Failed to embed query' }, { status: 502 });
  }

  // 2. Semantic search via RPC
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

  const rawResults = (rows ?? []) as RawRow[];

  // 3. Fetch store names + coordinates (single round-trip)
  const storeIds = [...new Set(rawResults.map((r) => r.store_id))];
  const storeMap = await fetchStoreMap(storeIds);

  // 4. Shape results
  const results: (SearchResult & { storeName: string })[] = rawResults.map((r) => ({
    id: r.id,
    storeId: r.store_id,
    storeName: storeMap.get(r.store_id)?.name ?? 'Unknown Store',
    normalizedName: r.normalized_name,
    nameHe:   r.name_he,
    nameRu:   r.name_ru,
    nameEn:   r.name_en,
    category: r.category,
    price:    r.price,
    quantity: r.quantity,
    unit:     r.unit,
    barcode:  r.barcode,
    similarity: r.similarity,
  }));

  // 5. GPT-4o-mini answer
  let answer: string;
  try {
    answer = await generateSearchAnswer(
      query,
      results.map((r) => ({
        normalizedName: r.normalizedName,
        price:    r.price,
        quantity: r.quantity,
        unit:     r.unit,
        storeName: r.storeName,
      })),
    );
  } catch (err) {
    console.error('[search] answer generation error', err);
    answer = results.length > 0
      ? `Found ${results.length} result(s) for "${query}".`
      : `No results found for "${query}".`;
  }

  // 6. Write to Redis (TTL 24 h)
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
