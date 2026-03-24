import type { User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Fetch the currently authenticated user server-side.
 * Uses getUser() (not getSession()) to validate the JWT against Supabase Auth —
 * this prevents session-fixation attacks and ensures the token is still valid.
 *
 * Caching: Next.js deduplicates requests within a single render pass, so
 * calling this multiple times in one request tree is free after the first call.
 *
 * @returns The authenticated User, or null if unauthenticated / on error.
 */
export async function getServerUser(): Promise<User | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) return null;
    return user;
  } catch {
    return null;
  }
}
