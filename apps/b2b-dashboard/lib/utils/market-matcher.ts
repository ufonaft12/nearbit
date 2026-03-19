/**
 * Market Intelligence — Smart Product Matcher
 *
 * Matches a merchant product (that has NO barcode) to the closest
 * competitor product already in the shared `products` table.
 *
 * ⚠️  Only call this for products where barcode IS NULL.
 *     Products with barcodes are matched directly in SQL via the
 *     get_market_comparison() RPC — no tokens needed.
 *
 * Match cascade:
 *   1. Cache check          — product_matches table (instant, free)
 *   2. pgvector similarity  — products.embedding <=> (cheap, in-DB)
 *   3. LangChain LLM        — GPT-4o-mini fuzzy name match (last resort)
 *
 * Results are persisted to product_matches so subsequent page loads
 * are free (cache hit at step 1).
 *
 * Langfuse traces every attempt with confidence scores.
 */

import { getLangfuse } from "@/lib/langfuse/client";
import { createClient } from "@/lib/supabase/server";

export interface MatchResult {
  competitorProductId: string;
  confidence: number;
  method: "vector" | "llm";
}

/**
 * Find the best competitor match for a merchant product with no barcode.
 *
 * @param merchantProductId  UUID of the merchant's product
 * @param productName        Hebrew display name (used by LLM fallback)
 * @param merchantStoreId    To exclude merchant's own store from results
 * @param city               Optional city filter for candidate selection
 */
export async function matchProductToMarket(
  merchantProductId: string,
  productName: string,
  merchantStoreId: string,
  city: string | null
): Promise<MatchResult | null> {
  const lf = getLangfuse();
  const trace = lf.trace({
    name: "market-matcher",
    metadata: { merchantProductId, productName, merchantStoreId, city },
  });

  try {
    const supabase = await createClient();

    // ── 1. Cache check ───────────────────────────────────────────────────────
    // Reads product_matches written by a previous run — zero cost.
    const { data: cached } = await supabase
      .from("product_matches")
      .select("competitor_product_id, match_method, confidence")
      .eq("merchant_product_id", merchantProductId)
      .order("confidence", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      trace.update({ output: { source: "cache", method: cached.match_method } });
      await lf.flushAsync();
      return {
        competitorProductId: cached.competitor_product_id,
        confidence: cached.confidence ?? 1,
        method: cached.match_method as MatchResult["method"],
      };
    }

    // ── 2. pgvector similarity ───────────────────────────────────────────────
    // Re-use the existing search_products() RPC from the B2C schema.
    // Fetch the merchant product's own embedding first.
    const { data: merchantProduct } = await supabase
      .from("products")
      .select("embedding")
      .eq("id", merchantProductId)
      .maybeSingle();

    if (merchantProduct?.embedding) {
      const vectorSpan = trace.span({ name: "pgvector-match" });

      // search_products returns results from ALL stores; we filter out our own.
      const { data: vectorResults } = await supabase.rpc("search_products", {
        query_embedding: merchantProduct.embedding,
        match_threshold: 0.75,
        match_count: 10,
      });

      // Pick the best result from a competitor store (same city preferred)
      const candidates = (vectorResults ?? []).filter(
        (r: { store_id: string; city?: string }) => r.store_id !== merchantStoreId
      );
      const best = city
        ? (candidates.find(
            (r: { city?: string }) => r.city?.toLowerCase() === city.toLowerCase()
          ) ?? candidates[0])
        : candidates[0];

      vectorSpan.end({ output: { found: !!best, similarity: best?.similarity } });

      if (best && best.similarity >= 0.75) {
        await persistMatch(supabase, merchantProductId, best.id, "vector", best.similarity);
        trace.update({ output: { method: "vector", confidence: best.similarity } });
        await lf.flushAsync();
        return {
          competitorProductId: best.id,
          confidence: best.similarity,
          method: "vector",
        };
      }
    }

    // ── 3. LangChain LLM fuzzy match ─────────────────────────────────────────
    // Last resort: runs only when there's no embedding and no barcode.
    // Fetches a small candidate set by city, then asks GPT-4o-mini to match.
    const llmSpan = trace.span({ name: "llm-fuzzy-match" });

    const candidateQuery = supabase
      .from("products")
      .select("id, name_he, name_en, price, stores!inner(chain, city)")
      .neq("store_id", merchantStoreId)
      .eq("is_available", true)
      .limit(50);
    if (city) candidateQuery.ilike("stores.city", `%${city}%`);

    const { data: candidates } = await candidateQuery;

    if (!candidates || candidates.length === 0) {
      llmSpan.end({ output: { found: false, reason: "no candidates" } });
      await lf.flushAsync();
      return null;
    }

    const { ChatOpenAI } = await import("@langchain/openai");
    const { PromptTemplate } = await import("@langchain/core/prompts");

    const model = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = PromptTemplate.fromTemplate(
      `You are a grocery product matching assistant for an Israeli supermarket.

Merchant product: "{product_name}"

Competitor products (id | name_he | name_en | chain | price):
{candidates}

Find the single best match. Consider brand, product type, and size/volume.
Respond with ONLY a JSON object:
{{"id": "<uuid>", "confidence": <0.0-1.0>, "reason": "<one sentence>"}}

If no good match (confidence < 0.5):
{{"id": null, "confidence": 0, "reason": "no match"}}`
    );

    const candidateList = (candidates as Array<{
      id: string;
      name_he: string;
      name_en: string | null;
      price: number;
      stores: { chain?: string; city?: string } | Array<{ chain?: string; city?: string }>;
    }>)
      .map((c) => {
        const store = Array.isArray(c.stores) ? c.stores[0] : c.stores;
        return `${c.id} | ${c.name_he} | ${c.name_en ?? ""} | ${store?.chain ?? ""} | ₪${c.price}`;
      })
      .join("\n");

    const chain = prompt.pipe(model);
    const response = await chain.invoke({ product_name: productName, candidates: candidateList });

    let parsed: { id: string | null; confidence: number } = { id: null, confidence: 0 };
    try {
      const text =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);
      const jsonBlock = text.match(/\{[\s\S]*\}/);
      if (jsonBlock) parsed = JSON.parse(jsonBlock[0]);
    } catch {
      // Unparseable LLM output — no match
    }

    llmSpan.generation({
      name: "llm-match-generation",
      model: "gpt-4o-mini",
      input: { product_name: productName, candidate_count: candidates.length },
      output: parsed,
    });
    llmSpan.end({ output: parsed });

    if (parsed.id && parsed.confidence >= 0.5) {
      await persistMatch(supabase, merchantProductId, parsed.id, "llm", parsed.confidence);
      trace.update({ output: { method: "llm", confidence: parsed.confidence } });
      await lf.flushAsync();
      return {
        competitorProductId: parsed.id,
        confidence: parsed.confidence,
        method: "llm",
      };
    }

    await lf.flushAsync();
    return null;
  } catch (error) {
    trace.update({ output: { error: String(error) } });
    await lf.flushAsync();
    return null;
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

async function persistMatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  merchantProductId: string,
  competitorProductId: string,
  method: "vector" | "llm",
  confidence: number
) {
  await supabase.from("product_matches").upsert(
    {
      merchant_product_id: merchantProductId,
      competitor_product_id: competitorProductId,
      match_method: method,
      confidence,
    },
    { onConflict: "merchant_product_id,competitor_product_id" }
  );
}
