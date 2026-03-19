"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CompetitorDetail {
  chain: string | null;
  city: string | null;
  price: number;
}

export interface MarketComparison {
  product_id: string;
  best_price: number;
  best_chain: string | null;
  market_avg: number;
  competitor_count: number;
  competitors: CompetitorDetail[];
}

// ── Server Actions ────────────────────────────────────────────────────────────

/**
 * Fetch market comparison data for all products of the current user's store.
 * Calls the `get_market_comparison` Supabase RPC.
 *
 * @param city - optional city filter (e.g. "Beer Sheva")
 * @returns plain object keyed by product_id for easy client-side lookup
 */
export async function getMarketComparisons(
  city?: string
): Promise<Record<string, MarketComparison>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!store) return {};

  const { data, error } = await supabase.rpc("get_market_comparison", {
    p_store_id: store.id,
    p_city: city ?? null,
  });

  if (error || !data) return {};

  return Object.fromEntries(
    (data as MarketComparison[]).map((row) => [row.product_id, row])
  );
}

/**
 * Set the product price to (market_average − ₪0.10).
 * Logs the change to price_history via the existing DB trigger.
 */
export async function matchMarketPriceAction(
  productId: string
): Promise<{ success: boolean; newPrice?: number; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!store) return { success: false, error: "Store not found" };

  // Fetch fresh market data for this store (city-independent for Match Market)
  const { data: comparisons, error: rpcError } = await supabase.rpc(
    "get_market_comparison",
    { p_store_id: store.id, p_city: null, p_limit: 1000 }
  );

  if (rpcError) return { success: false, error: rpcError.message };

  const comparison = (comparisons as MarketComparison[] | null)?.find(
    (c) => c.product_id === productId
  );

  if (!comparison?.market_avg) {
    return { success: false, error: "No market data available for this product" };
  }

  const newPrice = Math.max(0.01, Number(comparison.market_avg) - 0.1);
  const rounded = Math.round(newPrice * 100) / 100;

  const { error: updateError } = await supabase
    .from("products")
    .update({ price: rounded })
    .eq("id", productId)
    .eq("store_id", store.id);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath("/business/inventory");
  return { success: true, newPrice: rounded };
}
