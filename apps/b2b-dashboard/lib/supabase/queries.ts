import { cache } from "react";
import { createClient } from "./server";

/**
 * Cached per-request store lookup.
 * React's `cache()` deduplicates identical calls within the same render tree,
 * so layout + page can both call this without hitting Supabase twice.
 */
export const getStore = cache(async () => {
  const supabase = await createClient();
  // getSession() reads JWT from cookie — no network call unless token is expired.
  // Store data is protected by RLS so no extra auth check needed here.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, name_heb, city, address, phone, chain, logo_url, slug")
    .eq("owner_id", session.user.id)
    .single();

  return store ?? null;
});
