import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProfileRow, ProfileUpdate } from '@/types/profile';

// ── Query key ─────────────────────────────────────────────────────────────────

export const profileKey = ['profile'] as const;

// ── useProfile ────────────────────────────────────────────────────────────────
/**
 * Fetches the current user's optional profile fields (address, city).
 *
 * Caching strategy:
 *  - staleTime: 10 min — profile changes rarely; no background refetch needed.
 *  - gcTime: 30 min    — keep in memory for a long session.
 *  - refetchOnWindowFocus: false — profile doesn't change in another tab.
 */
export function useProfile() {
  return useQuery<Omit<ProfileRow, 'user_id'>>({
    queryKey: profileKey,
    queryFn: async () => {
      const res = await fetch('/api/profile', { credentials: 'include' });
      if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
      return res.json();
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
}

// ── useUpdateProfile ──────────────────────────────────────────────────────────
/**
 * Mutation to update optional profile fields.
 * Invalidates profile cache on success so next read returns fresh data.
 */
export function useUpdateProfile() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (update: ProfileUpdate) => {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Update failed');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKey });
    },
  });
}
