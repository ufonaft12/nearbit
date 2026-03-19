import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn() },
  CACHE_TTL: { SEARCH: 86400, EMBEDDINGS: 604800, STORE_META: 3600 },
}));

import { GET } from '../route';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redis } from '@/lib/redis';

const mockCreate = vi.mocked(createSupabaseServerClient);
const mockRedis = vi.mocked(redis) as NonNullable<typeof redis>;

const FAKE_USER = { id: 'user-abc' };
const FAKE_PURCHASES = [
  { id: 'p1', product_name: 'milk', price_paid: 10, purchased_at: '2026-01-01T00:00:00Z', store_name: 'A', product_id: 'prod-1', store_id: 'store-1' },
  { id: 'p2', product_name: 'milk', price_paid: 12, purchased_at: '2026-02-01T00:00:00Z', store_name: 'A', product_id: 'prod-1', store_id: 'store-1' },
  { id: 'p3', product_name: 'eggs', price_paid: 20, purchased_at: '2026-01-15T00:00:00Z', store_name: 'B', product_id: 'prod-2', store_id: 'store-2' },
];

function makeClient(user = FAKE_USER as object | null, purchases = FAKE_PURCHASES) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: purchases, error: null }),
    })),
  };
}

function req(url: string) {
  return new NextRequest(url);
}

describe('GET /api/analytics/prices', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockCreate.mockResolvedValue(makeClient(null) as never);
    vi.mocked(mockRedis.get as unknown as (...args: never[]) => unknown).mockResolvedValue(null);
    const res = await GET(req('http://localhost/api/analytics/prices'));
    expect(res.status).toBe(401);
  });

  it('returns analytics data grouped by product', async () => {
    mockCreate.mockResolvedValue(makeClient() as never);
    vi.mocked(mockRedis.get as unknown as (...args: never[]) => unknown).mockResolvedValue(null);
    vi.mocked(mockRedis.set as unknown as (...args: never[]) => unknown).mockResolvedValue('OK');

    const res = await GET(req('http://localhost/api/analytics/prices'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('milk');
    expect(body).toHaveProperty('eggs');
    expect(body.milk.timeline).toHaveLength(2);
    expect(body.milk.stats).not.toBeNull();
  });

  it('serves from cache when available', async () => {
    const cachedData = { milk: { timeline: [], stats: null } };
    vi.mocked(mockRedis.get as unknown as (...args: never[]) => unknown).mockResolvedValue(JSON.stringify(cachedData));
    mockCreate.mockResolvedValue(makeClient() as never);

    const res = await GET(req('http://localhost/api/analytics/prices'));
    expect(res.status).toBe(200);
    const headers = Object.fromEntries(res.headers.entries());
    expect(headers['x-cache']).toBe('HIT');
  });

  it('caches the result after a Supabase fetch', async () => {
    mockCreate.mockResolvedValue(makeClient() as never);
    vi.mocked(mockRedis.get as unknown as (...args: never[]) => unknown).mockResolvedValue(null);
    vi.mocked(mockRedis.set as unknown as (...args: never[]) => unknown).mockResolvedValue('OK');

    await GET(req('http://localhost/api/analytics/prices'));
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it('returns empty object when user has no purchases', async () => {
    mockCreate.mockResolvedValue(makeClient(FAKE_USER, []) as never);
    vi.mocked(mockRedis.get as unknown as (...args: never[]) => unknown).mockResolvedValue(null);
    vi.mocked(mockRedis.set as unknown as (...args: never[]) => unknown).mockResolvedValue('OK');

    const res = await GET(req('http://localhost/api/analytics/prices'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toHaveLength(0);
  });
});
