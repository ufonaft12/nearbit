'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { addItem, removeItem } from '@/lib/store/basketSlice';
import { Search as SearchIcon } from 'lucide-react';
import { SkeletonAnswer, SkeletonCard } from '@/app/components/ui/Skeleton';
import { AnswerCard } from './AnswerCard';
import { BasketSummaryCard } from './BasketSummaryCard';
import { ProductCard } from './ProductCard';
import { SearchError } from '@/lib/search';
import { vibrate } from '@/lib/utils/vibrate';
import type { BasketItem, SearchResultWithStore, BasketResult } from '@/types/nearbit';

interface SearchData {
  answer:   string;
  results:  SearchResultWithStore[];
  basket?:  BasketResult;
}

interface Props {
  data:            SearchData | undefined;
  isFetching:      boolean;
  isError:         boolean;
  error:           Error | null;
  isSuccess:       boolean;
  committedQuery:  string;
  showInitialHint: boolean;
  suggestions:     readonly string[];
}

export function SearchResults({
  data,
  isFetching,
  isError,
  error,
  isSuccess,
  committedQuery,
  showInitialHint,
  suggestions,
}: Props) {
  const tResults = useTranslations('results');
  const tErrors  = useTranslations('errors');
  const tSearch  = useTranslations('search');
  const dispatch = useAppDispatch();
  const { items } = useAppSelector((s) => s.basket);

  const resultsAnchorRef = useRef<HTMLDivElement>(null);

  const hasItem      = useCallback((id: string) => items.some((i) => i.id === id), [items]);
  const handleAdd    = useCallback((item: BasketItem) => dispatch(addItem(item)),  [dispatch]);
  const handleRemove = useCallback((id: string) => dispatch(removeItem(id)),       [dispatch]);

  const isNetworkError = isError && error instanceof SearchError && error.isNetworkError;
  const hasResults     = isSuccess && (data?.results?.length ?? 0) > 0;

  // Scroll to results when fresh data arrives
  useEffect(() => {
    if (!data) return;
    resultsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [data]);

  return (
    <>
      {/* Initial hint */}
      {showInitialHint && (
        <p className="text-center text-sm text-zinc-400">
          {tSearch('initialHint', { min: 2, example: suggestions.slice(0, 3).join(', ') })}
        </p>
      )}

      {/* Network error */}
      {isNetworkError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">{tErrors('connectionTitle')}</p>
          <p className="mt-0.5 text-sm text-red-600/80 dark:text-red-400/80">{tErrors('connectionMessage')}</p>
        </div>
      )}

      {/* API error */}
      {isError && !isNetworkError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error instanceof Error ? error.message : tErrors('searchFailed')}
        </div>
      )}

      {/* Skeleton loaders */}
      {isFetching && (
        <div aria-busy="true" aria-label={tResults('loading')} className="flex flex-col gap-3">
          <SkeletonAnswer />
          <ul className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </ul>
        </div>
      )}

      {/* Invisible scroll anchor */}
      <div ref={resultsAnchorRef} className="-mt-4" aria-hidden="true" />

      {/* Results */}
      {!isFetching && isSuccess && data && (
        <section aria-label={tResults('ariaLabel')} className="flex flex-col gap-4">
          <AnswerCard answer={data.answer} query={committedQuery} />

          {data.basket && (
            <BasketSummaryCard basket={data.basket} query={committedQuery} />
          )}

          {hasResults ? (
            <>
              <p className="px-1 text-xs text-zinc-400">
                {tResults('resultsCount', { count: data.results.length, query: committedQuery })}
              </p>
              <ul className="flex flex-col gap-2" role="list" aria-label={tResults('productListAriaLabel')}>
                {data.results.map((r) => (
                  <ProductCard
                    key={r.id}
                    result={r}
                    searchQuery={committedQuery}
                    inBasket={hasItem(r.id)}
                    onAdd={handleAdd}
                    onRemove={handleRemove}
                    onVibrate={vibrate}
                  />
                ))}
              </ul>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-zinc-400">
              <SearchIcon size={36} aria-hidden="true" />
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {tResults('noResults')}
              </p>
              <p className="max-w-xs text-center text-xs">
                {tResults.rich('noResultsTip', {
                  cmd: (chunks) => (
                    <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 font-mono">
                      {chunks}
                    </code>
                  ),
                })}
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
