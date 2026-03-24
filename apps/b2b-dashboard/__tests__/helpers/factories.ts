import type { Product } from "@/types/database";
import type { MarketComparison } from "@/lib/actions/market";

/** Build a minimal Product with sensible defaults for tests. */
export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    store_id: "store-1",
    pos_item_id: "pos-item-1",
    raw_name: "Test Product",
    raw_price: null,
    raw_quantity: null,
    raw_unit: null,
    raw_barcode: null,
    name_he: "מוצר בדיקה",
    name_ru: "Тестовый продукт",
    name_en: "Test Product",
    normalized_name: "test product",
    category: null,
    category_id: null,
    price: 10.0,
    sale_price: null,
    sale_until: null,
    quantity: null,
    unit: null,
    barcode: "1234567890",
    last_synced_at: "2024-01-01T00:00:00Z",
    sync_hash: null,
    is_available: true,
    image_url: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Build a minimal MarketComparison for tests. */
export function makeMarketComparison(
  overrides: Partial<MarketComparison> = {}
): MarketComparison {
  return {
    product_id: "prod-1",
    best_price: 8.0,
    best_chain: "Shufersal",
    market_avg: 9.0,
    competitor_count: 3,
    competitors: [
      { chain: "Shufersal", city: "Tel Aviv", price: 8.0, price_updated_at: new Date().toISOString() },
      { chain: "Rami Levy", city: "Jerusalem", price: 9.0, price_updated_at: new Date().toISOString() },
      { chain: "Victory", city: "Haifa", price: 10.0, price_updated_at: new Date().toISOString() },
    ],
    ...overrides,
  };
}
