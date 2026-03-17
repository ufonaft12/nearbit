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
