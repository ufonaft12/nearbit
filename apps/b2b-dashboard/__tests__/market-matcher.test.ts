/**
 * Tests for lib/utils/market-matcher.ts — matchProductToMarket
 *
 * Three-step cascade:
 *   Step 1  Cache hit   → return cached result immediately
 *   Step 2  pgvector    → clear winner (high similarity + gap) → return vector match
 *                        ambiguous results → fall through to Step 3
 *   Step 3  LLM         → parsed match with confidence ≥ 0.5 → return llm match
 *                        low confidence / null id → return null
 *                        unparseable response → return null
 *                        no candidates → return null
 *
 * Extra branches:
 *   - No embedding on merchant product → skips step 2, goes to fallback candidates
 *   - pgvector RPC error → logs error, continues to step 3
 *   - All steps fail (exception) → returns null (outer catch)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock objects (accessible both inside vi.mock factories AND in tests) ──

const {
  mockSpan,
  mockTrace,
  mockLf,
  productMatchesChain,
  productsEmbeddingChain,
  mockSupabase,
  mockInvoke,
  mockPipe,
  mockFromTemplate,
} = vi.hoisted(() => {
  const mockSpan = {
    end: vi.fn(),
    generation: vi.fn().mockReturnValue({ end: vi.fn() }),
  };
  const mockTrace = {
    update: vi.fn(),
    span: vi.fn().mockReturnValue(mockSpan),
  };
  const mockLf = {
    trace: vi.fn().mockReturnValue(mockTrace),
    flushAsync: vi.fn().mockResolvedValue(undefined),
  };

  const productMatchesChain: Record<string, ReturnType<typeof vi.fn>> = {
    select:     vi.fn().mockReturnThis(),
    eq:         vi.fn().mockReturnThis(),
    order:      vi.fn().mockReturnThis(),
    limit:      vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    upsert:      vi.fn().mockResolvedValue({ error: null }),
  };

  const productsEmbeddingChain: Record<string, ReturnType<typeof vi.fn>> = {
    select:     vi.fn().mockReturnThis(),
    eq:         vi.fn().mockReturnThis(),
    neq:        vi.fn().mockReturnThis(),
    ilike:      vi.fn().mockReturnThis(),
    limit:      vi.fn().mockResolvedValue({ data: [] }),
    maybeSingle: vi.fn().mockResolvedValue({ data: { embedding: "vector-data" } }),
  };

  const mockSupabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "product_matches") return productMatchesChain;
      return productsEmbeddingChain;
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  };

  const mockInvoke = vi.fn().mockResolvedValue({
    content: '{"id": "competitor-abc", "confidence": 0.9}',
  });
  const mockPipe = vi.fn().mockReturnValue({ invoke: mockInvoke });
  const mockFromTemplate = vi.fn().mockReturnValue({ pipe: mockPipe });

  return {
    mockSpan,
    mockTrace,
    mockLf,
    productMatchesChain,
    productsEmbeddingChain,
    mockSupabase,
    mockInvoke,
    mockPipe,
    mockFromTemplate,
  };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/langfuse/client", () => ({
  getLangfuse: vi.fn().mockReturnValue(mockLf),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(function () {
    /* constructor — vi.mock replaces the stub */
  }),
}));

vi.mock("@langchain/core/prompts", () => ({
  PromptTemplate: {
    fromTemplate: mockFromTemplate,
  },
}));

// ── SUT import ────────────────────────────────────────────────────────────────

import { matchProductToMarket } from "@/lib/utils/market-matcher";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCandidate(id: string, similarity: number) {
  return {
    id,
    store_id: "competitor-store",
    chain: "Rami Levy",
    city: "Beer Sheva",
    name_he: "חלב 3%",
    name_en: "Milk 3%",
    name_ru: null,
    price: 5.5,
    unit: "liter",
    updated_at: new Date().toISOString(),
    similarity,
  };
}

const BASE_INPUT = {
  merchantProductId: "merchant-p1",
  productNameHe: "חלב 3%",
  merchantStoreId: "store-1",
};

beforeEach(() => {
  vi.clearAllMocks();

  // Re-attach default return values after clearAllMocks
  productMatchesChain.select.mockReturnThis();
  productMatchesChain.eq.mockReturnThis();
  productMatchesChain.order.mockReturnThis();
  productMatchesChain.limit.mockReturnThis();
  productMatchesChain.maybeSingle.mockResolvedValue({ data: null });
  productMatchesChain.upsert.mockResolvedValue({ error: null });

  productsEmbeddingChain.select.mockReturnThis();
  productsEmbeddingChain.eq.mockReturnThis();
  productsEmbeddingChain.neq.mockReturnThis();
  productsEmbeddingChain.ilike.mockReturnThis();
  productsEmbeddingChain.limit.mockResolvedValue({ data: [] });
  productsEmbeddingChain.maybeSingle.mockResolvedValue({ data: { embedding: "vec" } });

  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "product_matches") return productMatchesChain;
    return productsEmbeddingChain;
  });
  mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

  mockInvoke.mockResolvedValue({ content: '{"id": "competitor-abc", "confidence": 0.9}' });
  mockPipe.mockReturnValue({ invoke: mockInvoke });
  mockFromTemplate.mockReturnValue({ pipe: mockPipe });

  mockLf.trace.mockReturnValue(mockTrace);
  mockLf.flushAsync.mockResolvedValue(undefined);
  mockTrace.span.mockReturnValue(mockSpan);
});

// ── Step 1: Cache ─────────────────────────────────────────────────────────────

