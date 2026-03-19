import type { Metadata } from 'next';
import { AuthForm } from '@/app/components/auth/AuthForm';

export const metadata: Metadata = {
  title: 'Sign in | Nearbit',
  description: 'Sign in to your Nearbit account to save searches and track prices.',
};

/**
 * Login / register page.
 * Cache-Control is set to private, no-store by middleware — this page must
 * never be served from a CDN cache because its content depends on auth state.
 */
export default function LoginPage() {
  return (
    <main className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <AuthForm />
    </main>
  );
}
