-- Migration 004: off-plan listing details
-- Adds completion_status TEXT and off_plan_details JSONB to listings.
-- Scraper (DUB-67) populates these fields; gated by ENABLE_OFF_PLAN_DETAILS env var
-- until this migration is confirmed deployed.
-- Apply via: psql $DATABASE_URL -f supabase/migrations/004_off_plan_details.sql

BEGIN;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS completion_status TEXT,
  ADD COLUMN IF NOT EXISTS off_plan_details  JSONB;

-- Index for filtering by completion_status (e.g. off_plan vs ready).
CREATE INDEX IF NOT EXISTS listings_completion_status_idx
  ON public.listings (completion_status);

-- GIN index for JSONB containment queries on off_plan_details.
CREATE INDEX IF NOT EXISTS listings_off_plan_details_gin
  ON public.listings USING gin(off_plan_details);

COMMIT;
