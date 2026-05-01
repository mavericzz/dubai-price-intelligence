-- Dubai Price Intelligence — Supabase Schema
-- Generated for MVP. Apply via Supabase SQL editor or `supabase db push`.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- listings
-- days_on_market is kept current by the trigger below; PostgreSQL GENERATED
-- ALWAYS AS does not allow volatile expressions like now(), so a trigger is
-- the standard workaround for a time-relative computed column.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listings (
    id                 uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
    external_id        text        UNIQUE NOT NULL,
    title              text,
    area               text,
    sub_area           text,
    property_type      text,
    beds               integer,
    baths              numeric,
    size_sqft          numeric,
    price              numeric,
    peak_price         numeric,
    listing_url        text,
    image_url          text,
    agent_name         text,
    agent_phone        text,
    lat                numeric,
    lng                numeric,
    is_off_plan        boolean     DEFAULT false,
    developer          text,
    payment_plan       text,
    completion_date    date,
    is_active          boolean     DEFAULT true,
    motivation_score   numeric,
    days_on_market     integer,
    created_at         timestamptz DEFAULT now() NOT NULL,
    updated_at         timestamptz DEFAULT now() NOT NULL
);

-- Compute days_on_market on every insert/update.
-- Also keeps updated_at current for updates.
CREATE OR REPLACE FUNCTION public.listings_before_upsert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.days_on_market := (CURRENT_DATE - NEW.created_at::date);
    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER listings_before_upsert
BEFORE INSERT OR UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.listings_before_upsert();

-- ---------------------------------------------------------------------------
-- price_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_history (
    id          uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
    listing_id  uuid        NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    price       numeric     NOT NULL,
    recorded_at timestamptz DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- dld_transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dld_transactions (
    id               uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
    area             text,
    sub_area         text,
    property_type    text,
    beds             integer,
    size_sqft        numeric,
    price            numeric,
    price_per_sqft   numeric,
    transaction_date date,
    is_off_plan      boolean     DEFAULT false,
    created_at       timestamptz DEFAULT now() NOT NULL,
    updated_at       timestamptz DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- dld_rentals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dld_rentals (
    id             uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
    area           text,
    sub_area       text,
    property_type  text,
    beds           integer,
    size_sqft      numeric,
    annual_rent    numeric,
    rent_per_sqft  numeric,
    lease_date     date,
    created_at     timestamptz DEFAULT now() NOT NULL,
    updated_at     timestamptz DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- watchlists
-- user_id references auth.users (Supabase auth)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.watchlists (
    id                uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id           uuid        NOT NULL,
    name              text        NOT NULL,
    areas             text[],
    property_type     text,
    beds_min          integer,
    beds_max          integer,
    max_price         numeric,
    min_drop_percent  numeric,
    min_yield         numeric,
    motivation_filter text,
    email_enabled     boolean     DEFAULT false,
    whatsapp_enabled  boolean     DEFAULT false,
    whatsapp_phone    text,
    created_at        timestamptz DEFAULT now() NOT NULL,
    updated_at        timestamptz DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- alert_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alert_log (
    id           uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
    watchlist_id uuid        NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
    listing_id   uuid        NOT NULL REFERENCES public.listings(id)   ON DELETE CASCADE,
    channel      text        NOT NULL CHECK (channel IN ('email', 'whatsapp')),
    sent_at      timestamptz DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger (dld_transactions, dld_rentals, watchlists)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER dld_transactions_updated_at
BEFORE UPDATE ON public.dld_transactions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER dld_rentals_updated_at
BEFORE UPDATE ON public.dld_rentals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER watchlists_updated_at
BEFORE UPDATE ON public.watchlists
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes — listings
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_listings_area             ON public.listings (area);
CREATE INDEX IF NOT EXISTS idx_listings_property_type   ON public.listings (property_type);
CREATE INDEX IF NOT EXISTS idx_listings_beds             ON public.listings (beds);
CREATE INDEX IF NOT EXISTS idx_listings_price            ON public.listings (price);
CREATE INDEX IF NOT EXISTS idx_listings_motivation_score ON public.listings (motivation_score);
CREATE INDEX IF NOT EXISTS idx_listings_is_active        ON public.listings (is_active);
CREATE INDEX IF NOT EXISTS idx_listings_is_off_plan      ON public.listings (is_off_plan);
-- Composite: most common filter combination
CREATE INDEX IF NOT EXISTS idx_listings_area_type_beds  ON public.listings (area, property_type, beds);
CREATE INDEX IF NOT EXISTS idx_listings_created_at      ON public.listings (created_at);

-- ---------------------------------------------------------------------------
-- Indexes — price_history
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_price_history_listing_id ON public.price_history (listing_id);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON public.price_history (recorded_at);

-- ---------------------------------------------------------------------------
-- Indexes — dld_transactions
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dld_tx_area          ON public.dld_transactions (area);
CREATE INDEX IF NOT EXISTS idx_dld_tx_property_type ON public.dld_transactions (property_type);
CREATE INDEX IF NOT EXISTS idx_dld_tx_beds          ON public.dld_transactions (beds);
CREATE INDEX IF NOT EXISTS idx_dld_tx_date          ON public.dld_transactions (transaction_date);
CREATE INDEX IF NOT EXISTS idx_dld_tx_area_type     ON public.dld_transactions (area, property_type, beds);

-- ---------------------------------------------------------------------------
-- Indexes — dld_rentals
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dld_rent_area          ON public.dld_rentals (area);
CREATE INDEX IF NOT EXISTS idx_dld_rent_property_type ON public.dld_rentals (property_type);
CREATE INDEX IF NOT EXISTS idx_dld_rent_beds          ON public.dld_rentals (beds);
CREATE INDEX IF NOT EXISTS idx_dld_rent_lease_date    ON public.dld_rentals (lease_date);

-- ---------------------------------------------------------------------------
-- Indexes — watchlists / alert_log
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_watchlists_user_id       ON public.watchlists (user_id);
CREATE INDEX IF NOT EXISTS idx_alert_log_watchlist_id   ON public.alert_log (watchlist_id);
CREATE INDEX IF NOT EXISTS idx_alert_log_listing_id     ON public.alert_log (listing_id);
CREATE INDEX IF NOT EXISTS idx_alert_log_sent_at        ON public.alert_log (sent_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- MVP policy: market data is publicly readable; watchlists/alerts are
-- scoped to the owning user. Service role bypasses RLS by default in
-- Supabase, so no explicit service-role write policies are needed.
-- ---------------------------------------------------------------------------
ALTER TABLE public.listings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dld_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dld_rentals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_log        ENABLE ROW LEVEL SECURITY;

-- Public read: market data
CREATE POLICY "public_read_listings"
    ON public.listings FOR SELECT USING (true);

CREATE POLICY "public_read_price_history"
    ON public.price_history FOR SELECT USING (true);

CREATE POLICY "public_read_dld_transactions"
    ON public.dld_transactions FOR SELECT USING (true);

CREATE POLICY "public_read_dld_rentals"
    ON public.dld_rentals FOR SELECT USING (true);

-- Authenticated users: full CRUD on their own watchlists
CREATE POLICY "users_select_own_watchlists"
    ON public.watchlists FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_watchlists"
    ON public.watchlists FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_watchlists"
    ON public.watchlists FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own_watchlists"
    ON public.watchlists FOR DELETE
    USING (auth.uid() = user_id);

-- Authenticated users: read alert_log for their watchlists
CREATE POLICY "users_read_own_alert_log"
    ON public.alert_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.watchlists w
            WHERE w.id = alert_log.watchlist_id
              AND w.user_id = auth.uid()
        )
    );
