/**
 * TDD tests for GET /api/profile and PATCH /api/profile
 * Written BEFORE implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockUpsert = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: mockSelect.mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      single: mockSingle,
      upsert: mockUpsert,
    })),
  })),
}));

vi.mock('@/lib/redis', () => ({ redis: null }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function req(method = 'GET', body?: object): Request {
  return new Request('http://localhost/api/profile', {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}

const AUTHED_USER = { id: 'user-uuid-001' };
const SAMPLE_PROFILE = { user_id: 'user-uuid-001', address: '1 Main St', city: 'Tel Aviv', updated_at: '2026-03-19T00:00:00Z' };

// ── GET ────────────────────────────────────────────────────────────────────────

describe('GET /api/profile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { GET } = await import('../route');
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('returns profile data when authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: AUTHED_USER } });
    mockSingle.mockResolvedValue({ data: SAMPLE_PROFILE, error: null });
    const { GET } = await import('../route');
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.city).toBe('Tel Aviv');
    expect(json.address).toBe('1 Main St');
  });

  it('returns empty profile when no row exists (PGRST116)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: AUTHED_USER } });
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } });
    const { GET } = await import('../route');
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.address).toBeNull();
    expect(json.city).toBeNull();
  });

  it('returns 500 on database error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: AUTHED_USER } });
    mockSingle.mockResolvedValue({ data: null, error: { code: 'UNEXPECTED', message: 'db error' } });
    const { GET } = await import('../route');
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});

// ── PATCH ──────────────────────────────────────────────────────────────────────

describe('PATCH /api/profile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { PATCH } = await import('../route');
    const res = await PATCH(req('PATCH', { city: 'Haifa' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid JSON', async () => {
    mockGetUser.mockResolvedValue({ data: { user: AUTHED_USER } });
    const { PATCH } = await import('../route');
    const badReq = new Request('http://localhost/api/profile', {
      method: 'PATCH',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(badReq);
    expect(res.status).toBe(400);
  });

  it('updates profile and returns 200', async () => {
    mockGetUser.mockResolvedValue({ data: { user: AUTHED_USER } });
    mockUpsert.mockResolvedValue({ error: null });
    const { PATCH } = await import('../route');
    const res = await PATCH(req('PATCH', { address: '5 New St', city: 'Haifa' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('strips unknown fields (only address and city accepted)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: AUTHED_USER } });
    mockUpsert.mockResolvedValue({ error: null });
    const { PATCH } = await import('../route');
    const res = await PATCH(req('PATCH', { address: 'Safe St', city: 'Safe City', role: 'admin' }));
    expect(res.status).toBe(200);
    // upsert should NOT have been called with 'role'
    const call = (mockUpsert as Mock).mock.calls[0][0];
    expect(call).not.toHaveProperty('role');
  });

  it('returns 500 on database error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: AUTHED_USER } });
    mockUpsert.mockResolvedValue({ error: { message: 'db error' } });
    const { PATCH } = await import('../route');
    const res = await PATCH(req('PATCH', { city: 'Haifa' }));
    expect(res.status).toBe(500);
  });

  it('allows null values to clear fields', async () => {
    mockGetUser.mockResolvedValue({ data: { user: AUTHED_USER } });
    mockUpsert.mockResolvedValue({ error: null });
    const { PATCH } = await import('../route');
    const res = await PATCH(req('PATCH', { address: null, city: null }));
    expect(res.status).toBe(200);
  });
});
