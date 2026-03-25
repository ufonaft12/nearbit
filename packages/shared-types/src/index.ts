// =============================================================================
// @nearbit/shared-types — Central export
// =============================================================================
// This package is the single source of truth for data shapes shared between
// the B2C and B2B apps. Types that mirror Supabase tables live in supabase.ts
// (auto-generated). Domain-level types and API contracts live here.
//
// Regenerate Supabase types after schema changes:
//   pnpm db:types
// =============================================================================

// Auto-generated from Supabase schema (run: pnpm db:types)
// export type { Database } from './supabase'
// export type { Tables, TablesInsert, TablesUpdate } from './supabase'

// ── Domain models ────────────────────────────────────────────────────────────

export interface Product {
  id: string
  name: string
  barcode: string
  category: string
  /** Price in the smallest currency unit (agoras for ILS) */
  price_agorot: number
  currency: 'ILS'
  supermarket_chain: SupermarketChain
  branch_id: string
  scraped_at: string  // ISO-8601
  updated_at: string
}

export interface PriceHistory {
  id: string
  product_id: string
  price_agorot: number
  recorded_at: string
}

export interface SupermarketBranch {
  id: string
  chain: SupermarketChain
  name: string
  city: string
  address: string
  lat?: number
  lng?: number
}

export type SupermarketChain =
  | 'shufersal'
  | 'rami_levy'
  | 'victory'
  | 'mega'
  | 'yeinot_bitan'
  | 'osher_ad'
  | 'makor'
  | 'tiv_taam'

// ── API contract types ────────────────────────────────────────────────────────
// Shared between B2B API routes and any future API client

export interface PriceComparisonRequest {
  barcode: string
  chains?: SupermarketChain[]
}

export interface PriceComparisonResult {
  product: Pick<Product, 'barcode' | 'name' | 'category'>
  prices: Array<{
    chain: SupermarketChain
    branch_id: string
    price_agorot: number
    scraped_at: string
  }>
}

// ── Utility types ─────────────────────────────────────────────────────────────

export type Paginated<T> = {
  data: T[]
  count: number
  page: number
  per_page: number
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number }
