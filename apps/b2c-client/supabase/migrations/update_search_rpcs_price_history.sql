-- ============================================================
-- Migration: Add previous_price to match_products & search_products RPCs
--
-- Uses LEFT JOIN LATERAL on price_history to fetch the old_price
-- from the most recent record where new_price = current product price.
-- The idx_price_history_recorded_at index makes this efficient.
-- ============================================================

-- ── match_products (global search, no store filter) ──────────────────────────

CREATE OR REPLACE FUNCTION match_products(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int
)
RETURNS TABLE (
  id              uuid,
  store_id        uuid,
  normalized_name text,
  name_he         text,
  name_ru         text,
  name_en         text,
  category        text,
  price           numeric,
  quantity        int,
  unit            text,
  barcode         text,
  similarity      float,
  previous_price  numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.store_id,
    p.normalized_name,
    p.name_he,
    p.name_ru,
    p.name_en,
    p.category,
    p.price,
    p.quantity,
    p.unit,
    p.barcode,
    1 - (p.embedding <=> query_embedding) AS similarity,
    ph.old_price                           AS previous_price
  FROM products p
  LEFT JOIN LATERAL (
    -- Most recent history entry where the price changed TO the current price.
    -- old_price is what the customer was paying before the discount.
    SELECT old_price
    FROM   price_history
    WHERE  product_id = p.id
      AND  new_price  = p.price
    ORDER BY recorded_at DESC
    LIMIT 1
  ) ph ON true
  WHERE 1 - (p.embedding <=> query_embedding) > match_threshold
    AND p.is_available = true
  ORDER BY similarity DESC
  LIMIT match_count;
$$;


-- ── search_products (store-filtered search) ───────────────────────────────────

CREATE OR REPLACE FUNCTION search_products(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int,
  store_id_filter uuid
)
RETURNS TABLE (
  id              uuid,
  store_id        uuid,
  normalized_name text,
  name_he         text,
  name_ru         text,
  name_en         text,
  category        text,
  price           numeric,
  quantity        int,
  unit            text,
  barcode         text,
  similarity      float,
  previous_price  numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.store_id,
    p.normalized_name,
    p.name_he,
    p.name_ru,
    p.name_en,
    p.category,
    p.price,
    p.quantity,
    p.unit,
    p.barcode,
    1 - (p.embedding <=> query_embedding) AS similarity,
    ph.old_price                           AS previous_price
  FROM products p
  LEFT JOIN LATERAL (
    SELECT old_price
    FROM   price_history
    WHERE  product_id = p.id
      AND  new_price  = p.price
    ORDER BY recorded_at DESC
    LIMIT 1
  ) ph ON true
  WHERE 1 - (p.embedding <=> query_embedding) > match_threshold
    AND p.is_available      = true
    AND p.store_id          = store_id_filter
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
