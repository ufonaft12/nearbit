'use client';

import { usePriceAnalytics } from '@/lib/hooks/useAnalytics';
import { PriceChart } from './PriceChart';

/**
 * Shows a price-over-time sparkline for each product the user has purchased
 * more than once. Products with only one purchase have no trend to display
 * and are excluded.
 */
export function PriceAnalyticsSection() {
  const { data, isLoading } = usePriceAnalytics();

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="loading">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-36 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <p className="text-sm text-zinc-400 text-center py-4">
        Purchase the same product more than once to see price trends.
      </p>
    );
  }

  // Only show products with at least 2 data points (meaningful trend)
  const productsWithTrend = Object.entries(data).filter(
    ([, v]) => v.timeline.length >= 1,
  );

  if (productsWithTrend.length === 0) {
    return (
      <p className="text-sm text-zinc-400 text-center py-4">
        Purchase the same product more than once to see price trends.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {productsWithTrend.map(([name, { timeline, stats }]) => (
        <PriceChart key={name} productName={name} timeline={timeline} stats={stats} />
      ))}
    </div>
  );
}
