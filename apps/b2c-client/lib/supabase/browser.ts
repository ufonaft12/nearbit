import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client (uses anon key).
 * Safe to use in Client Components; stores session in cookies automatically.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
