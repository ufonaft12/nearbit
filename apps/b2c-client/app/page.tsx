'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  memo,
  type FormEvent,
  type ChangeEvent,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { debounce, throttle } from 'lodash';

import { fetchSearch, SearchError, MIN_QUERY_LENGTH, MAX_QUERY_LENGTH } from '@/lib/search';
import type { SearchResultWithStore } from '@/types/nearbit';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS  = 400;  // keystroke → API call delay
const THROTTLE_MS  = 800;  // suggestion chip min interval
const SUGGESTIONS  = ['חומוס', 'חלב', 'לחם', 'ביצים', 'שוקולד', 'במבה'] as const;

// ─── ProductCard ──────────────────────────────────────────────────────────────
// Extracted + memoised: won't re-render when the parent re-renders due to
// inputValue changes during typing. Only re-renders if this specific result
// object is replaced (reference inequality from a new fetch).

interface ProductCardProps {
  result: SearchResultWithStore;
}

const ProductCard = memo(function ProductCard({ result: r }: ProductCardProps) {
  // useMemo: subtitle string is a non-trivial filter+join; skip recomputation
  // on any parent render that doesn't change this card's props.
  const subtitle = useMemo(
    () => [r.nameEn, r.category, r.unit].filter(Boolean).join(' · '),
    [r.nameEn, r.category, r.unit],
  );

  return (
    <li className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span
          className="font-medium text-zinc-900 dark:text-zinc-50 truncate"
          dir="rtl"
          title={r.nameHe ?? r.normalizedName}
        >
          {r.nameHe ?? r.normalizedName}
        </span>

        {subtitle && (
          <span className="text-sm text-zinc-500 truncate">{subtitle}</span>
        )}

        <span className="text-xs text-zinc-400">{r.storeName}</span>
      </div>

      <div className="flex flex-col items-end shrink-0 gap-1">
        {r.price != null && (
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            ₪{r.price.toFixed(2)}
          </span>
        )}
        <span className="text-[11px] text-zinc-400">
          {(r.similarity * 100).toFixed(0)}% match
        </span>
      </div>
    </li>
  );
});

// ─── Home ─────────────────────────────────────────────────────────────────────

