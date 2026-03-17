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

/** SearchResult enriched with store info and computed client-facing fields. */
export interface SearchResultWithStore extends SearchResult {
  storeName: string;
  /** Straight-line distance to the store in km — present when user_lat/user_lng is supplied. */
  distanceKm?: number;
  /** Store coordinates passed through so the client can build Waze / Google Maps links. */
  storeLat?: number | null;
  storeLng?: number | null;
  /**
   * Previous price for trend display (↑ / ↓ / →).
   * Populated once a price_history table is available; undefined until then.
   */
  previousPrice?: number | null;
}

// ------ Basket / Multi-item search ------

/** One store's best-priced selection across all basket items. */
export interface BasketStoreOption {
  storeId:    string;
  storeName:  string;
  storeLat:   number | null;
  storeLng:   number | null;
  itemsFound: number;   // how many of the requested basket items this store carries
  totalItems: number;   // total basket items requested
  totalCost:  number;   // sum of the cheapest match for each found item (ILS)
  items: Array<{
    query:       string;  // basket search term (e.g. "milk")
    productName: string;  // resolved display name
    price:       number;
  }>;
}

/** Aggregated basket result included in SearchResponse when query is multi-item. */
export interface BasketResult {
  items:        string[];            // parsed basket items in user order
  storeOptions: BasketStoreOption[]; // sorted: most-complete first, then cheapest
  savings:      number;              // price gap between cheapest & priciest complete basket (₪)
  bestStoreId:  string | null;
}

/** Shape returned by GET /api/search */
export interface SearchResponse {
  answer:  string;
  results: SearchResultWithStore[];
  basket?: BasketResult;  // only present for multi-item / basket queries
}

// ------ Internal (server-only) cache types ------

/**
 * Shape stored in Redis.  Extends SearchResultWithStore but with storeLat/storeLng
 * required (not optional) so distances can be recomputed on cache hit per user location.
 * distanceKm is intentionally omitted — derived at response time.
 */
export interface CachedResult
  extends Omit<SearchResultWithStore, 'distanceKm' | 'storeLat' | 'storeLng'> {
  storeLat: number | null;
  storeLng: number | null;
}

export interface CachedSearchPayload {
  answer:  string;
  results: CachedResult[];
  basket?: BasketResult;  // location-independent → safe to cache as-is
}

// ------ Smart Basket (Phase 5) ------

/** Determines whether search prioritises proximity or lowest price city-wide. */
export type SearchStrategy = 'near' | 'cheap';

/** A product the user has checked / added to their interactive basket. */
export interface BasketItem {
  id:        string;
  name:      string;       // display name (nameHe ?? normalizedName)
  price:     number | null;
  storeName: string;
  storeId:   string;
  query:     string;       // original search term that found this item
}
