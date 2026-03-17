// ============================================================
// Nearbit – Upstash Redis Client
//
// Used for server-side semantic search caching.
// Key pattern : search:cache:<sha256(query)>
// TTL         : 24 hours (86400 s)
//
// If UPSTASH_REDIS_REST_URL / TOKEN are not set the module
// exports a no-op client so the app degrades gracefully to
// "no cache" without crashing (useful in local dev without Redis).
// ============================================================

import { Redis } from '@upstash/redis';

export const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 h

function makeClient(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[redis] UPSTASH_REDIS_REST_URL / TOKEN not set — caching disabled');
    }
    return null;
  }

  return new Redis({ url, token });
}

export const redis = makeClient();
