-- Migration 002: rental yield calculation
-- Adds building_name to dld_rentals for building-level comp matching,
-- adds estimated_gross_yield_pct to listings as a stored computed column,
-- and installs a trigger to recalculate on every price change.
-- Apply via: psql $DATABASE_URL -f supabase/migrations/002_rental_yield.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add building_name to dld_rentals
--    Enables building-level comp matching (primary lookup before area fallback).
-- ---------------------------------------------------------------------------
ALTER TABLE public.dld_rentals
  ADD COLUMN IF NOT EXISTS building_name TEXT;

CREATE INDEX IF NOT EXISTS idx_dld_rent_building_name
  ON public.dld_rentals (building_name)
  WHERE building_name IS NOT NULL;

-- Composite index for the primary comp query: building + beds
CREATE INDEX IF NOT EXISTS idx_dld_rent_building_beds
  ON public.dld_rentals (building_name, beds)
  WHERE building_name IS NOT NULL;

-- Composite index for area + beds (fallback comp query)
CREATE INDEX IF NOT EXISTS idx_dld_rent_area_beds
  ON public.dld_rentals (area, beds);

-- ---------------------------------------------------------------------------
-- 2. Add estimated_gross_yield_pct to listings
-- ---------------------------------------------------------------------------
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS estimated_gross_yield_pct NUMERIC(6,2);

CREATE INDEX IF NOT EXISTS idx_listings_yield_pct
  ON public.listings (estimated_gross_yield_pct)
  WHERE estimated_gross_yield_pct IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. compute_listing_yield(price, area, building_name, beds, property_type)
--    Parameterised so it can be called from both the trigger (where NEW.*
--    values are available) and a plain UPDATE for backfill (no table access
--    needed, so no INSERT-time chicken-and-egg problem).
--
--    Comp waterfall (requires >= 3 records at each tier):
--      1. Same building + beds + property_type, last 24 months
--      2. Same area   + beds + property_type, last 24 months
--      3. Same area   (any beds/type),         last 24 months
--    Returns NULL when no tier has sufficient comps.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_listing_yield(
  p_price         NUMERIC,
  p_area          TEXT,
  p_building_name TEXT,
  p_beds          INTEGER,
  p_property_type TEXT
) RETURNS NUMERIC(6,2) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_avg_rent  NUMERIC;
  v_min_comps CONSTANT INTEGER := 3;
BEGIN
  IF p_price IS NULL OR p_price = 0 THEN
    RETURN NULL;
  END IF;

  -- Tier 1: building-level comps
  IF p_building_name IS NOT NULL THEN
    SELECT AVG(annual_rent)
      INTO v_avg_rent
      FROM public.dld_rentals
     WHERE building_name   = p_building_name
       AND (p_beds          IS NULL OR beds          = p_beds)
       AND (p_property_type IS NULL OR property_type = p_property_type)
       AND lease_date      >= CURRENT_DATE - INTERVAL '24 months'
       AND annual_rent     IS NOT NULL
    HAVING COUNT(*) >= v_min_comps;
  END IF;

  -- Tier 2: area + beds + property_type
  IF v_avg_rent IS NULL AND p_area IS NOT NULL THEN
    SELECT AVG(annual_rent)
      INTO v_avg_rent
      FROM public.dld_rentals
     WHERE area             = p_area
       AND (p_beds          IS NULL OR beds          = p_beds)
       AND (p_property_type IS NULL OR property_type = p_property_type)
       AND lease_date      >= CURRENT_DATE - INTERVAL '24 months'
       AND annual_rent     IS NOT NULL
    HAVING COUNT(*) >= v_min_comps;
  END IF;

  -- Tier 3: area only (broadest fallback)
  IF v_avg_rent IS NULL AND p_area IS NOT NULL THEN
    SELECT AVG(annual_rent)
      INTO v_avg_rent
      FROM public.dld_rentals
     WHERE area         = p_area
       AND lease_date  >= CURRENT_DATE - INTERVAL '24 months'
       AND annual_rent IS NOT NULL
    HAVING COUNT(*) >= v_min_comps;
  END IF;

  IF v_avg_rent IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN ROUND((v_avg_rent / p_price) * 100, 2);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Trigger function: set estimated_gross_yield_pct on INSERT and on any
--    UPDATE that changes a comp-relevant column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listings_update_yield()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.estimated_gross_yield_pct := public.compute_listing_yield(
    NEW.price,
    NEW.area,
    NEW.building_name,
    NEW.beds,
    NEW.property_type
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_yield_on_price_change ON public.listings;

-- Fire on INSERT and on any UPDATE that touches a comp-relevant column.
-- This satisfies the "recalculate on each price drop event" requirement.
CREATE TRIGGER listings_yield_on_price_change
BEFORE INSERT OR UPDATE OF price, area, building_name, beds, property_type
ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.listings_update_yield();

-- ---------------------------------------------------------------------------
-- 5. Backfill existing rows
-- ---------------------------------------------------------------------------
UPDATE public.listings
SET estimated_gross_yield_pct = public.compute_listing_yield(
  price, area, building_name, beds, property_type
)
WHERE price IS NOT NULL AND price > 0;

COMMIT;
