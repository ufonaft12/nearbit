'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

/**
 * Lightweight auth-state button for the Header.
 * Subscribes to Supabase auth state changes so it updates instantly after
 * sign-in / sign-out without a full page refresh.
 *
 * Renders nothing during SSR (avoids hydration mismatch) then shows the
 * correct state after mount.
 */
export function UserButton() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // Seed with the current session immediately
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));

    // Keep in sync as auth state changes (sign-in, sign-out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // During SSR or before hydration — render nothing to avoid flicker
  if (user === undefined) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
      >
        Sign in
      </Link>
    );
  }

  // Authenticated: show a small avatar-style button linking to /profile
  const initials = (user.email ?? '?').slice(0, 1).toUpperCase();

  return (
    <Link
      href="/profile"
      title={user.email ?? 'Profile'}
      className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold hover:bg-blue-700 transition-colors"
      aria-label="Go to profile"
    >
      {initials}
    </Link>
  );
}
