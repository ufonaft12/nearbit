/**
 * Market Intelligence — Smart Product Matcher
 *
 * Matches a merchant product (barcode IS NULL) to the closest
 * competitor product in the shared `products` table.
 *
 * ⚠️  Only call for products where barcode IS NULL.
 *     Products with barcodes are resolved in SQL by get_market_comparison().
 *
 * ── Cascade ──────────────────────────────────────────────────────────────────
 *
 *  Step 1 │ CACHE CHECK    product_matches table  →  instant, free
 *  Step 2 │ PGVECTOR ANN   find_competitor_matches() RPC  →  fast, no tokens
 *         │   • similarity ≥ 0.88 AND gap to runner-up ≥ 0.05  →  return
 *         │   • otherwise: hand top-3 candidates to Step 3
 *  Step 3 │ LLM VALIDATE   GPT-4o-mini with strict volume/unit rules
 *         │   Receives only the top-3 vector candidates (not random DB rows)
 *
 * Every match result is upserted to product_matches so future requests
 * for the same merchant product hit Step 1 at zero cost.
 *
 * All steps are wrapped in Langfuse spans for cost/accuracy tracking.
 */

import { getLangfuse } from "@/lib/langfuse/client";
import { createClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatcherInput {
  merchantProductId: string;
  /** Hebrew product name (primary) */
  productNameHe: string;
  /** Russian product name (optional, helps LLM for Russian-named items) */
  productNameRu?: string | null;
  /** Unit from products.unit — used by LLM for volume/weight validation */
  productUnit?: string | null;
  merchantStoreId: string;
  /** Filter to city-local competitors, e.g. "Beer Sheva" */
  city?: string | null;
}

export interface MatchResult {
  competitorProductId: string;
  confidence: number;
  method: "vector" | "llm";
}

/** Shape returned by the find_competitor_matches() Supabase RPC */
interface VectorCandidate {
  id: string;
  store_id: string;
  chain: string | null;
  city: string | null;
  name_he: string | null;
  name_en: string | null;
  name_ru: string | null;
  price: number;
  unit: string | null;
  updated_at: string;
  similarity: number;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Similarity above which a single clear winner is returned without LLM. */
const VECTOR_HIGH_CONFIDENCE = 0.88;
/** Minimum gap between #1 and #2 for a result to be considered "clear winner". */
const VECTOR_WINNER_GAP = 0.05;
/** Minimum similarity to even bother sending to LLM. */
const VECTOR_MIN_THRESHOLD = 0.60;

// ── Main export ───────────────────────────────────────────────────────────────

export async function matchProductToMarket(
  input: MatcherInput
): Promise<MatchResult | null> {
  const { merchantProductId, productNameHe, productNameRu, productUnit, merchantStoreId, city } =
    input;

  const lf = getLangfuse();
  const trace = lf.trace({
    name: "market-matcher",
    metadata: {
      merchantProductId,
      productNameHe,
      productUnit,
      merchantStoreId,
      city: city ?? null,
    },
  });

  try {
    const supabase = await createClient();

    // ── Step 1: Cache ─────────────────────────────────────────────────────────
    const cacheSpan = trace.span({ name: "step-1-cache" });
    const { data: cached } = await supabase
      .from("product_matches")
      .select("competitor_product_id, match_method, confidence")
      .eq("merchant_product_id", merchantProductId)
      .order("confidence", { ascending: false })
      .limit(1)
      .maybeSingle();
    cacheSpan.end({ output: { hit: !!cached } });

    if (cached) {
      trace.update({ output: { step: 1, method: "cache" } });
      await lf.flushAsync();
      return {
        competitorProductId: cached.competitor_product_id,
        confidence: cached.confidence ?? 1,
        method: cached.match_method as MatchResult["method"],
      };
    }

    // ── Step 2: pgvector ANN ──────────────────────────────────────────────────
    // Fetch the merchant product's embedding.
    const { data: merchantRow } = await supabase
      .from("products")
      .select("embedding")
      .eq("id", merchantProductId)
      .maybeSingle();

    let vectorCandidates: VectorCandidate[] = [];

    if (merchantRow?.embedding) {
      const vectorSpan = trace.span({ name: "step-2-pgvector" });

      const { data: rpcResult, error: rpcErr } = await supabase.rpc(
        "find_competitor_matches",
        {
          p_query_embedding:   merchantRow.embedding,
          p_merchant_store_id: merchantStoreId,
          p_city:              city ?? null,
          p_threshold:         VECTOR_MIN_THRESHOLD,
          p_count:             5,
        }
      );

      vectorCandidates = (rpcResult as VectorCandidate[] | null) ?? [];

      const top = vectorCandidates[0];
      const second = vectorCandidates[1];

      vectorSpan.end({
        output: {
          count: vectorCandidates.length,
          top_similarity: top?.similarity ?? null,
          second_similarity: second?.similarity ?? null,
        },
      });

      if (rpcErr) {
        trace.update({ output: { step: 2, error: rpcErr.message } });
      }

      // Clear single winner — skip LLM entirely
      if (
        top &&
        top.similarity >= VECTOR_HIGH_CONFIDENCE &&
        (!second || top.similarity - second.similarity >= VECTOR_WINNER_GAP)
      ) {
        await persistMatch(supabase, merchantProductId, top.id, "vector", top.similarity);
        trace.update({ output: { step: 2, method: "vector", confidence: top.similarity } });
        await lf.flushAsync();
        return { competitorProductId: top.id, confidence: top.similarity, method: "vector" };
      }
    }

    // ── Step 3: LangChain LLM disambiguation ─────────────────────────────────
    // Only runs when vector results are ambiguous or absent.
    // The LLM receives the TOP-3 VECTOR CANDIDATES (already semantically close),
    // and performs the strict volume / unit / brand validation.
    const llmCandidates = vectorCandidates.length > 0
      ? vectorCandidates.slice(0, 3)
      : await fetchFallbackCandidates(supabase, merchantStoreId, city);

    if (llmCandidates.length === 0) {
      trace.update({ output: { step: 3, reason: "no candidates" } });
      await lf.flushAsync();
      return null;
    }

    const llmSpan = trace.span({ name: "step-3-llm" });

    const { ChatOpenAI } = await import("@langchain/openai");
    const { PromptTemplate } = await import("@langchain/core/prompts");

    const model = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    // Prompt enforces strict volume/weight/unit validation.
    // This is the primary defence against "Cola 0.5L matched to Cola 1.5L" errors.
    const prompt = PromptTemplate.fromTemplate(`\
You are a grocery product matching assistant for an Israeli supermarket.
Product names may be in Hebrew (right-to-left) or Russian.

MERCHANT PRODUCT:
  Hebrew name : {name_he}
  Russian name: {name_ru}
  Unit/size   : {unit}

COMPETITOR CANDIDATES (ranked by embedding similarity):
{candidates}
Each line: index | id | name_he | name_en | chain | unit | price (₪)

MATCHING RULES — apply strictly in this order:
  1. VOLUME / WEIGHT  — Must match exactly. 0.5L ≠ 1.5L, 250g ≠ 500g, 1kg ≠ 500g.
                        If sizes differ, this is NOT a match regardless of brand.
  2. UNIT TYPE        — Price-per-KG product cannot match a price-per-unit product.
  3. BRAND            — Must be the same brand (e.g. Tnuva / תנובה, Osem / אסם).
                        Generic / private-label may match if type and size align.
  4. PRODUCT TYPE     — Same subcategory required (milk ≠ cream, yogurt ≠ cheese).

Respond with ONLY a valid JSON object — no markdown, no extra text:
{{"id": "<uuid or null>", "confidence": <0.0–1.0>, "match_reason": "<≤15 words>", "reject_reason": "<≤15 words or null>"}}

If no candidate satisfies ALL rules above, set id to null and confidence to 0.`);

    const candidateList = llmCandidates
      .map((c, i) =>
        [
          i + 1,
          c.id,
          c.name_he ?? "—",
          c.name_en ?? "—",
          c.chain ?? "—",
          c.unit ?? "—",
          `₪${c.price}`,
        ].join(" | ")
      )
      .join("\n");

    const chain = prompt.pipe(model);
    const response = await chain.invoke({
      name_he:    productNameHe,
      name_ru:    productNameRu ?? "—",
      unit:       productUnit ?? "—",
      candidates: candidateList,
    });

    let parsed: { id: string | null; confidence: number; reject_reason?: string } = {
      id: null,
      confidence: 0,
    };

    try {
      const text =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);
      const jsonBlock = text.match(/\{[\s\S]*?\}/);
      if (jsonBlock) parsed = JSON.parse(jsonBlock[0]);
    } catch {
      // Unparseable — treat as no match
    }

    llmSpan.generation({
      name: "llm-validation",
      model: "gpt-4o-mini",
      input: {
        name_he:         productNameHe,
        unit:            productUnit,
        candidate_count: llmCandidates.length,
      },
      output: parsed,
    });
    llmSpan.end({
      output: {
        matched:       !!parsed.id,
        confidence:    parsed.confidence,
        reject_reason: parsed.reject_reason ?? null,
      },
    });

    if (parsed.id && parsed.confidence >= 0.5) {
      await persistMatch(supabase, merchantProductId, parsed.id, "llm", parsed.confidence);
      trace.update({ output: { step: 3, method: "llm", confidence: parsed.confidence } });
      await lf.flushAsync();
      return {
        competitorProductId: parsed.id,
        confidence: parsed.confidence,
        method: "llm",
      };
    }

    trace.update({
      output: { step: 3, matched: false, reject_reason: parsed.reject_reason ?? "low confidence" },
    });
    await lf.flushAsync();
    return null;
  } catch (error) {
    trace.update({ output: { error: String(error) } });
    await lf.flushAsync();
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fallback candidate fetch when the merchant product has no embedding.
 * Returns up to 50 competitor products filtered by city for LLM to evaluate.
 * This path is rare — it only triggers for products with no barcode AND no embedding.
 */
async function fetchFallbackCandidates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  merchantStoreId: string,
  city: string | null | undefined
): Promise<VectorCandidate[]> {
  const q = supabase
    .from("products")
    .select(
      "id, store_id, name_he, name_en, name_ru, price, unit, updated_at, stores!inner(chain, city)"
    )
    .neq("store_id", merchantStoreId)
    .eq("is_available", true)
    .limit(50);

  if (city) q.ilike("stores.city", `%${city}%`);

  const { data } = await q;
  if (!data) return [];

  return data.map((row: {
    id: string;
    store_id: string;
    name_he: string | null;
    name_en: string | null;
    name_ru: string | null;
    price: number;
    unit: string | null;
    updated_at: string;
    stores: { chain?: string; city?: string } | Array<{ chain?: string; city?: string }>;
  }) => {
    const s = Array.isArray(row.stores) ? row.stores[0] : row.stores;
    return {
      id:         row.id,
      store_id:   row.store_id,
      chain:      s?.chain ?? null,
      city:       s?.city ?? null,
      name_he:    row.name_he,
      name_en:    row.name_en,
      name_ru:    row.name_ru,
      price:      row.price,
      unit:       row.unit,
      updated_at: row.updated_at,
      similarity: 0,
    };
  });
}

async function persistMatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  merchantProductId: string,
  competitorProductId: string,
  method: "vector" | "llm",
  confidence: number
) {
  await supabase.from("product_matches").upsert(
    {
      merchant_product_id:   merchantProductId,
      competitor_product_id: competitorProductId,
      match_method:          method,
      confidence,
    },
    { onConflict: "merchant_product_id,competitor_product_id" }
  );
}
