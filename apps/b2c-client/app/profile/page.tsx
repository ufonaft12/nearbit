import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getServerUser } from '@/lib/auth/getUser';
import { signOutAction } from '@/app/login/actions';
import { SearchHistoryList } from './components/SearchHistoryList';
import { PurchaseLogList } from './components/PurchaseLogList';
import { PriceAnalyticsSection } from './components/PriceAnalyticsSection';

export const metadata: Metadata = {
  title: 'My Profile | Nearbit',
};

// Always render fresh — profile content is user-specific, never cacheable.
export const dynamic = 'force-dynamic';

/**
 * Profile page — Server Component.
 * The user is fetched server-side so there is no loading flash on navigation.
 * History and analytics sections (added in Phase 2 & 3) are Client Components
 * that stream in via React Query with skeleton placeholders.
 */
export default async function ProfilePage() {
  const user = await getServerUser();
  if (!user) redirect('/login');

  const joinedAt = new Date(user.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className="min-h-[calc(100vh-64px)] px-4 py-10">
      <div className="mx-auto max-w-2xl flex flex-col gap-8">

        {/* ── User card ────────────────────────────────────────── */}
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-zinc-900 dark:text-zinc-50 break-all">
              {user.email}
            </p>
            <p className="text-sm text-zinc-400">Member since {joinedAt}</p>
          </div>

          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Sign out
            </button>
          </form>
        </section>

        {/* ── Search history (Phase 2) ─────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
            Search History
          </h2>
          <SearchHistoryList />
        </section>

        {/* ── Purchase log (Phase 2) ───────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
            My Purchases
          </h2>
          <PurchaseLogList />
        </section>

        {/* ── Price analytics (Phase 3) ────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
            Price Trends
          </h2>
          <PriceAnalyticsSection />
        </section>

      </div>
    </main>
  );
}
