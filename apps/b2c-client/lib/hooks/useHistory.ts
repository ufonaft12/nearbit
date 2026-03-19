import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SearchHistoryRow, PurchaseLogRow } from '@/types/history';

// ── Query keys (stable objects) ───────────────────────────────────────────────

export const historyKeys = {
  search: ['history', 'search'] as const,
  purchases: ['history', 'purchases'] as const,
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchHistory<T>(type: 'search' | 'purchases'): Promise<T[]> {
  const res = await fetch(`/api/history?type=${type}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
  return res.json();
}

// ── useSearchHistory ──────────────────────────────────────────────────────────
/**
 * Fetches the current user's search history.
 *
 * Caching strategy:
 *  - staleTime: 5 min  — data is considered fresh for 5 minutes; no background
 *    refetch unless the user navigates away and back.
 *  - gcTime: 10 min    — cached data is kept in memory for 10 minutes even when
 *    there are no active subscribers (fast re-mount).
 *  - refetchOnWindowFocus: false — history doesn't change silently in another tab.
 */
export function useSearchHistory() {
  return useQuery<SearchHistoryRow[]>({
    queryKey: historyKeys.search,
    queryFn: () => fetchHistory<SearchHistoryRow>('search'),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

// ── usePurchaseLog ────────────────────────────────────────────────────────────
/**
 * Fetches the current user's purchase log.
 * Same caching strategy as useSearchHistory.
 */
export function usePurchaseLog() {
  return useQuery<PurchaseLogRow[]>({
    queryKey: historyKeys.purchases,
    queryFn: () => fetchHistory<PurchaseLogRow>('purchases'),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

// ── useRecordSearch ───────────────────────────────────────────────────────────
/**
 * Fire-and-forget mutation to record a search query.
 * Invalidates the search history cache so the next GET returns fresh data.
 * Uses `fire-and-forget` pattern — failures are silent (don't block the UI).
 */
export function useRecordSearch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { query: string; results_count: number; locale?: string }) => {
      const res = await fetch('/api/history', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'search', ...vars }),
      });
      if (!res.ok && res.status !== 401) throw new Error('Record search failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: historyKeys.search });
    },
  });
}

// ── useRecordPurchase ─────────────────────────────────────────────────────────
/**
 * Mutation to mark a product as purchased.
 * Optimistically invalidates the purchases cache on success.
 */
export function useRecordPurchase() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: {
      product_id?: string;
      product_name: string;
      store_id?: string;
      store_name: string;
      price_paid?: number | null;
    }) => {
      const res = await fetch('/api/history', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'purchase', ...vars }),
      });
      if (!res.ok && res.status !== 401) throw new Error('Record purchase failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: historyKeys.purchases });
    },
  });
}
