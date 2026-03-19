import { describe, it, expect } from 'vitest';
import { getPriceTrend } from '../pricing';

describe('getPriceTrend', () => {
  it('returns null when current price is null', () => {
    expect(getPriceTrend(null, 10)).toBeNull();
  });

  it('returns null when previous price is null', () => {
    expect(getPriceTrend(10, null)).toBeNull();
  });

  it('returns null when both prices are null', () => {
    expect(getPriceTrend(null, null)).toBeNull();
  });

  it('returns null when previous price is undefined', () => {
    expect(getPriceTrend(10, undefined)).toBeNull();
  });

  it('returns same when prices are identical', () => {
    expect(getPriceTrend(9.99, 9.99)).toEqual({ type: 'same', delta: 0 });
  });

  it('returns same when delta is within 0.005 threshold (e.g. floating-point noise)', () => {
    expect(getPriceTrend(10.003, 10.0)).toEqual({ type: 'same', delta: 0 });
    expect(getPriceTrend(10.0, 10.004)).toEqual({ type: 'same', delta: 0 });
  });

  it('returns down when price decreases beyond threshold', () => {
    const result = getPriceTrend(8.0, 10.0);
    expect(result).toEqual({ type: 'down', delta: -2 });
  });

  it('returns up when price increases beyond threshold', () => {
    const result = getPriceTrend(12.0, 10.0);
    expect(result).toEqual({ type: 'up', delta: 2 });
  });

  it('handles zero current price with non-null previous', () => {
    // price of 0 is unusual but valid (free item / data issue)
    const result = getPriceTrend(0, 5.0);
    expect(result?.type).toBe('down');
    expect(result?.delta).toBe(-5);
  });

  it('handles very small price differences just above threshold', () => {
    // 0.006 > 0.005 so should detect a change
    const result = getPriceTrend(10.006, 10.0);
    expect(result?.type).toBe('up');
  });

  it('handles large price swings', () => {
    const result = getPriceTrend(1, 1000);
    expect(result?.type).toBe('down');
    expect(result?.delta).toBe(-999);
  });
});
