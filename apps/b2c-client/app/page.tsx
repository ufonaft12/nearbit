'use client';

import { useState, useRef, FormEvent } from 'react';
import type { SearchResult } from '@/types/nearbit';

type SearchResponse = {
  answer: string;
  results: (SearchResult & { storeName: string })[];
};

const SUGGESTIONS = ['חומוס', 'חלב', 'לחם', 'ביצים', 'שוקולד', 'במבה'];

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function runSearch(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Search failed');
      setData(json as SearchResponse);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    runSearch(query);
  }

  function handleSuggestion(s: string) {
    setQuery(s);
    runSearch(s);
    inputRef.current?.focus();
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Nearbit
          </span>
          <span className="text-sm text-zinc-400">/ local store search</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12 flex flex-col gap-8">

        {/* Search box */}
        <section>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חפש מוצר... (e.g. חומוס, milk, хумус)"
              dir="auto"
              className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-base text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="rounded-xl bg-zinc-900 dark:bg-zinc-50 px-5 py-3 text-sm font-semibold text-white dark:text-zinc-900 transition-opacity disabled:opacity-40 hover:opacity-80"
            >
              {loading ? '...' : 'Search'}
            </button>
          </form>

          {/* Quick suggestions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSuggestion(s)}
                className="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex flex-col gap-3 animate-pulse">
            <div className="h-16 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-zinc-100 dark:bg-zinc-800/50" />
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && data && (
          <section className="flex flex-col gap-4">

            {/* LLM answer */}
            <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Assistant
              </p>
              <p className="text-base text-zinc-800 dark:text-zinc-200 leading-relaxed" dir="auto">
                {data.answer}
              </p>
            </div>

            {/* Product cards */}
            {data.results.length > 0 ? (
              <>
                <p className="text-xs text-zinc-400 px-1">
                  {data.results.length} result{data.results.length !== 1 ? 's' : ''}
                </p>
                <ul className="flex flex-col gap-2">
                  {data.results.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex items-center justify-between gap-4"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span
                          className="font-medium text-zinc-900 dark:text-zinc-50 truncate"
                          dir="rtl"
                        >
                          {r.nameHe ?? r.normalizedName}
                        </span>
                        <span className="text-sm text-zinc-500 truncate">
                          {[r.nameEn, r.category, r.unit].filter(Boolean).join(' · ')}
                        </span>
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
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-zinc-400 text-center py-4">
                No products found. Run the seed script first.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
