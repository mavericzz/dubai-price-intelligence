// ---------------------------------------------------------------------------
// Table row types — mirror public schema in supabase/schema.sql +
// migration 001_sold_status.sql + migration 002_rental_yield.sql
// Timestamps are ISO-8601 strings as returned by the Supabase JS client.
// ---------------------------------------------------------------------------

export type ListingStatus =
  | 'active'
  | 'suspected_removed'
  | 'confirmed_sold'
  | 'off_market'
  | 'archived'
  | 'sold_dld';

export type CompletionStatus = 'off_plan' | 'ready';

/** Payment plan breakdown stored inside off_plan_details JSONB. */
export interface OffPlanPaymentPlan {
  on_booking_pct: number | null;
  during_construction_pct: number | null;
  on_handover_pct: number | null;
  description: string | null;
}

/** Structured off-plan data extracted by the Bayut scraper (DUB-67). */
export interface OffPlanDetails {
  project_name: string | null;
  developer_name: string | null;
  handover_date: string | null;
  completion_status: CompletionStatus | null;
  service_charge_per_sqft: number | null;
  payment_plan: OffPlanPaymentPlan | null;
}

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
  // --- sold-status fields (migration 001) ---
  listing_status: ListingStatus;
  last_seen_at: string | null;
  removed_from_portal_at: string | null;
  sold_detected_at: string | null;
  dld_transaction_id: string | null;
  consecutive_404_count: number;
  building_name: string | null;
  unit_number: string | null;
  lead_score: number | null;
  price_original_aed: number | null;
  drop_pct: number | null;
  drop_abs_aed: number | null;
  /** Stored yield percentage, recalculated by DB trigger on every price change (migration 002) */
  estimated_gross_yield_pct: number | null;
  // --- deal score fields (migration 003) ---
  /** Composite deal quality score 0–100; recalculated nightly and on each price drop. */
  deal_score: number | null;
  /** Component breakdown for the deal score; stored as JSONB. */
  deal_score_breakdown: DealScoreBreakdown | null;
  // --- off-plan details fields (migration 004) ---
  /** 'off_plan' | 'ready' | NULL — populated by scraper when ENABLE_OFF_PLAN_DETAILS=true */
  completion_status: CompletionStatus | null;
  /** Structured off-plan data from scraper (project/developer/handover/payment plan). */
  off_plan_details: OffPlanDetails | null;
  created_at: string;
  updated_at: string;
}

export interface PriceHistory {
  id: string;
  listing_id: string;
  price: number;
  price_aed: number | null;
  recorded_at: string;
}

