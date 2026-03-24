/**
 * Tests for market server actions: getMarketComparisons, matchMarketPriceAction
 *
 * Covers failure paths:
 *  - No authenticated user → returns {}
 *  - User has no store → returns {}
 *  - Supabase RPC error → returns {}
 *  - RPC returns null data → returns {}
 *  - matchMarketPriceAction: no user → { success: false }
 *  - matchMarketPriceAction: no store → { success: false }
 *  - matchMarketPriceAction: no market data for product → { success: false }
 *  - matchMarketPriceAction: DB update fails → { success: false }
 *  - matchMarketPriceAction: success → { success: true, newPrice }
 *  - newPrice is floored at ₪0.01 (never negative)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock factory ─────────────────────────────────────────────────────

/**
 * Build a chainable Supabase mock.
 * Usage: mockSupabase({ auth: { user }, store, rpcData, rpcError, updateError })
 */
function mockSupabase({
  user = null as { id: string } | null,
  store = null as { id: string; city?: string } | null,
  rpcData = null as unknown[] | null,
  rpcError = null as { message: string } | null,
  updateError = null as { message: string } | null,
} = {}) {
  const rpcMock = vi.fn().mockResolvedValue({ data: rpcData, error: rpcError });
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: updateError }),
    }),
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: store }),
        }),
      }),
      update: updateMock,
    }),
    rpc: rpcMock,
    _rpcMock: rpcMock,
    _updateMock: updateMock,
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getMarketComparisons, matchMarketPriceAction } from "@/lib/actions/market";
import type { MarketComparison } from "@/lib/actions/market";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getMarketComparisons ──────────────────────────────────────────────────────

describe("getMarketComparisons — failure paths", () => {
  it("returns {} when there is no authenticated user", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ user: null }) as never);
    const result = await getMarketComparisons();
    expect(result).toEqual({});
  });

  it("returns {} when user has no store", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ user: { id: "u1" }, store: null }) as never
    );
    const result = await getMarketComparisons();
    expect(result).toEqual({});
  });

  it("returns {} when Supabase RPC returns an error", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({
        user: { id: "u1" },
        store: { id: "s1" },
        rpcError: { message: "function not found" },
      }) as never
    );
    const result = await getMarketComparisons();
    expect(result).toEqual({});
  });

  it("returns {} when Supabase RPC returns null data", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ user: { id: "u1" }, store: { id: "s1" }, rpcData: null }) as never
    );
    const result = await getMarketComparisons();
    expect(result).toEqual({});
  });

  it("returns {} when RPC returns an empty array", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ user: { id: "u1" }, store: { id: "s1" }, rpcData: [] }) as never
    );
    const result = await getMarketComparisons();
    expect(result).toEqual({});
  });
});

describe("getMarketComparisons — success path", () => {
  it("returns a Record keyed by product_id when RPC returns data", async () => {
    const row: MarketComparison = {
      product_id: "prod-abc",
      best_price: 8.0,
      best_chain: "Shufersal",
      market_avg: 9.0,
      competitor_count: 2,
      competitors: [],
    };
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ user: { id: "u1" }, store: { id: "s1" }, rpcData: [row] }) as never
    );
    const result = await getMarketComparisons();
    expect(result).toEqual({ "prod-abc": row });
  });
});

// ── matchMarketPriceAction ────────────────────────────────────────────────────

describe("matchMarketPriceAction — failure paths", () => {
  it("returns { success: false } when user is not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ user: null }) as never);
    const res = await matchMarketPriceAction("prod-1");
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("returns { success: false } when user has no store", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ user: { id: "u1" }, store: null }) as never
    );
    const res = await matchMarketPriceAction("prod-1");
    expect(res).toMatchObject({ success: false, error: "Store not found" });
  });

  it("returns { success: false } when RPC returns an error", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({
        user: { id: "u1" },
        store: { id: "s1" },
        rpcError: { message: "DB timeout" },
      }) as never
    );
    const res = await matchMarketPriceAction("prod-1");
    expect(res).toMatchObject({ success: false });
  });

  it("returns { success: false } when product has no market data", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({
        user: { id: "u1" },
        store: { id: "s1" },
        rpcData: [], // no comparison rows
      }) as never
    );
    const res = await matchMarketPriceAction("prod-unknown");
    expect(res).toMatchObject({ success: false, error: expect.stringContaining("No market data") });
  });

  it("returns { success: false } when market_avg is 0 for the product", async () => {
    const row: MarketComparison = {
      product_id: "prod-1",
      best_price: 0,
      best_chain: null,
      market_avg: 0,
      competitor_count: 0,
      competitors: [],
    };
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ user: { id: "u1" }, store: { id: "s1" }, rpcData: [row] }) as never
    );
    const res = await matchMarketPriceAction("prod-1");
    expect(res).toMatchObject({ success: false });
  });

  it("returns { success: false } when the DB update fails", async () => {
    const row: MarketComparison = {
      product_id: "prod-1",
      best_price: 8.0,
      best_chain: "Shufersal",
      market_avg: 9.0,
      competitor_count: 1,
      competitors: [],
    };
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({
        user: { id: "u1" },
        store: { id: "s1" },
        rpcData: [row],
        updateError: { message: "RLS denied" },
      }) as never
    );
    const res = await matchMarketPriceAction("prod-1");
    expect(res).toMatchObject({ success: false, error: "RLS denied" });
  });
});

describe("matchMarketPriceAction — success + price calculation", () => {
  it("sets newPrice to market_avg − 0.10 on success", async () => {
    const row: MarketComparison = {
      product_id: "prod-1",
      best_price: 8.0,
      best_chain: "Shufersal",
      market_avg: 10.0,
      competitor_count: 3,
      competitors: [],
    };
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ user: { id: "u1" }, store: { id: "s1" }, rpcData: [row] }) as never
    );
    const res = await matchMarketPriceAction("prod-1");
    expect(res).toEqual({ success: true, newPrice: 9.9 });
  });

  it("newPrice is never below ₪0.01 (floor guard)", async () => {
    const row: MarketComparison = {
      product_id: "prod-1",
      best_price: 0.05,
      best_chain: "Test",
      market_avg: 0.05, // market_avg − 0.10 = −0.05 → floored to 0.01
      competitor_count: 1,
      competitors: [],
    };
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ user: { id: "u1" }, store: { id: "s1" }, rpcData: [row] }) as never
    );
    const res = await matchMarketPriceAction("prod-1");
    expect(res).toEqual({ success: true, newPrice: 0.01 });
  });

  it("newPrice is correctly rounded to 2 decimal places", async () => {
    const row: MarketComparison = {
      product_id: "prod-1",
      best_price: 9.0,
      best_chain: "Test",
      market_avg: 10.333, // 10.333 − 0.10 = 10.233 → rounds to 10.23
      competitor_count: 1,
      competitors: [],
    };
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ user: { id: "u1" }, store: { id: "s1" }, rpcData: [row] }) as never
    );
    const res = await matchMarketPriceAction("prod-1");
    expect(res).toEqual({ success: true, newPrice: 10.23 });
  });
});
