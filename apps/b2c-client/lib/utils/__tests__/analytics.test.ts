import { describe, it, expect } from 'vitest';
import {
  buildPriceTimeline,
  computePriceStats,
  groupPurchasesByProduct,
} from '../analytics';

// ── buildPriceTimeline ────────────────────────────────────────────────────────

describe('buildPriceTimeline', () => {
  it('returns empty array for empty input', () => {
    expect(buildPriceTimeline([])).toEqual([]);
  });

  it('maps purchases to { date, price } points', () => {
    const purchases = [
      { purchased_at: '2026-01-01T00:00:00Z', price_paid: 10, product_name: 'milk' },
      { purchased_at: '2026-02-01T00:00:00Z', price_paid: 12, product_name: 'milk' },
    ];
    const timeline = buildPriceTimeline(purchases as never);
    expect(timeline).toEqual([
      { date: '2026-01-01', price: 10 },
      { date: '2026-02-01', price: 12 },
    ]);
  });

  it('filters out entries with null price_paid', () => {
    const purchases = [
      { purchased_at: '2026-01-01T00:00:00Z', price_paid: 9.90, product_name: 'milk' },
      { purchased_at: '2026-02-01T00:00:00Z', price_paid: null, product_name: 'milk' },
    ];
    const timeline = buildPriceTimeline(purchases as never);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].price).toBe(9.90);
  });

  it('sorts points by date ascending', () => {
    const purchases = [
      { purchased_at: '2026-03-01T00:00:00Z', price_paid: 13, product_name: 'milk' },
      { purchased_at: '2026-01-01T00:00:00Z', price_paid: 10, product_name: 'milk' },
      { purchased_at: '2026-02-01T00:00:00Z', price_paid: 11, product_name: 'milk' },
    ];
    const timeline = buildPriceTimeline(purchases as never);
    expect(timeline.map((p) => p.price)).toEqual([10, 11, 13]);
  });
});

// ── computePriceStats ─────────────────────────────────────────────────────────

describe('computePriceStats', () => {
  it('returns null for empty timeline', () => {
    expect(computePriceStats([])).toBeNull();
  });

  it('returns null for single-point timeline (no trend)', () => {
    expect(computePriceStats([{ date: '2026-01-01', price: 10 }])).toBeNull();
  });

  it('computes min, max, latest, and change correctly', () => {
    const timeline = [
      { date: '2026-01-01', price: 10 },
      { date: '2026-02-01', price: 8 },
      { date: '2026-03-01', price: 12 },
    ];
    const stats = computePriceStats(timeline)!;
    expect(stats.min).toBe(8);
    expect(stats.max).toBe(12);
    expect(stats.latest).toBe(12);
    expect(stats.first).toBe(10);
    expect(stats.change).toBeCloseTo(20); // +20% from 10 to 12
  });

  it('returns negative change when price dropped', () => {
    const timeline = [
      { date: '2026-01-01', price: 20 },
      { date: '2026-02-01', price: 15 },
    ];
    const stats = computePriceStats(timeline)!;
    expect(stats.change).toBeCloseTo(-25); // -25%
  });

  it('returns change = 0 when price is unchanged', () => {
    const timeline = [
      { date: '2026-01-01', price: 10 },
      { date: '2026-02-01', price: 10 },
    ];
    const stats = computePriceStats(timeline)!;
    expect(stats.change).toBe(0);
  });

  it('handles first price = 0 (avoids division by zero)', () => {
    const timeline = [
      { date: '2026-01-01', price: 0 },
      { date: '2026-02-01', price: 5 },
    ];
    const stats = computePriceStats(timeline)!;
    expect(isFinite(stats.change)).toBe(true);
  });
});

// ── groupPurchasesByProduct ───────────────────────────────────────────────────

describe('groupPurchasesByProduct', () => {
  const purchases = [
    { id: '1', product_name: 'milk', price_paid: 10, purchased_at: '2026-01-01T00:00:00Z', store_name: 'A', product_id: 'p1', store_id: 's1' },
    { id: '2', product_name: 'milk', price_paid: 12, purchased_at: '2026-02-01T00:00:00Z', store_name: 'A', product_id: 'p1', store_id: 's1' },
    { id: '3', product_name: 'eggs', price_paid: 20, purchased_at: '2026-01-15T00:00:00Z', store_name: 'B', product_id: 'p2', store_id: 's2' },
  ];

  it('groups purchases by product_name', () => {
    const groups = groupPurchasesByProduct(purchases as never);
    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups['milk']).toHaveLength(2);
    expect(groups['eggs']).toHaveLength(1);
  });

  it('returns empty object for empty input', () => {
    expect(groupPurchasesByProduct([])).toEqual({});
  });

  it('handles purchases with null product_name gracefully', () => {
    const mixed = [
      ...purchases,
      { id: '4', product_name: null, price_paid: 5, purchased_at: '2026-01-01T00:00:00Z', store_name: 'C', product_id: null, store_id: 's3' },
    ];
    const groups = groupPurchasesByProduct(mixed as never);
    // null product_name should be excluded or handled without crashing
    expect(Object.keys(groups).includes('null')).toBe(false);
  });
});