export interface RentalYieldBenchmark {
  area_name: string;
  studio_yield: number | null;
  one_bed_yield: number | null;
  two_bed_yield: number | null;
  updated_at: string | null;
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
  // --- added by migration 001 for unit-level matching ---
  building_name: string | null;
  unit_number: string | null;
  transaction_type: string | null;
  external_id: string | null;
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
  /** Added by migration 002 for building-level comp matching */
  building_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArchivedListing extends Listing {
  archive_reason: string | null;
  archived_at: string;
}

export interface ListingAuditLog {
  id: string;
  listing_id: string;
  action: string;
  old_status: string | null;
  new_status: string | null;
  performed_by: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
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
  /** Set when user explicitly opts in; null if never confirmed via opt-in flow */
  whatsapp_opted_in_at: string | null;
  /** Set when user sends STOP; opt-out wins over opt-in when non-null */
  whatsapp_opted_out_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertLog {
  id: string;
  watchlist_id: string;
  listing_id: string;
  channel: 'email' | 'whatsapp';
  /** Listing price captured at send time; dedup prevents re-alerting at same price */
  price_at_alert: number | null;
  sent_at: string;
}

// ---------------------------------------------------------------------------
// Deal score
// ---------------------------------------------------------------------------

/** Component breakdown stored as JSONB for debugging and frontend display. */
export interface DealScoreBreakdown {
  /** 0–30: deeper drop from peak → more points (scales linearly to 20 % drop) */
  drop_pct_score: number;
  /** 0–20: each repeat price cut signals more seller motivation (caps at 3 cuts) */
  repeat_cuts_score: number;
  /** 0–20: days on market, capped at 180 */
  dom_score: number;
  /** 0–20: estimated gross rental yield, capped at 10 % */
  yield_score: number;
  /** 0–10: listing PSF below area median — always 0 until DUB-66 DLD median data lands */
  psf_below_median_score: number;
}

// ---------------------------------------------------------------------------
// Computed types
// ---------------------------------------------------------------------------

export type MotivationLabel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * A Listing enriched with all derived fields calculated by the calculations
 * module. motivation_score is narrowed from a raw number to a labelled enum.
 * deal_score and deal_score_breakdown override the stored DB values with
 * live-computed equivalents.
 */
export type ComputedListing = Omit<Listing, 'motivation_score' | 'deal_score' | 'deal_score_breakdown'> & {
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
  /** Composite deal quality score 0–100, live-computed (may differ from persisted DB value). */
  deal_score: number;
  /** Component breakdown for the live-computed deal score. */
  deal_score_breakdown: DealScoreBreakdown;
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
  completion_status?: CompletionStatus;
  /** Defaults to 'active' in all query functions. Pass undefined to keep default. */
  listing_status?: ListingStatus;
  /** @deprecated Use listing_status instead; kept for backwards compatibility */
  is_active?: boolean;
  /** Filter by minimum deal score (0–100). */
  min_deal_score?: number;
}

export type ListingSortField =
  | 'price'
  | 'drop_percent'
  | 'days_on_market'
  | 'yield'
  | 'motivation_score'
  | 'deal_score';

export type SortDirection = 'asc' | 'desc';

export interface PaginationParams {
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Status update / restore payloads
// ---------------------------------------------------------------------------

export interface StatusUpdatePayload {
  listing_status?: ListingStatus;
  consecutive_404_count?: number;
  last_seen_at?: string;
  removed_from_portal_at?: string;
}

export interface RestoreResult {
  listing: Listing;
  auditLogId: string;
}

// ---------------------------------------------------------------------------
// DLD sync types
// ---------------------------------------------------------------------------

/** Raw transaction object returned by the Dubai Pulse DLD API. */
export interface DLDApiTransaction {
  /** DLD's own unique identifier for this transaction. */
  trans_id: string;
  area_en: string;
  property_type_en: string;
  rooms_en: string | null;
  actual_worth: number;
  instance_date: string;
  project_name_en: string | null;
  unit_no: string | null;
}

export interface DLDSyncResult {
  fetched: number;
  upserted: number;
  matched: number;
}

// ---------------------------------------------------------------------------
// /api/leads types
// ---------------------------------------------------------------------------

export type LeadSort = 'lead_score_desc' | 'drop_pct_desc' | 'newest';

export interface LeadFilters {
  min_drop_pct: number;
  max_price_aed: number;
  area?: string[];
  property_type?: string;
  min_score: number;
  beds?: number;
}

/** A single lead listing returned by GET /api/leads. */
export interface LeadListing {
  id: string;
  external_id: string;
  title: string | null;
  area: string | null;
  sub_area: string | null;
  property_type: string | null;
  beds: number | null;
  size_sqft: number | null;
  price: number | null;
  /** Original peak price in AED. */
  price_original_aed: number | null;
  drop_pct: number | null;
  drop_abs_aed: number | null;
  lead_score: number | null;
  motivation_score: MotivationLabel;
  estimated_gross_yield: number | null;
  /** Stored yield from DB trigger; mirrors estimated_gross_yield but persisted for direct DB queries */
  estimated_gross_yield_pct: number | null;
  days_on_market: number | null;
  listing_url: string | null;
  image_url: string | null;
  listing_status: ListingStatus;
  created_at: string;
}

export interface LeadsPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface LeadsResponse {
  data: LeadListing[];
  pagination: LeadsPagination;
}
