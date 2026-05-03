-- Dubai Price Intelligence — initial schema
-- Executes cleanly on a fresh Supabase instance.

-- ──────────────────────────────────────────────
-- LISTINGS
-- ──────────────────────────────────────────────
create table if not exists listings (
  id                uuid primary key default gen_random_uuid(),
  external_id       text not null,
  title             text not null,
  area              text not null,
  sub_area          text,
  property_type     text not null,
  beds              integer,
  baths             numeric(4,1),
  size_sqft         numeric(12,2),
  price             numeric(15,2) not null,
  peak_price        numeric(15,2),
  listing_url       text,
  image_url         text,
  agent_name        text,
  agent_phone       text,
  lat               double precision,
  lng               double precision,
  is_off_plan       boolean not null default false,
  developer         text,
  payment_plan      text,
  completion_date   date,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- days since this listing first appeared
  days_on_market    integer generated always as (
                      (current_date - created_at::date)
                    ) stored
);

create unique index listings_external_id_uidx on listings(external_id);
create        index listings_area_idx         on listings(area);
create        index listings_is_active_idx    on listings(is_active);

-- ──────────────────────────────────────────────
-- PRICE HISTORY
-- ──────────────────────────────────────────────
create table if not exists price_history (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references listings(id) on delete cascade,
  price       numeric(15,2) not null,
  recorded_at timestamptz not null default now()
);

create index price_history_listing_recorded_idx on price_history(listing_id, recorded_at);

-- ──────────────────────────────────────────────
-- DLD TRANSACTIONS
-- ──────────────────────────────────────────────
create table if not exists dld_transactions (
  id               uuid primary key default gen_random_uuid(),
  area             text not null,
  sub_area         text,
  property_type    text not null,
  beds             integer,
  size_sqft        numeric(12,2) not null,
  price            numeric(15,2) not null,
  price_per_sqft   numeric(10,2) not null,
  transaction_date date not null
);

create index dld_transactions_area_type_idx on dld_transactions(area, property_type);

-- ──────────────────────────────────────────────
-- DLD RENTALS
-- ──────────────────────────────────────────────
create table if not exists dld_rentals (
  id            uuid primary key default gen_random_uuid(),
  area          text not null,
  sub_area      text,
  property_type text not null,
  beds          integer,
  size_sqft     numeric(12,2) not null,
  annual_rent   numeric(15,2) not null,
  recorded_at   timestamptz not null default now()
);

-- ──────────────────────────────────────────────
-- WATCHLISTS
-- ──────────────────────────────────────────────
create table if not exists watchlists (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null,
  areas              text[] not null default '{}',
  property_type      text,
  beds_min           integer,
  beds_max           integer,
  max_price          numeric(15,2),
  min_drop_percent   numeric(5,2),
  min_yield          numeric(5,2),
  motivation_filter  text,
  email_enabled      boolean not null default false,
  whatsapp_enabled   boolean not null default false,
  whatsapp_phone     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index watchlists_user_id_idx on watchlists(user_id);

alter table watchlists enable row level security;

-- Users can only see and modify their own watchlists.
create policy "watchlists: owner select"
  on watchlists for select
  using (auth.uid() = user_id);

create policy "watchlists: owner insert"
  on watchlists for insert
  with check (auth.uid() = user_id);

create policy "watchlists: owner update"
  on watchlists for update
  using (auth.uid() = user_id);

create policy "watchlists: owner delete"
  on watchlists for delete
  using (auth.uid() = user_id);

-- ──────────────────────────────────────────────
-- ALERT LOG
-- ──────────────────────────────────────────────
create table if not exists alert_log (
  id           uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references watchlists(id) on delete cascade,
  listing_id   uuid not null references listings(id) on delete cascade,
  channel      text not null check (channel in ('email', 'whatsapp')),
  sent_at      timestamptz not null default now()
);

alter table alert_log enable row level security;

-- Users can only read alert logs for watchlists they own.
create policy "alert_log: owner select"
  on alert_log for select
  using (
    exists (
      select 1 from watchlists w
      where w.id = alert_log.watchlist_id
        and w.user_id = auth.uid()
    )
  );
