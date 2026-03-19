import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase server module before importing the function under test
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { getServerUser } from '../getUser';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const mockCreateClient = vi.mocked(createSupabaseServerClient);

function makeSupabase(overrides: { user?: object | null; error?: object | null } = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: overrides.user ?? null },
        error: overrides.error ?? null,
      }),
    },
  };
}

describe('getServerUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no active session', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase({ user: null }) as never);
    const user = await getServerUser();
    expect(user).toBeNull();
  });

  it('returns the user when session is active', async () => {
    const fakeUser = { id: 'abc-123', email: 'test@example.com' };
    mockCreateClient.mockResolvedValue(makeSupabase({ user: fakeUser }) as never);
    const user = await getServerUser();
    expect(user).toEqual(fakeUser);
  });

  it('returns null when Supabase returns an error', async () => {
    mockCreateClient.mockResolvedValue(
      makeSupabase({ user: null, error: { message: 'JWT expired' } }) as never,
    );
    const user = await getServerUser();
    expect(user).toBeNull();
  });

  it('returns null when createSupabaseServerClient throws', async () => {
    mockCreateClient.mockRejectedValue(new Error('cookies not available'));
    const user = await getServerUser();
    expect(user).toBeNull();
  });

  it('returns null when auth.getUser throws unexpectedly', async () => {
    const badClient = {
      auth: { getUser: vi.fn().mockRejectedValue(new Error('network')) },
    };
    mockCreateClient.mockResolvedValue(badClient as never);
    const user = await getServerUser();
    expect(user).toBeNull();
  });
});
