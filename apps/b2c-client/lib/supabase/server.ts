import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client (uses anon key + cookie-based session).
 * Use in Server Components, Server Actions, and Route Handlers.
 *
 * Caching note: each call reads from the request-scoped cookie store —
 * Next.js deduplicates `cookies()` per request, so this is cheap.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll is called from Server Components which cannot set cookies.
            // The middleware handles the actual cookie mutation.
          }
        },
      },
    },
  );
}
