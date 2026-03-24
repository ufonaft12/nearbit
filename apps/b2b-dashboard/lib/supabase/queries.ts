import { cache } from "react";
import { createClient } from "./server";

/**
 * Cached per-request store lookup.
 * React's `cache()` deduplicates identical calls within the same render tree,
 * so layout + page can both call this without hitting Supabase twice.
 */
export const getStore = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, name_heb, city, address, phone, chain, logo_url, slug")
    .eq("owner_id", user.id)
    .single();

  return store ?? null;
});
