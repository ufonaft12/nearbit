import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase/client';
import { getQueryEmbedding, generateSearchAnswer } from '@/lib/ai/openai';
import type { SearchResult } from '@/types/nearbit';

// ============================================================
// GET /api/search?q=<query>[&store=<uuid>][&limit=<n>]
//
// Pipeline:
//   1. Embed the query with text-embedding-3-small
//   2. Call match_products RPC (cosine similarity)
//   3. Optionally fetch store names for display
//   4. Use GPT-4o-mini to produce a natural-language answer
//   5. Return { answer, results }
// ============================================================

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const query = searchParams.get('q')?.trim();
  const storeFilter = searchParams.get('store') ?? undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10) || 10, 50);

  if (!query) {
    return NextResponse.json(
      { error: 'Missing required param: q' },
      { status: 400 }
    );
  }

  // 1. Embed the user query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await getQueryEmbedding(query);
  } catch (err) {
    console.error('[search] embedding error', err);
    return NextResponse.json(
      { error: 'Failed to embed query' },
      { status: 502 }
    );
  }

  // 2. Semantic search via match_products RPC
  const rpcParams: Record<string, unknown> = {
    query_embedding: queryEmbedding,
    match_threshold: 0.25,
    match_count: limit,
  };

  // match_products has no store filter; fall back to search_products when needed
  const { data: rows, error: rpcError } = storeFilter
    ? await supabaseAdmin.rpc('search_products', {
        ...rpcParams,
        store_id_filter: storeFilter,
      })
    : await supabaseAdmin.rpc('match_products', rpcParams);

  if (rpcError) {
    console.error('[search] RPC error', rpcError);
    return NextResponse.json(
      { error: 'Search failed', details: rpcError.message },
      { status: 500 }
    );
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

  // 3. Fetch store names for matched store IDs (single DB round-trip)
  const storeIds = [...new Set(rawResults.map((r) => r.store_id))];
  const storeNameMap = new Map<string, string>();

  if (storeIds.length > 0) {
    const { data: stores } = await supabaseAdmin
      .from('stores')
      .select('id, name')
      .in('id', storeIds);

    (stores ?? []).forEach((s: { id: string; name: string }) => {
      storeNameMap.set(s.id, s.name);
    });
  }

  // 4. Shape results into the shared SearchResult type
  const results: (SearchResult & { storeName: string })[] = rawResults.map((r) => ({
    id: r.id,
    storeId: r.store_id,
    storeName: storeNameMap.get(r.store_id) ?? 'Unknown Store',
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

  // 5. GPT-4o-mini answer
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
      }))
    );
  } catch (err) {
    console.error('[search] answer generation error', err);
    // Non-fatal: still return raw results
    answer = results.length > 0
      ? `Found ${results.length} result(s) for "${query}".`
      : `No results found for "${query}".`;
  }

  return NextResponse.json({ answer, results });
}
