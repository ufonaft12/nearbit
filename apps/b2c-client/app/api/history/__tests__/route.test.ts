import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  CACHE_TTL: { SEARCH: 86400, EMBEDDINGS: 604800, STORE_META: 3600 },
}));

import { GET as getHistory, POST as postHistory } from '../route';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redis } from '@/lib/redis';

const mockCreate = vi.mocked(createSupabaseServerClient);
const mockRedis = vi.mocked(redis);

const FAKE_USER = { id: 'user-abc', email: 'test@test.com' };

const FAKE_SEARCH_ROWS = [
  { id: 'sh-1', query: 'milk', results_count: 5, searched_at: '2026-03-01T10:00:00Z' },
  { id: 'sh-2', query: 'eggs', results_count: 3, searched_at: '2026-03-02T11:00:00Z' },
];

const FAKE_PURCHASE_ROWS = [
  {
    id: 'pl-1',
    product_id: 'prod-1',
    product_name: 'חלב',
    store_id: 'store-1',
    store_name: 'Super',
    price_paid: 8.90,
    purchased_at: '2026-03-01T12:00:00Z',
  },
];

function makeClient({
  user = FAKE_USER,
  searches = FAKE_SEARCH_ROWS,
  purchases = FAKE_PURCHASE_ROWS,
  insertError = null,
}: {
  user?: object | null;
  searches?: object[];
  purchases?: object[];
  insertError?: object | null;
} = {}) {
  const from = vi.fn((table: string) => {
    const rows = table === 'search_history' ? searches : purchases;
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
      insert: vi.fn().mockResolvedValue({ error: insertError }),
    };
  });

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from,
  };
}

function req(url: string, options?: RequestInit) {
  return new NextRequest(url, options);
}

describe('GET /api/history', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockCreate.mockResolvedValue(makeClient({ user: null }) as never);
    (mockRedis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await getHistory(req('http://localhost/api/history?type=search'));
    expect(res.status).toBe(401);
  });

  it('returns search history from cache when available', async () => {
    mockCreate.mockResolvedValue(makeClient() as never);
    (mockRedis.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify(FAKE_SEARCH_ROWS),
    );

    const res = await getHistory(req('http://localhost/api/history?type=search'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(FAKE_SEARCH_ROWS);
    // Should NOT hit Supabase
    const client = makeClient();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('returns search history from Supabase on cache miss and writes cache', async () => {
    mockCreate.mockResolvedValue(makeClient() as never);
    (mockRedis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockRedis.set as ReturnType<typeof vi.fn>).mockResolvedValue('OK');

    const res = await getHistory(req('http://localhost/api/history?type=search'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(FAKE_SEARCH_ROWS);
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it('returns purchases history when type=purchases', async () => {
    mockCreate.mockResolvedValue(makeClient() as never);
    (mockRedis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockRedis.set as ReturnType<typeof vi.fn>).mockResolvedValue('OK');

    const res = await getHistory(req('http://localhost/api/history?type=purchases'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(FAKE_PURCHASE_ROWS);
  });

  it('returns 400 for unknown type param', async () => {
    mockCreate.mockResolvedValue(makeClient() as never);
    const res = await getHistory(req('http://localhost/api/history?type=unknown'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/history (record search)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockCreate.mockResolvedValue(makeClient({ user: null }) as never);

    const res = await postHistory(
      req('http://localhost/api/history', {
        method: 'POST',
        body: JSON.stringify({ type: 'search', query: 'milk', results_count: 3 }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('records a search and invalidates cache', async () => {
    mockCreate.mockResolvedValue(makeClient() as never);
    (mockRedis.del as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await postHistory(
      req('http://localhost/api/history', {
        method: 'POST',
        body: JSON.stringify({ type: 'search', query: 'milk', results_count: 5 }),
      }),
    );
    expect(res.status).toBe(201);
    // Cache should be invalidated after writing
    expect(mockRedis.del).toHaveBeenCalled();
  });

  it('records a purchase and invalidates cache', async () => {
    mockCreate.mockResolvedValue(makeClient() as never);
    (mockRedis.del as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await postHistory(
      req('http://localhost/api/history', {
        method: 'POST',
        body: JSON.stringify({
          type: 'purchase',
          product_id: 'a1b2c3d4-0000-4000-8000-000000000001',
          product_name: 'חלב',
          store_id: 'a1b2c3d4-0000-4000-8000-000000000002',
          store_name: 'Super',
          price_paid: 8.90,
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect(mockRedis.del).toHaveBeenCalled();
  });

  it('returns 400 for unknown POST type', async () => {
    mockCreate.mockResolvedValue(makeClient() as never);
    const res = await postHistory(
      req('http://localhost/api/history', {
        method: 'POST',
        body: JSON.stringify({ type: 'unknown' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 422 when required fields are missing', async () => {
    mockCreate.mockResolvedValue(makeClient() as never);
    const res = await postHistory(
      req('http://localhost/api/history', {
        method: 'POST',
        body: JSON.stringify({ type: 'search' /* missing query */ }),
      }),
    );
    expect(res.status).toBe(422);
  });
});
