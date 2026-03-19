'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { signInAction, signUpAction, signInWithGoogleAction } from '@/app/login/actions';
import type { AuthActionResult } from '@/app/login/actions';

type Mode = 'signin' | 'signup';

/**
 * Combined sign-in / sign-up form.
 * Uses React's useTransition so the UI shows a loading state while the
 * Server Action is in flight, without blocking the main thread.
 */
export function AuthForm() {
  const t = useTranslations('auth');
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCheckEmail, setShowCheckEmail] = useState(false);
  const [isPending, startTransition] = useTransition();

  function switchMode(next: Mode) {
    setMode(next);
    setError(null); // clear error when the user switches mode
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      let result: AuthActionResult;

      if (mode === 'signin') {
        result = await signInAction(email, password);
        if (result?.error) setError(result.error);
        // On success, signInAction calls redirect('/profile') server-side
      } else {
        result = await signUpAction(email, password);
        if (result?.error) {
          setError(result.error);
        } else {
          setShowCheckEmail(true);
        }
      }
    });
  }

  if (showCheckEmail) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <p role="status" className="text-zinc-700 dark:text-zinc-300">
          {t('check_email')}
        </p>
        <button
          type="button"
          className="text-sm text-zinc-500 underline"
          onClick={() => {
            setShowCheckEmail(false);
            switchMode('signin');
          }}
        >
          {t('switch_to_signin')}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {mode === 'signin' ? t('signin_title') : t('signup_title')}
      </h1>

      <form aria-label={mode === 'signin' ? t('signin_title') : t('signup_title')} onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          name="email"
          aria-label={t('email_placeholder')}
          placeholder={t('email_placeholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />

        <input
          type="password"
          name="password"
          aria-label={t('password_placeholder')}
          placeholder={t('password_placeholder')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 transition-colors"
        >
          {isPending
            ? t('loading')
            : mode === 'signin'
              ? t('signin_submit')
              : t('signup_submit')}
        </button>
      </form>

      {/* Divider */}
      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
        <span className="text-xs text-zinc-400">or</span>
        <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
      </div>

      {/* Google OAuth */}
      <button
        type="button"
        onClick={() => startTransition(() => signInWithGoogleAction())}
        disabled={isPending}
        className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 py-2.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-60"
      >
        {/* Google G icon */}
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        {t('google_button')}
      </button>

      {/* Mode switcher */}
      <button
        type="button"
        className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
      >
        {mode === 'signin' ? t('switch_to_signup') : t('switch_to_signin')}
      </button>
    </div>
  );
}
