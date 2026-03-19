import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refresh the Supabase session on every request so short-lived tokens
 * are rotated automatically. Also enforces route-level auth guards:
 *   /profile  → requires auth (redirects to /login if not)
 *   /login    → redirects to /profile if already authenticated
 *
 * Caching: middleware runs on every matched request and must NOT be cached.
 * The response carries Set-Cookie headers from Supabase to refresh the token.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write mutated cookies back to both the request and response
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Always call getUser() — this refreshes the session and validates the JWT.
  // IMPORTANT: do not call getSession() here; it trusts the client-side cookie
  // without re-validating, making it unsafe for server-side auth decisions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Protected routes: redirect unauthenticated visitors to /login
  if (pathname.startsWith('/profile') && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Auth routes: skip login page for already-authenticated users
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/profile', request.url));
  }

  // Ensure auth pages are never cached by CDN/browser
  if (pathname === '/login' || pathname.startsWith('/profile')) {
    response.headers.set('Cache-Control', 'private, no-store');
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except: static files, images, fonts, api routes, _next internals
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};
