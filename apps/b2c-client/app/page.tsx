'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { addItem, setStrategy } from '@/lib/store/basketSlice';
import { fetchSearch, MIN_QUERY_LENGTH } from '@/lib/search';
import { vibrate } from '@/lib/utils/vibrate';

import { Header } from '@/app/components/layout/Header';
import { SearchBox } from '@/app/components/search/SearchBox';
import { SearchResults } from '@/app/components/results/SearchResults';
import { BasketFloatingBar } from '@/app/components/basket/BasketFloatingBar';
import { useLocale } from '@/app/providers';
import { SUGGESTIONS_BY_LOCALE } from '@/lib/i18n/config';
import type { SearchStrategy } from '@/types/nearbit';

// ─── Home ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const dispatch = useAppDispatch();
  const { strategy } = useAppSelector((s) => s.basket);
  const { locale } = useLocale();
  const suggestions = SUGGESTIONS_BY_LOCALE[locale];

  const [committedQuery, setCommittedQuery]     = useState('');
  const [userLocation, setUserLocation]         = useState<{ lat: number; lng: number } | null>(null);
  const [pendingAddLabel, setPendingAddLabel]   = useState<string | null>(null);

  const pendingAutoAddQueryRef = useRef<string | null>(null);

  // ── TanStack Query ───────────────────────────────────────────────────────────
  const { data, isFetching, isError, error, isSuccess } = useQuery({
    queryKey: ['search', committedQuery, userLocation, strategy] as const,
    queryFn:  ({ signal }) =>
      fetchSearch(committedQuery, signal, userLocation ?? undefined, strategy),
    enabled:  committedQuery.length >= MIN_QUERY_LENGTH,
  });

  // ── Auto-add + haptics when results arrive ───────────────────────────────────
  useEffect(() => {
    if (!data) return;
    vibrate(50);

    const pendingQuery = pendingAutoAddQueryRef.current;
    if (pendingQuery && data.results.length > 0) {
      const top = data.results[0];
      dispatch(addItem({
        id:        top.id,
        name:      top.nameHe ?? top.normalizedName,
        price:     top.price,
        storeName: top.storeName,
        storeId:   top.storeId,
        query:     pendingQuery,
        storeLat:  top.storeLat,
        storeLng:  top.storeLng,
      }));
      pendingAutoAddQueryRef.current = null;
    }
    setPendingAddLabel(null);
  }, [data, dispatch]);

  useEffect(() => {
    if (isError) {
      pendingAutoAddQueryRef.current = null;
      setPendingAddLabel(null);
    }
  }, [isError]);

  // ── Callbacks for SearchBox ───────────────────────────────────────────────────
  const handlePendingAdd = (label: string | null, query: string | null) => {
    setPendingAddLabel(label);
    pendingAutoAddQueryRef.current = query;
    if (query) setCommittedQuery(query);
  };

  // ── Derived state ─────────────────────────────────────────────────────────────
  const showInitialHint = !isFetching && !isSuccess && !isError;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-blue-50/60 via-indigo-50/20 to-transparent dark:from-blue-950/20 dark:via-transparent dark:to-transparent" />
      <Header />

      <main className="relative mx-auto max-w-2xl px-6 py-10 pb-40 flex flex-col gap-8">
        <SearchBox
          strategy={strategy}
          isFetching={isFetching}
          onCommit={setCommittedQuery}
          onLocationChange={setUserLocation}
          onStrategyChange={(s: SearchStrategy) => dispatch(setStrategy(s))}
          onPendingAdd={handlePendingAdd}
        />

        <SearchResults
          data={data}
          isFetching={isFetching}
          isError={isError}
          error={error ?? null}
          isSuccess={isSuccess}
          committedQuery={committedQuery}
          showInitialHint={showInitialHint}
          suggestions={suggestions}
        />
      </main>

      <BasketFloatingBar pendingAddLabel={pendingAddLabel} />
    </div>
  );
}
