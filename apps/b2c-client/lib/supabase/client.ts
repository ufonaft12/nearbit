import { createClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY');
}

/**
 * Server-side Supabase client with service role key.
 * Use ONLY in API routes / server components – never expose to the browser.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  }
);
