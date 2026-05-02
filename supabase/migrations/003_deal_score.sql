-- Migration 003: deal score
-- Adds deal_score (integer 0–100) and deal_score_breakdown (jsonb) to listings.
-- Recalculated by the nightly cron (recalculateDealScores) and on each price-drop
-- event via the TypeScript batch helper.
-- Apply via: psql $DATABASE_URL -f supabase/migrations/003_deal_score.sql

BEGIN;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS deal_score           INTEGER,
  ADD COLUMN IF NOT EXISTS deal_score_breakdown JSONB;

-- Fast sort/filter by deal score (the primary use-case for this column).
CREATE INDEX IF NOT EXISTS idx_listings_deal_score
  ON public.listings (deal_score DESC)
  WHERE deal_score IS NOT NULL;

COMMIT;
