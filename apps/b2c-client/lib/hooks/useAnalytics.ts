import { useQuery } from '@tanstack/react-query';
import type { ProductPriceData } from '@/lib/utils/analytics';

export const analyticsKeys = {
  prices: ['analytics', 'prices'] as const,
};

/**
 * Fetch per-product price analytics for the current user.
 *
 * Caching strategy:
 *  - staleTime: 60 min — analytics data changes only when the user records a
 *    new purchase; a 1-hour window matches the server-side Redis TTL.
 *  - gcTime: 2h — keep in memory across navigation.
 *  - refetchOnWindowFocus: false — no silent background refreshes.
 */
export function usePriceAnalytics() {
  return useQuery<Record<string, ProductPriceData>>({
    queryKey: analyticsKeys.prices,
    queryFn: async () => {
      const res = await fetch('/api/analytics/prices', { credentials: 'include' });
      if (!res.ok) throw new Error(`Analytics fetch failed: ${res.status}`);
      return res.json();
    },
    staleTime: 60 * 60_000,   // 1 hour — matches Redis TTL
    gcTime: 2 * 60 * 60_000,  // 2 hours in memory
    refetchOnWindowFocus: false,
  });
}
