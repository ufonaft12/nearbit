// ============================================================
// Nearbit – Upstash Redis Client
//
// Key patterns:
//   search:cache:<sha256(q)>              — single-item search result (24 h)
//   search:cache:basket:<sha256(items)>   — basket search result (24 h)
//   embed:<sha256(q)>                     — OpenAI embedding vector  (7 d)
//   store:<uuid>                          — store metadata row       (1 h)
//
// If UPSTASH_REDIS_REST_URL / TOKEN are not set the module
// exports a no-op client so the app degrades gracefully to
// "no cache" without crashing (useful in local dev without Redis).
// ============================================================

import { Redis } from '@upstash/redis';

export const CACHE_TTL_SECONDS        = 60 * 60 * 24;      // 24 h — search results
export const EMBED_TTL_SECONDS        = 60 * 60 * 24 * 7;  //  7 d — embeddings are model-version stable
export const STORE_META_TTL_SECONDS   = 60 * 60;            //  1 h — store name/coords change rarely

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
