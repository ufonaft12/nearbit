import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "./server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * DB-level store query — cached for 60s per user.
 * Uses service role so it works outside request context (inside unstable_cache).
 * Security: userId is already verified by getUser() before this is called.
 */
const fetchStoreCached = unstable_cache(
  async (userId: string) => {
    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await supabase
      .from("stores")
      .select("id, name, name_heb, city, address, phone, chain, logo_url, slug")
      .eq("owner_id", userId)
      .single();
    return data ?? null;
  },
  ["store-by-owner"],
  { revalidate: 60 }
);

/**
 * Per-request store lookup.
 * - getUser()         → verifies JWT with Supabase Auth server (secure, ~300ms)
 * - fetchStoreCached  → DB query cached 60s per userId (0ms on cache hit)
 * - React cache()     → deduplicates calls within the same render tree
 */
export const getStore = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return fetchStoreCached(user.id);
});
