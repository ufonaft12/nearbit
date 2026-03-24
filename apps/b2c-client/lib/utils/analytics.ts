import type { PurchaseLogRow } from '@/types/history';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PricePoint {
  date: string;  // YYYY-MM-DD
  price: number;
}

export interface PriceStats {
  min: number;
  max: number;
  first: number;
  latest: number;
  /** Percentage change from first to latest purchase (0 if first price was 0) */
  change: number;
}

export type ProductPriceData = {
  timeline: PricePoint[];
  stats: PriceStats | null;
};

// ── buildPriceTimeline ────────────────────────────────────────────────────────

/**
 * Convert an array of purchase rows into a sorted timeline of price points.
 * Entries with null price_paid are excluded.
 */
export function buildPriceTimeline(purchases: PurchaseLogRow[]): PricePoint[] {
  return purchases
    .filter((p) => p.price_paid != null)
    .map((p) => ({
      date: p.purchased_at.slice(0, 10), // YYYY-MM-DD
      price: p.price_paid as number,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── computePriceStats ─────────────────────────────────────────────────────────

/**
 * Compute summary statistics for a price timeline.
 * Returns null if there are fewer than 2 data points (no trend to compute).
 */
export function computePriceStats(timeline: PricePoint[]): PriceStats | null {
  if (timeline.length < 2) return null;

  const prices = timeline.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const first = timeline[0].price;
  const latest = timeline[timeline.length - 1].price;

  // Avoid division by zero: if the first price was 0, report change as 0
  const change = first === 0 ? 0 : ((latest - first) / first) * 100;

  return { min, max, first, latest, change };
}

// ── groupPurchasesByProduct ───────────────────────────────────────────────────

/**
 * Group an array of purchase rows by product_name.
 * Entries with null product_name are silently dropped.
 */
export function groupPurchasesByProduct(
  purchases: PurchaseLogRow[],
): Record<string, PurchaseLogRow[]> {
  const groups: Record<string, PurchaseLogRow[]> = {};
  for (const purchase of purchases) {
    if (!purchase.product_name) continue;
    if (!groups[purchase.product_name]) groups[purchase.product_name] = [];
    groups[purchase.product_name].push(purchase);
  }
  return groups;
}

// ── buildAnalytics ────────────────────────────────────────────────────────────

/**
 * Full analytics pipeline: purchases → grouped → timeline + stats per product.
 */
export function buildAnalytics(
  purchases: PurchaseLogRow[],
): Record<string, ProductPriceData> {
  const groups = groupPurchasesByProduct(purchases);
  const result: Record<string, ProductPriceData> = {};

  for (const [name, rows] of Object.entries(groups)) {
    const timeline = buildPriceTimeline(rows);
    result[name] = { timeline, stats: computePriceStats(timeline) };
  }

  return result;
}
