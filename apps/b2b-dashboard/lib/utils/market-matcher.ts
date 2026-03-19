/**
 * Market Intelligence — Smart Product Matcher
 *
 * Matches a merchant's product to the closest entry in global_market_prices.
 *
 * Match priority:
 *   1. Barcode exact match           (confidence = 1.0)
 *   2. LangChain LLM fuzzy match     (confidence = 0.5–1.0)
 *
 * Results are cached in product_matches so the heavy LLM call
 * runs only once per new product.
 *
 * Langfuse traces every match attempt with confidence scores.
 */

import { getLangfuse } from "@/lib/langfuse/client";
import { createClient } from "@/lib/supabase/server";

export interface MatchResult {
  marketPriceId: number;
  confidence: number;
  method: "barcode" | "vector" | "llm";
}

/**
 * Match a single merchant product to the best global_market_prices entry.
 * Returns null if no match found with confidence >= 0.5.
 */
export async function matchProductToMarket(
  merchantProductId: string,
  productName: string,
  barcode: string | null,
  city: string | null
): Promise<MatchResult | null> {
  const lf = getLangfuse();
  const trace = lf.trace({
    name: "market-matcher",
    metadata: { merchantProductId, productName, barcode, city },
  });

  try {
    const supabase = await createClient();

    // ── 1. Check cache ──────────────────────────────────────────────────────
    const { data: cached } = await supabase
      .from("product_matches")
      .select("market_price_id, match_method, confidence")
      .eq("merchant_product_id", merchantProductId)
      .order("confidence", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      trace.update({ output: { source: "cache", method: cached.match_method } });
      await lf.flushAsync();
      return {
        marketPriceId: cached.market_price_id,
        confidence: cached.confidence ?? 1,
        method: cached.match_method as MatchResult["method"],
      };
    }

    // ── 2. Barcode exact match ───────────────────────────────────────────────
    if (barcode) {
      const barcodeSpan = trace.span({ name: "barcode-match" });
      const { data: barcodeHit } = await supabase
        .from("global_market_prices")
        .select("id")
        .eq("barcode", barcode)
        .limit(1)
        .maybeSingle();
      barcodeSpan.end({ output: { found: !!barcodeHit } });

      if (barcodeHit) {
        await persistMatch(supabase, merchantProductId, barcodeHit.id, "barcode", 1.0);
        trace.update({ output: { method: "barcode", confidence: 1.0 } });
        await lf.flushAsync();
        return { marketPriceId: barcodeHit.id, confidence: 1.0, method: "barcode" };
      }
    }

    // ── 3. LLM fuzzy match via LangChain ────────────────────────────────────
    const llmSpan = trace.span({ name: "llm-fuzzy-match" });

    // Fetch a limited set of candidates (filtered by city when available)
    const candidateQuery = supabase
      .from("global_market_prices")
      .select("id, name_he, name_en, price, chain")
      .limit(60);
    if (city) candidateQuery.ilike("city", `%${city}%`);

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

Find the single best match. Consider brand name, product type, and size/volume.
Respond with ONLY a JSON object:
{{"id": <number>, "confidence": <0.0–1.0>, "reason": "<one sentence>"}}

If no good match exists (confidence < 0.5):
{{"id": null, "confidence": 0, "reason": "no match"}}`
    );

    const candidateList = candidates
      .map(
        (c) =>
          `${c.id} | ${c.name_he} | ${c.name_en ?? ""} | ${c.chain ?? ""} | ₪${c.price}`
      )
      .join("\n");

    const chain = prompt.pipe(model);
    const response = await chain.invoke({
      product_name: productName,
      candidates: candidateList,
    });

    let parsed: { id: number | null; confidence: number } = { id: null, confidence: 0 };
    try {
      const text =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);
      const jsonBlock = text.match(/\{[\s\S]*\}/);
      if (jsonBlock) parsed = JSON.parse(jsonBlock[0]);
    } catch {
      // LLM returned unparseable output — treat as no match
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
      return { marketPriceId: parsed.id, confidence: parsed.confidence, method: "llm" };
    }

    await lf.flushAsync();
    return null;
  } catch (error) {
    trace.update({ output: { error: String(error) } });
    await lf.flushAsync();
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function persistMatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  merchantProductId: string,
  marketPriceId: number,
  method: "barcode" | "vector" | "llm",
  confidence: number
) {
  await supabase.from("product_matches").upsert(
    {
      merchant_product_id: merchantProductId,
      market_price_id: marketPriceId,
      match_method: method,
      confidence,
    },
    { onConflict: "merchant_product_id,market_price_id" }
  );
}
