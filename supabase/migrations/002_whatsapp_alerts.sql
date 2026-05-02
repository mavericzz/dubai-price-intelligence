-- Migration 002: WhatsApp alert opt-in tracking and alert dedup
-- Apply after 001_sold_status.sql

-- Track when a user explicitly opted in / opted out of WhatsApp alerts per watchlist.
-- whatsapp_enabled = true AND whatsapp_opted_out_at IS NULL means active opt-in.
ALTER TABLE public.watchlists
  ADD COLUMN IF NOT EXISTS whatsapp_opted_in_at  timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_opted_out_at timestamptz;

-- Store the listing price at the time an alert was sent.
-- Dedup rule: only send a new alert when the price has dropped to a new (lower) level.
-- Alerts at the same price_at_alert are deduplicated by the unique index below.
ALTER TABLE public.alert_log
  ADD COLUMN IF NOT EXISTS price_at_alert numeric;

-- Unique index enforces exactly one alert per (watchlist, listing, channel, price level).
-- The partial index only applies when price_at_alert is not null so that legacy null rows
-- (pre-migration) are not affected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_log_dedup
  ON public.alert_log (watchlist_id, listing_id, channel, price_at_alert)
  WHERE price_at_alert IS NOT NULL;

-- Composite index for the dedup look-up query in the alert job.
CREATE INDEX IF NOT EXISTS idx_alert_log_watchlist_listing_channel
  ON public.alert_log (watchlist_id, listing_id, channel);

-- Index to speed up fetching whatsapp-enabled watchlists for the alert job.
CREATE INDEX IF NOT EXISTS idx_watchlists_whatsapp_enabled
  ON public.watchlists (whatsapp_enabled)
  WHERE whatsapp_enabled = true;
