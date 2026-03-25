-- =============================================================================
-- Nearbit — Market Price Sync Support (Migration 0002)
-- =============================================================================
-- Adds unique constraint on global_market_prices(barcode, chain_name)
-- so the price-sync service can upsert without duplicates.
-- =============================================================================

-- Unique index required by price-sync upsert.
-- barcode can be NULL (products sold by weight/name only),
-- so we treat NULL barcodes as distinct per chain via NULLS NOT DISTINCT.
-- Note: CREATE UNIQUE INDEX supports IF NOT EXISTS; ADD CONSTRAINT does not.
CREATE UNIQUE INDEX IF NOT EXISTS uq_global_prices_barcode_chain
  ON public.global_market_prices (barcode, chain_name)
  NULLS NOT DISTINCT;
