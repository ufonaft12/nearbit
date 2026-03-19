import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * OAuth + Magic Link callback handler.
 * Supabase redirects here after Google OAuth or email confirmation with a `code`.
 * We exchange the code for a session (which sets the auth cookies), then forward
 * the user to their intended destination (or /profile as default).
 *
 * Cache-Control: private, no-store — never cache auth exchange responses.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/profile';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Redirect to login with error param so the UI can show feedback
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
