// ============================================================
// Nearbit – Client-side Search Fetch Layer
//
// Extracted from page.tsx so it can be tested independently
// and reused by any future component.
// ============================================================

import type { SearchResponse, SearchStrategy } from '@/types/nearbit';

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 500;

/**
 * Typed error thrown by fetchSearch.
 * `isNetworkError` = true when the request never reached the server
 * (offline, DNS failure, CORS, etc.). Lets the UI show a different
 * message than a normal API error.
 */
export class SearchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly isNetworkError = false,
  ) {
    super(message);
    this.name = 'SearchError';
  }
}

/**
 * Calls GET /api/search?q=<query>[&user_lat=<lat>&user_lng=<lng>]
 * and returns the typed response.
 *
 * Throws SearchError on:
 *  - network / connectivity failure (isNetworkError = true)
 *  - non-2xx HTTP status
 *
 * Respects the AbortSignal passed by TanStack Query so that
 * in-flight requests are cancelled when a newer query supersedes them.
 */
export async function fetchSearch(
  query: string,
  signal?: AbortSignal,
  location?: { lat: number; lng: number },
  strategy?: SearchStrategy,
  maxDistanceKm?: number,
): Promise<SearchResponse> {
  // Clamp to max length as a safety net (API route also validates).
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);

  const params = new URLSearchParams({ q });
  if (location) {
    params.set('user_lat', String(location.lat));
    params.set('user_lng', String(location.lng));
  }
  if (strategy) params.set('strategy', strategy);
  if (maxDistanceKm != null) params.set('max_distance_km', String(maxDistanceKm));

  let res: Response;
  try {
    res = await fetch(`/api/search?${params.toString()}`, { signal });
  } catch (err) {
    // DOMException with name 'AbortError' means TanStack cancelled this query
    // because a newer one started — re-throw so TanStack handles it correctly.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new SearchError(
      'Network error — check your connection.',
      undefined,
      true,
    );
  }

  // Parse body regardless of status so we can surface the API error message.
  const json: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof json === 'object' &&
      json !== null &&
      'error' in json &&
      typeof (json as Record<string, unknown>).error === 'string'
        ? (json as { error: string }).error
        : `Search failed (${res.status})`;
    throw new SearchError(message, res.status);
  }

  return json as SearchResponse;
}
