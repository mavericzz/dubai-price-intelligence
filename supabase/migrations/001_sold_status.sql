-- Migration 001: sold-property status schema
-- Adds sold/removal tracking columns to listings, extends dld_transactions for
-- unit-level matching, and creates archived_listings + listing_audit_log tables.
-- Apply via: psql $DATABASE_URL -f supabase/migrations/001_sold_status.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New tracking columns on listings
-- ---------------------------------------------------------------------------
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS listing_status        TEXT    DEFAULT 'active'
    CONSTRAINT listings_listing_status_check
    CHECK (listing_status IN ('active', 'suspected_removed', 'confirmed_sold', 'off_market', 'archived')),
  ADD COLUMN IF NOT EXISTS last_seen_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_from_portal_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sold_detected_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dld_transaction_id     TEXT,
  ADD COLUMN IF NOT EXISTS consecutive_404_count  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS building_name          TEXT,
  ADD COLUMN IF NOT EXISTS unit_number            TEXT;

-- Backfill listing_status from is_active so existing rows are consistent.
UPDATE public.listings SET listing_status = 'active' WHERE listing_status IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Extend dld_transactions with building/unit for primary-match strategy
-- ---------------------------------------------------------------------------
ALTER TABLE public.dld_transactions
  ADD COLUMN IF NOT EXISTS building_name    TEXT,
  ADD COLUMN IF NOT EXISTS unit_number      TEXT,
  ADD COLUMN IF NOT EXISTS transaction_type TEXT,
  ADD COLUMN IF NOT EXISTS external_id      TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dld_tx_external_id
  ON public.dld_transactions (external_id)
  WHERE external_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. archived_listings — full snapshot of the listings schema at archive time
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archived_listings (
  LIKE public.listings INCLUDING ALL,
  archive_reason TEXT,
  archived_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4. Audit log for manual status overrides (restore, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_audit_log (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id   UUID        NOT NULL,
  action       TEXT        NOT NULL,
  old_status   TEXT,
  new_status   TEXT,
  performed_by TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_listings_listing_status
  ON public.listings (listing_status);

CREATE INDEX IF NOT EXISTS idx_listings_last_seen_at
  ON public.listings (last_seen_at);

CREATE INDEX IF NOT EXISTS idx_listings_removed_portal_at
  ON public.listings (removed_from_portal_at)
  WHERE removed_from_portal_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_dld_tx_id
  ON public.listings (dld_transaction_id)
  WHERE dld_transaction_id IS NOT NULL;

-- Composite for building+unit primary match
CREATE INDEX IF NOT EXISTS idx_listings_building_unit
  ON public.listings (building_name, unit_number)
  WHERE building_name IS NOT NULL AND unit_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_archived_listings_archived_at
  ON public.archived_listings (archived_at);

CREATE INDEX IF NOT EXISTS idx_archived_listings_archive_reason
  ON public.archived_listings (archive_reason);

CREATE INDEX IF NOT EXISTS idx_listing_audit_log_listing_id
  ON public.listing_audit_log (listing_id);

CREATE INDEX IF NOT EXISTS idx_listing_audit_log_created_at
  ON public.listing_audit_log (created_at);

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.archived_listings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_audit_log  ENABLE ROW LEVEL SECURITY;

-- Archived listings are publicly readable (same policy as active listings).
CREATE POLICY "public_read_archived_listings"
  ON public.archived_listings FOR SELECT USING (true);

COMMIT;
