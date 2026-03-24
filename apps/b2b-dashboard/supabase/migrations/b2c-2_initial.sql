-- ============================================================
-- Nearbit – Geospatial: add lat/lng to stores
-- ============================================================

-- Add coordinates to every store row (nullable — existing rows unaffected)
alter table public.stores
  add column if not exists lat double precision,
  add column if not exists lng double precision;

comment on column public.stores.lat is 'WGS-84 latitude  (decimal degrees)';
comment on column public.stores.lng is 'WGS-84 longitude (decimal degrees)';
