export interface SearchHistoryRow {
  id: string;
  query: string;
  locale: string;
  results_count: number;
  searched_at: string; // ISO timestamp
}

export interface PurchaseLogRow {
  id: string;
  product_id: string | null;
  product_name: string;
  store_id: string | null;
  store_name: string;
  price_paid: number | null;
  purchased_at: string; // ISO timestamp
}