describe("matchProductToMarket — Step 1 (cache)", () => {
  it("returns cached result immediately on cache hit", async () => {
    productMatchesChain.maybeSingle.mockResolvedValue({
      data: {
        competitor_product_id: "cached-id",
        match_method: "vector",
        confidence: 0.95,
      },
    });

    const result = await matchProductToMarket(BASE_INPUT);

    expect(result).toEqual({
      competitorProductId: "cached-id",
      confidence: 0.95,
      method: "vector",
    });
    // RPC and LLM should NOT be called
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("defaults confidence to 1 when cache row has null confidence", async () => {
    productMatchesChain.maybeSingle.mockResolvedValue({
      data: { competitor_product_id: "x", match_method: "llm", confidence: null },
    });

    const result = await matchProductToMarket(BASE_INPUT);
    expect(result?.confidence).toBe(1);
  });
});

// ── Step 2: pgvector clear winner ─────────────────────────────────────────────

describe("matchProductToMarket — Step 2 (pgvector)", () => {
  it("returns vector match when top candidate has high similarity + clear gap", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [makeCandidate("winner-id", 0.95), makeCandidate("runner-up", 0.88)],
      error: null,
    });

    const result = await matchProductToMarket(BASE_INPUT);

    expect(result).toEqual({
      competitorProductId: "winner-id",
      confidence: 0.95,
      method: "vector",
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("falls through to LLM when gap between top candidates is too small (< 0.05)", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [makeCandidate("c1", 0.93), makeCandidate("c2", 0.92)],
      error: null,
    });
    mockInvoke.mockResolvedValue({ content: '{"id": "c1", "confidence": 0.85}' });

    const result = await matchProductToMarket(BASE_INPUT);

    expect(result?.method).toBe("llm");
    expect(mockInvoke).toHaveBeenCalledOnce();
  });

  it("falls through to LLM when top similarity is below 0.88 threshold", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [makeCandidate("c1", 0.75)],
      error: null,
    });
    mockInvoke.mockResolvedValue({ content: '{"id": "c1", "confidence": 0.7}' });

    const result = await matchProductToMarket(BASE_INPUT);

    expect(result?.method).toBe("llm");
  });

  it("continues to step 3 when RPC returns an error", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: "rpc failure" } });
    mockInvoke.mockResolvedValue({ content: '{"id": null, "confidence": 0}' });

    const result = await matchProductToMarket(BASE_INPUT);
    expect(result).toBeNull();
  });

  it("skips RPC and uses fallback candidates when merchant has no embedding", async () => {
    productsEmbeddingChain.maybeSingle.mockResolvedValue({ data: { embedding: null } });
    // fallback returns empty — no candidates for LLM
    productsEmbeddingChain.limit.mockResolvedValue({ data: [] });

    const result = await matchProductToMarket(BASE_INPUT);

    expect(mockSupabase.rpc).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

// ── Step 3: LLM ───────────────────────────────────────────────────────────────

describe("matchProductToMarket — Step 3 (LLM)", () => {
  beforeEach(() => {
    // Ambiguous vector results to force LLM path
    mockSupabase.rpc.mockResolvedValue({
      data: [makeCandidate("cand-1", 0.80), makeCandidate("cand-2", 0.79)],
      error: null,
    });
  });

  it("returns llm match when LLM response has id + confidence ≥ 0.5", async () => {
    mockInvoke.mockResolvedValue({
      content: '{"id": "cand-1", "confidence": 0.85, "match_reason": "same brand"}',
    });

    const result = await matchProductToMarket(BASE_INPUT);

    expect(result).toEqual({
      competitorProductId: "cand-1",
      confidence: 0.85,
      method: "llm",
    });
  });

  it("returns null when LLM confidence is below 0.5", async () => {
    mockInvoke.mockResolvedValue({
      content: '{"id": "cand-1", "confidence": 0.3, "reject_reason": "different size"}',
    });

    expect(await matchProductToMarket(BASE_INPUT)).toBeNull();
  });

  it("returns null when LLM sets id to null", async () => {
    mockInvoke.mockResolvedValue({
      content: '{"id": null, "confidence": 0, "reject_reason": "no match"}',
    });

    expect(await matchProductToMarket(BASE_INPUT)).toBeNull();
  });

  it("returns null when LLM response is not valid JSON", async () => {
    mockInvoke.mockResolvedValue({ content: "I cannot determine the match." });

    expect(await matchProductToMarket(BASE_INPUT)).toBeNull();
  });

  it("upserts the match to product_matches when LLM succeeds", async () => {
    mockInvoke.mockResolvedValue({ content: '{"id": "cand-1", "confidence": 0.9}' });

    await matchProductToMarket(BASE_INPUT);

    expect(productMatchesChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        merchant_product_id: "merchant-p1",
        competitor_product_id: "cand-1",
        match_method: "llm",
        confidence: 0.9,
      }),
      expect.any(Object)
    );
  });
});

// ── Resilience ────────────────────────────────────────────────────────────────

describe("matchProductToMarket — resilience", () => {
  it("returns null (does not throw) when an unexpected exception occurs", async () => {
    mockSupabase.from.mockImplementationOnce(() => {
      throw new Error("database down");
    });

    await expect(matchProductToMarket(BASE_INPUT)).resolves.toBeNull();
  });

  it("calls lf.flushAsync() even when an exception occurs", async () => {
    mockSupabase.from.mockImplementationOnce(() => {
      throw new Error("crash");
    });

    await matchProductToMarket(BASE_INPUT);
    expect(mockLf.flushAsync).toHaveBeenCalled();
  });
});