export default function Home() {
  // inputValue  — the live value shown in the <input> (updates on every keystroke)
  // committedQuery — debounced snapshot that drives the TanStack Query key
  //                  (only changes 400 ms after the last keystroke, or on submit)
  const [inputValue, setInputValue]       = useState('');
  const [committedQuery, setCommittedQuery] = useState('');

  // ── Debounce ───────────────────────────────────────────────────────────────
  // useRef keeps the same debounced function instance across renders so its
  // internal timer is never reset by a re-render. Lodash debounce is used
  // explicitly (not a useEffect timer) because it provides .cancel() and
  // .flush() which we need for the immediate-submit path.
  const debouncedCommit = useRef(
    debounce((value: string) => {
      const trimmed = value.trim();
      if (trimmed.length >= MIN_QUERY_LENGTH) {
        setCommittedQuery(trimmed);
      }
    }, DEBOUNCE_MS),
  ).current;

  // Cancel any pending debounce on unmount to prevent state updates on an
  // unmounted component (relevant in React Strict Mode double-invocation).
  useEffect(() => () => debouncedCommit.cancel(), [debouncedCommit]);

  // ── Input handler ──────────────────────────────────────────────────────────
  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      // Hard-clamp at MAX_QUERY_LENGTH so oversized pastes can't reach the API.
      const value = e.target.value.slice(0, MAX_QUERY_LENGTH);
      setInputValue(value);
      debouncedCommit(value);
    },
    [debouncedCommit],
  );

  // ── Form submit ────────────────────────────────────────────────────────────
  // Bypasses the debounce timer — commit immediately on Enter / button click.
  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      debouncedCommit.cancel(); // drop pending debounce so we don't double-fire
      const trimmed = inputValue.trim();
      if (trimmed.length >= MIN_QUERY_LENGTH) {
        setCommittedQuery(trimmed);
      }
    },
    [inputValue, debouncedCommit],
  );

  // ── Suggestion chips ───────────────────────────────────────────────────────
  // Throttle: rapid-clicking a chip only triggers one search per THROTTLE_MS.
  // `trailing: false` — first click wins; ignore clicks until cooldown ends.
  const throttledSuggestion = useRef(
    throttle(
      (s: string) => {
        setInputValue(s);
        setCommittedQuery(s); // suggestions are always >= MIN_QUERY_LENGTH
      },
      THROTTLE_MS,
      { trailing: false },
    ),
  ).current;

  const handleSuggestion = useCallback(
    (s: string) => {
      debouncedCommit.cancel(); // don't let a pending debounce overwrite the chip
      throttledSuggestion(s);
    },
    [debouncedCommit, throttledSuggestion],
  );

  // ── TanStack Query ─────────────────────────────────────────────────────────
  // queryKey includes committedQuery so each unique search term gets its own
  // cache entry. Re-searching "חומוס" is served instantly from cache (5 min
  // staleTime set in QueryClient).
  const { data, isFetching, isError, error, isSuccess } = useQuery({
    queryKey: ['search', committedQuery] as const,
    queryFn: ({ signal }) => fetchSearch(committedQuery, signal),
    // Only fire when there's a meaningful query. The AbortSignal from TanStack
    // cancels the fetch automatically if committedQuery changes mid-flight.
    enabled: committedQuery.length >= MIN_QUERY_LENGTH,
  });

  // ── Derived state ──────────────────────────────────────────────────────────
  const isNetworkError = isError && error instanceof SearchError && error.isNetworkError;
  const hasResults     = isSuccess && data.results.length > 0;
  const showInitialHint = !isFetching && !isSuccess && !isError;
  const nearLimit      = inputValue.length > MAX_QUERY_LENGTH * 0.8;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">

      {/* ── Header ── */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Nearbit
          </span>
          <span className="text-sm text-zinc-400">/ local store search</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12 flex flex-col gap-8">

        {/* ── Search box ── */}
        <section>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="חפש מוצר... (e.g. חומוס, milk, хумус)"
              dir="auto"
              autoComplete="off"
              spellCheck={false}
              maxLength={MAX_QUERY_LENGTH}
              aria-label="Search products"
              className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-base text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
            <button
              type="submit"
              disabled={isFetching || inputValue.trim().length < MIN_QUERY_LENGTH}
              aria-busy={isFetching}
              className="rounded-xl bg-zinc-900 dark:bg-zinc-50 px-5 py-3 text-sm font-semibold text-white dark:text-zinc-900 transition-opacity disabled:opacity-40 hover:opacity-80"
            >
              {isFetching ? '...' : 'Search'}
            </button>
          </form>

          {/* Character counter — only visible when approaching the 500-char limit */}
          {nearLimit && (
            <p className="mt-1 text-right text-xs text-zinc-400">
              {inputValue.length} / {MAX_QUERY_LENGTH}
            </p>
          )}

          {/* Suggestion chips */}
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="group"
            aria-label="Quick suggestions"
          >
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestion(s)}
                className="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* ── Initial hint (before first search) ── */}
        {showInitialHint && (
          <p className="text-center text-sm text-zinc-400">
            Type at least {MIN_QUERY_LENGTH} characters to search across all stores.
          </p>
        )}

        {/* ── Network error ── */}
        {isNetworkError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3"
          >
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Connection error
            </p>
            <p className="mt-0.5 text-sm text-red-600/80 dark:text-red-400/80">
              Could not reach the server. Check your connection and try again.
            </p>
          </div>
        )}

        {/* ── API / server error ── */}
        {isError && !isNetworkError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400"
          >
            {error instanceof Error ? error.message : 'Search failed. Please try again.'}
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {isFetching && (
          <div
            aria-busy="true"
            aria-label="Loading results"
            className="flex flex-col gap-3 animate-pulse"
          >
            <div className="h-16 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-zinc-100 dark:bg-zinc-800/50" />
            ))}
          </div>
        )}

        {/* ── Results ── */}
        {!isFetching && isSuccess && (
          <section aria-label="Search results" className="flex flex-col gap-4">

            {/* LLM answer card */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Assistant
              </p>
              <p
                className="text-base leading-relaxed text-zinc-800 dark:text-zinc-200"
                dir="auto"
              >
                {data.answer}
              </p>
            </div>

            {/* Product list */}
            {hasResults ? (
              <>
                <p className="px-1 text-xs text-zinc-400">
                  {data.results.length} result{data.results.length !== 1 ? 's' : ''}{' '}
                  for &ldquo;{committedQuery}&rdquo;
                </p>
                <ul
                  className="flex flex-col gap-2"
                  role="list"
                  aria-label="Product results"
                >
                  {data.results.map((r) => (
                    <ProductCard key={r.id} result={r} />
                  ))}
                </ul>
              </>
            ) : (
              /* ── Empty state ── */
              <div className="flex flex-col items-center gap-2 py-8 text-zinc-400">
                <span className="text-3xl" aria-hidden="true">🔍</span>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  No products found
                </p>
                <p className="max-w-xs text-center text-xs">
                  Try a different search term, or run{' '}
                  <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 font-mono">
                    npm run seed
                  </code>{' '}
                  to populate the database.
                </p>
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
