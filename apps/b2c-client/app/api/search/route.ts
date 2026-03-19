import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase/client';
import { getQueryEmbedding, generateSearchAnswer, generateBasketAnswer } from '@/lib/ai/openai';
import { redis, CACHE_TTL_SECONDS, STORE_META_TTL_SECONDS } from '@/lib/redis';
import { guardRequest } from '@/lib/guardRequest';
import { checkProductIntent } from '@/lib/ai/intentCheck';
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

/** Filter cached results to stores within maxKm of the user (Near Me strategy). */
function filterNear(
  results: CachedResult[],
  userLat: number,
  userLng: number,
  maxKm: number,
): CachedResult[] {
  return results.filter((r) => {
    if (r.storeLat == null || r.storeLng == null) return false;
    return haversineKm(userLat, userLng, r.storeLat, r.storeLng) <= maxKm;
  });
}

/** Filter ShapedProducts to stores within maxKm of the user (Near Me strategy). */
function filterNearProducts(
  products: ShapedProduct[],
  userLat: number,
  userLng: number,
  maxKm: number,
): ShapedProduct[] {
  return products.filter((p) => {
    if (p.storeLat == null || p.storeLng == null) return false;
    return haversineKm(userLat, userLng, p.storeLat, p.storeLng) <= maxKm;
  });
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

type StoreMeta = { name: string; lat: number | null; lng: number | null };

/**
 * Fetch store metadata for a set of store IDs.
 *
 * Redis cache: store:<uuid>  TTL 1 h
 * Hits Redis for each ID in parallel; only falls back to Supabase for misses.
 * Store name / coordinates change rarely — 1 h TTL is a safe balance.
 */
async function fetchStoreMap(
  storeIds: string[],
): Promise<Map<string, StoreMeta>> {
  const map = new Map<string, StoreMeta>();
  if (storeIds.length === 0) return map;

  const missingIds: string[] = [];

  // 1. Batch-read from Redis
  if (redis) {
    const cached = await Promise.all(
      storeIds.map((id) =>
        redis!.get<StoreMeta>(`store:${id}`).catch(() => null),
      ),
    );
    storeIds.forEach((id, i) => {
      if (cached[i]) {
        map.set(id, cached[i]!);
      } else {
        missingIds.push(id);
      }
    });
  } else {
    missingIds.push(...storeIds);
  }

  // 2. Fetch only the cache-misses from Supabase
  if (missingIds.length > 0) {
    const { data: stores } = await supabaseAdmin
      .from('stores')
      .select('id, name, lat, lng')
      .in('id', missingIds);

    (stores ?? []).forEach(
      (s: { id: string; name: string; lat: number | null; lng: number | null }) => {
        const meta: StoreMeta = { name: s.name, lat: s.lat, lng: s.lng };
        map.set(s.id, meta);
        // 3. Back-fill Redis asynchronously (fire-and-forget)
        if (redis) {
          redis
            .set<StoreMeta>(`store:${s.id}`, meta, { ex: STORE_META_TTL_SECONDS })
            .catch((err) => console.warn('[store-cache] Redis write error', err));
        }
      },
    );
  }

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
 *
 * Sorting strategy:
 *   'near'  — closest store first (distance from user), regardless of cost
 *   'cheap' — most-complete basket first, then lowest total cost
 */
function buildBasketResult(
  itemResults: ItemSearchResult[],
  opts: { strategy: 'near' | 'cheap'; userLat?: number | null; userLng?: number | null } = { strategy: 'cheap' },
): {
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

  // ── Sort by strategy ────────────────────────────────────────────────────────
  if (opts.strategy === 'near' && opts.userLat != null && opts.userLng != null) {
    // Near Me: closest store first. A 200 m store ranks above a 5 km store
    // even if it's slightly more expensive.
    const { userLat, userLng } = opts;
    storeOptions.sort((a, b) => {
      const distA =
        a.storeLat != null && a.storeLng != null
          ? haversineKm(userLat, userLng, a.storeLat, a.storeLng)
          : Infinity;
      const distB =
        b.storeLat != null && b.storeLng != null
          ? haversineKm(userLat, userLng, b.storeLat, b.storeLng)
          : Infinity;
      return distA - distB;
    });
  } else {
    // Lowest Price: most-complete basket first, then cheapest total
    storeOptions.sort((a, b) =>
      b.itemsFound !== a.itemsFound
        ? b.itemsFound - a.itemsFound
        : a.totalCost - b.totalCost,
    );
  }

  // Savings = price spread among stores that carry the full basket
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
  // ── Security guard (rate limit + geo-block + VPN detection) ───────────────
  const guard = await guardRequest(req);
  if (!guard.allowed) return guard.response!;

  const { searchParams } = req.nextUrl;
  const query         = searchParams.get('q')?.trim();
  const storeFilter   = searchParams.get('store') ?? undefined;
  const limit         = Math.min(parseInt(searchParams.get('limit') ?? '10', 10) || 10, 50);
  const userLat       = searchParams.get('user_lat') ? parseFloat(searchParams.get('user_lat')!) : null;
  const userLng       = searchParams.get('user_lng') ? parseFloat(searchParams.get('user_lng')!) : null;
  const strategy      = searchParams.get('strategy') === 'near' ? 'near' : 'cheap';
  const maxDistanceKm = searchParams.get('max_distance_km')
    ? parseFloat(searchParams.get('max_distance_km')!)
    : 1.5;

  if (!query) {
    return NextResponse.json({ error: 'Missing required param: q' }, { status: 400 });
  }

  // Near Me requires coordinates
  if (strategy === 'near' && (userLat == null || userLng == null)) {
    return NextResponse.json(
      { error: 'Near Me strategy requires user_lat and user_lng' },
      { status: 400 },
    );
  }

  // ── Semantic intent check (LangChain + Redis cache) ───────────────────────
  // Runs after regex validation (validateQuery, client-side) and guard to
  // avoid wasting OpenAI credits on rate-limited or geo-blocked requests.
  // Client IP is forwarded to Langfuse as userId for per-user trace grouping.
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
  const isProductQuery = await checkProductIntent(query, clientIp);
  if (!isProductQuery) {
    return NextResponse.json(
      { error: 'That doesn\'t look like a product search. Try "חלב", "eggs", or "молоко".' },
      { status: 400 },
    );
  }

  const isNear = strategy === 'near';

  // ── Basket detection ──────────────────────────────────────────────────────
  const basketItems = parseBasketItems(query);
  const isBasket    = basketItems !== null;

  // ── Cache key ─────────────────────────────────────────────────────────────
  // Basket key: sort items alphabetically so "milk, eggs" and "eggs, milk" share cache.
  // storeFilter is appended when present so filtered results don't collide with
  // global results for the same query.
  // Near Me results are location-dependent — never cache them.
  const storeSegment = storeFilter ? `:store:${storeFilter}` : '';
  const cacheKey = isBasket
    ? `search:cache:basket:${createHash('sha256')
        .update([...basketItems!].sort().join('|').toLowerCase())
        .digest('hex')}${storeSegment}`
    : `search:cache:${createHash('sha256').update(query.toLowerCase()).digest('hex')}${storeSegment}`;

  // ── 0. Redis cache check (skipped for Near Me — results are location-dependent) ──
  if (redis && !isNear) {
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
    // For Near Me, request 3× more results per item so nearby stores are
    // represented even if they rank lower by semantic similarity.
    const basePerItem  = Math.max(3, Math.ceil(limit / basketItems!.length) + 2);
    const perItemLimit = isNear ? Math.min(basePerItem * 3, 30) : basePerItem;

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

    // For Near Me, filter each item's products to nearby stores before aggregating
    if (isNear) {
      itemResults = itemResults.map((ir) => ({
        ...ir,
        products: filterNearProducts(ir.products, userLat!, userLng!, maxDistanceKm),
      }));
    }

    const { allProducts, basket } = buildBasketResult(itemResults, {
      strategy: isNear ? 'near' : 'cheap',
      userLat,
      userLng,
    });

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

    if (redis && !isNear) {
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

  // 2. Semantic search via RPC.
  //    Near Me: request 3× the limit so nearby stores are represented even if
  //    they rank lower by semantic similarity.  Cheap: standard count.
  const dbLimit = isNear ? Math.min(limit * 3, 50) : limit;
  const rpcParams: Record<string, unknown> = {
    query_embedding: queryEmbedding,
    match_threshold: 0.25,
    match_count:     dbLimit,
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

  // 4. Shape into CachedResult (storeLat/storeLng included for distance calc)
  let cachedResults: CachedResult[] = rawResults.map((r) => ({
    id:             r.id,
    storeId:        r.store_id,
    storeName:      storeMap.get(r.store_id)?.name ?? 'Unknown Store',
    normalizedName: r.normalized_name,
    nameHe:         r.name_he,
    nameRu:         r.name_ru,
    nameEn:         r.name_en,
    category:       r.category,
    price:          r.price,
    quantity:       r.quantity,
    unit:           r.unit,
    barcode:        r.barcode,
    similarity:     r.similarity,
    storeLat:       storeMap.get(r.store_id)?.lat  ?? null,
    storeLng:       storeMap.get(r.store_id)?.lng  ?? null,
  }));

  // 5. Near Me: filter to nearby stores then sort by distance ASC.
  //    This must happen BEFORE the LLM answer so the AI describes the actual
  //    results the client will see (not pre-filter data).
  if (isNear) {
    cachedResults = filterNear(cachedResults, userLat!, userLng!, maxDistanceKm);
    // Sort by distance ascending — a 200 m store ranks above a 5 km store
    cachedResults.sort((a, b) => {
      const distA =
        a.storeLat != null && a.storeLng != null
          ? haversineKm(userLat!, userLng!, a.storeLat, a.storeLng)
          : Infinity;
      const distB =
        b.storeLat != null && b.storeLng != null
          ? haversineKm(userLat!, userLng!, b.storeLat, b.storeLng)
          : Infinity;
      return distA - distB;
    });
    cachedResults = cachedResults.slice(0, limit);
  }

  // 6. GPT-4o-mini answer — generated AFTER filtering so the AI describes the
  //    exact result set the client will receive.
  let answer: string;
  try {
    answer = await generateSearchAnswer(
      query,
      cachedResults.map((r) => ({
        normalizedName: r.normalizedName,
        price:          r.price,
        quantity:       r.quantity,
        unit:           r.unit,
        storeName:      r.storeName,
      })),
    );
  } catch (err) {
    console.error('[search] answer generation error', err);
    answer = cachedResults.length > 0
      ? `Found ${cachedResults.length} result(s) for "${query}".`
      : `No results found for "${query}".`;
  }

  // 7. Write to Redis (TTL 24 h) — skipped for Near Me (location-dependent)
  if (redis && !isNear) {
    redis
      .set<CachedSearchPayload>(cacheKey, { answer, results: cachedResults }, { ex: CACHE_TTL_SECONDS })
      .catch((err) => console.warn('[search] Redis write error', err));
  }

  return NextResponse.json({
    answer,
    results: withDistances(cachedResults, userLat, userLng),
  });
}
