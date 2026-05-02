-- Migration 002: DLD integration additions
-- Extends listing_status with 'sold_dld' value, adds DLD sync metadata,
-- and adds pre-computed lead-scoring columns to listings.
-- Apply via: psql $DATABASE_URL -f supabase/migrations/002_dld_integration.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Expand listing_status CHECK to include 'sold_dld'
-- ---------------------------------------------------------------------------
ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_listing_status_check;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_listing_status_check
    CHECK (listing_status IN (
      'active', 'suspected_removed', 'confirmed_sold',
      'off_market', 'archived', 'sold_dld'
    ));

-- ---------------------------------------------------------------------------
-- 2. Pre-computed lead-scoring columns on listings
-- The scraper / sync job may materialise these to avoid recalculating at
-- query time. Computed at runtime from price_history when NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS lead_score          NUMERIC,
  ADD COLUMN IF NOT EXISTS price_original_aed  NUMERIC,
  ADD COLUMN IF NOT EXISTS drop_pct            NUMERIC,
  ADD COLUMN IF NOT EXISTS drop_abs_aed        NUMERIC;

CREATE INDEX IF NOT EXISTS idx_listings_lead_score
  ON public.listings (lead_score)
  WHERE lead_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_drop_pct
  ON public.listings (drop_pct)
  WHERE drop_pct IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. DLD transactions sync metadata
-- external_id (from migration 001) is the canonical DLD transaction identifier.
-- Adding price_aed (explicit AED column for the sync job) and synced_at.
-- ---------------------------------------------------------------------------
ALTER TABLE public.dld_transactions
  ADD COLUMN IF NOT EXISTS price_aed  INTEGER,
  ADD COLUMN IF NOT EXISTS synced_at  TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_dld_tx_synced_at
  ON public.dld_transactions (synced_at);

COMMIT;
