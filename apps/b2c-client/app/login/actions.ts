'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// ── Validation schema ──────────────────────────────────────────────────────────

const credentialsSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

export type AuthActionResult = { error: string } | null;

// ── Sign in ────────────────────────────────────────────────────────────────────

export async function signInAction(email: string, password: string): Promise<AuthActionResult> {
  const parsed = credentialsSchema.safeParse({ email, password });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid email or password.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  redirect('/profile');
}

// ── Sign up ────────────────────────────────────────────────────────────────────

export async function signUpAction(email: string, password: string): Promise<AuthActionResult> {
  const parsed = credentialsSchema.safeParse({ email, password });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please use a valid email and a password of at least 8 characters.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
    },
  });

  if (error) return { error: error.message };
  return null; // null = success; UI shows "check your email"
}

// ── Google OAuth ───────────────────────────────────────────────────────────────

export async function signInWithGoogleAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
    },
  });

  if (!error && data.url) redirect(data.url);
}

// ── Sign out ───────────────────────────────────────────────────────────────────

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/');
}
