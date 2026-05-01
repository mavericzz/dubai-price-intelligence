// ---------------------------------------------------------------------------
// Table row types — mirror public schema in supabase/schema.sql
// Timestamps are ISO-8601 strings as returned by the Supabase JS client.
// ---------------------------------------------------------------------------

export interface Listing {
  id: string;
  external_id: string;
  title: string | null;
  area: string | null;
  sub_area: string | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  size_sqft: number | null;
  price: number | null;
  peak_price: number | null;
  listing_url: string | null;
  image_url: string | null;
  agent_name: string | null;
  agent_phone: string | null;
  lat: number | null;
  lng: number | null;
  is_off_plan: boolean;
  developer: string | null;
  payment_plan: string | null;
  /** ISO date string (YYYY-MM-DD) */
  completion_date: string | null;
  is_active: boolean;
  /** Raw numeric score stored by the scraper; resolved to label in ComputedListing */
  motivation_score: number | null;
  days_on_market: number | null;
  created_at: string;
  updated_at: string;
}

export interface PriceHistory {
  id: string;
  listing_id: string;
  price: number;
  recorded_at: string;
}

export interface DLDTransaction {
  id: string;
  area: string | null;
  sub_area: string | null;
  property_type: string | null;
  beds: number | null;
  size_sqft: number | null;
  price: number | null;
  price_per_sqft: number | null;
  /** ISO date string (YYYY-MM-DD) */
  transaction_date: string | null;
  is_off_plan: boolean;
  created_at: string;
  updated_at: string;
}

export interface DLDRental {
  id: string;
  area: string | null;
  sub_area: string | null;
  property_type: string | null;
  beds: number | null;
  size_sqft: number | null;
  annual_rent: number | null;
  rent_per_sqft: number | null;
  /** ISO date string (YYYY-MM-DD) */
  lease_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  areas: string[] | null;
  property_type: string | null;
  beds_min: number | null;
  beds_max: number | null;
  max_price: number | null;
  min_drop_percent: number | null;
  min_yield: number | null;
  motivation_filter: string | null;
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  whatsapp_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertLog {
  id: string;
  watchlist_id: string;
  listing_id: string;
  channel: 'email' | 'whatsapp';
  sent_at: string;
}

// ---------------------------------------------------------------------------
// Computed types
// ---------------------------------------------------------------------------

export type MotivationLabel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * A Listing enriched with all derived fields calculated by the calculations
 * module. motivation_score is narrowed from a raw number to a labelled enum.
 */
export type ComputedListing = Omit<Listing, 'motivation_score'> & {
  drop_amount_aed: number | null;
  drop_percent: number | null;
  drop_count: number;
  /** Drops per day since the listing was first seen */
  drop_velocity: number | null;
  motivation_score: MotivationLabel;
  estimated_gross_yield: number | null;
  area_avg_psf: number | null;
  listing_psf: number | null;
  /** Percentage difference: ((listing_psf - area_avg_psf) / area_avg_psf) * 100 */
  psf_vs_area_avg: number | null;
};

// ---------------------------------------------------------------------------
// Filter / sort / pagination types
// ---------------------------------------------------------------------------

export interface ListingFilters {
  property_type?: string;
  area?: string;
  beds?: number;
  min_drop_percent?: number;
  min_yield?: number;
  motivation?: MotivationLabel;
  is_off_plan?: boolean;
  is_active?: boolean;
}

export type ListingSortField =
  | 'price'
  | 'drop_percent'
  | 'days_on_market'
  | 'yield'
  | 'motivation_score';

export type SortDirection = 'asc' | 'desc';

export interface PaginationParams {
  page: number;
  limit: number;
}
