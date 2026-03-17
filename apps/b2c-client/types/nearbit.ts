// ============================================================
// Nearbit – Shared TypeScript Types
// ============================================================

// ------ POS / Raw data coming from cash register APIs ------

export interface PosProduct {
  id: string;              // POS internal item ID
  name: string;            // Original name (Hebrew / mixed)
  price: number;           // Price in ILS
  quantity?: number;       // Stock on hand
  unit?: string;           // 'kg' | 'pcs' | etc.
  barcode?: string;
}

export interface PosIngestPayload {
  storeId: string;         // Nearbit store UUID
  provider: 'morning' | 'green_invoice' | 'manual' | 'other';
  products: PosProduct[];
}

// ------ LLM Normalization ------

export interface NormalizedProduct {
  posItemId: string;
  rawName: string;
  nameHe: string;
  nameRu: string;
  nameEn: string;
  category: string;
  unit: 'kg' | 'g' | 'liter' | 'ml' | 'pcs' | 'pack' | 'other';
}

// ------ Semantic Search ------

export interface SearchResult {
  id: string;
  storeId: string;
  normalizedName: string;
  nameHe: string | null;
  nameRu: string | null;
  nameEn: string | null;
  category: string | null;
  price: number | null;
  quantity: number | null;
  unit: string | null;
  barcode: string | null;
  similarity: number;
}

/** SearchResult enriched with the resolved store display name. */
export interface SearchResultWithStore extends SearchResult {
  storeName: string;
  /** Straight-line distance from the user to the store, in km. Only present when the caller supplies user_lat/user_lng. */
  distanceKm?: number;
}

/** Shape returned by GET /api/search */
export interface SearchResponse {
  answer: string;
  results: SearchResultWithStore[];
}

// ------ Internal (server-only) cache types ------

/**
 * Shape stored in Redis.  Identical to SearchResultWithStore but includes raw
 * store coordinates so per-user distances can be re-computed on cache hit
 * without an extra DB round-trip.  distanceKm is omitted — derived at response time.
 */
export interface CachedResult extends Omit<SearchResultWithStore, 'distanceKm'> {
  storeLat: number | null;
  storeLng: number | null;
}

export interface CachedSearchPayload {
  answer:  string;
  results: CachedResult[];
}
