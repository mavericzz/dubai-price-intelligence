import { supabase } from './supabase';
import { computeListingFields } from './calculations';
import type {
  Listing,
  PriceHistory,
  DLDTransaction,
  DLDRental,
  LeadFilters,
  LeadSort,
  LeadListing,
  LeadsResponse,
  PaginationParams,
  MotivationLabel,
} from '../types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function motivationToScore(label: MotivationLabel): number {
  return label === 'HIGH' ? 3 : label === 'MEDIUM' ? 2 : 1;
}

async function buildLeadListings(listings: Listing[]): Promise<LeadListing[]> {
  if (listings.length === 0) return [];

  const listingIds = listings.map((l) => l.id);
  const areas = [...new Set(listings.map((l) => l.area).filter((a): a is string => a !== null))];

  const [phResult, dldTxResult, dldRentResult] = await Promise.all([
    supabase.from('price_history').select('*').in('listing_id', listingIds),
    areas.length > 0
      ? supabase.from('dld_transactions').select('*').in('area', areas)
      : Promise.resolve({ data: [] as DLDTransaction[], error: null }),
    areas.length > 0
      ? supabase.from('dld_rentals').select('*').in('area', areas)
      : Promise.resolve({ data: [] as DLDRental[], error: null }),
  ]);

  if (phResult.error) throw phResult.error;
  if (dldTxResult.error) throw dldTxResult.error;
  if (dldRentResult.error) throw dldRentResult.error;

  const phByListing = new Map<string, PriceHistory[]>();
  for (const ph of (phResult.data ?? []) as PriceHistory[]) {
    const arr = phByListing.get(ph.listing_id) ?? [];
    arr.push(ph);
    phByListing.set(ph.listing_id, arr);
  }

  const txByArea = new Map<string, DLDTransaction[]>();
  for (const tx of (dldTxResult.data ?? []) as DLDTransaction[]) {
    if (!tx.area) continue;
    const arr = txByArea.get(tx.area) ?? [];
    arr.push(tx);
    txByArea.set(tx.area, arr);
  }

  const rentByArea = new Map<string, DLDRental[]>();
  for (const r of (dldRentResult.data ?? []) as DLDRental[]) {
    if (!r.area) continue;
    const arr = rentByArea.get(r.area) ?? [];
    arr.push(r);
    rentByArea.set(r.area, arr);
  }

  return listings.map((listing) => {
    const computed = computeListingFields(
      listing,
      phByListing.get(listing.id) ?? [],
      listing.area ? (txByArea.get(listing.area) ?? []) : [],
      listing.area ? (rentByArea.get(listing.area) ?? []) : [],
    );

    return {
      id: listing.id,
      external_id: listing.external_id,
      title: listing.title,
      area: listing.area,
      sub_area: listing.sub_area,
      property_type: listing.property_type,
      beds: listing.beds,
      size_sqft: listing.size_sqft,
      price: listing.price,
      price_original_aed: listing.price_original_aed ?? listing.peak_price,
      drop_pct: listing.drop_pct ?? computed.drop_percent,
      drop_abs_aed: listing.drop_abs_aed ?? computed.drop_amount_aed,
      lead_score: listing.lead_score ?? motivationToScore(computed.motivation_score),
      motivation_score: computed.motivation_score,
      estimated_gross_yield: computed.estimated_gross_yield,
      estimated_gross_yield_pct: listing.estimated_gross_yield_pct ?? computed.estimated_gross_yield,
      days_on_market: listing.days_on_market,
      listing_url: listing.listing_url,
      image_url: listing.image_url,
      listing_status: listing.listing_status,
      created_at: listing.created_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Public query
// ---------------------------------------------------------------------------

export async function getLeads(
  filters: LeadFilters,
  sort: LeadSort,
  pagination: PaginationParams,
): Promise<LeadsResponse> {
  let query = supabase
    .from('listings')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .eq('listing_status', 'active')
    .lte('price', filters.max_price_aed);

  if (filters.property_type) {
    query = query.eq('property_type', filters.property_type);
  }
  if (filters.beds !== undefined) {
    query = query.eq('beds', filters.beds);
  }
  if (filters.area && filters.area.length > 0) {
    query = query.in('area', filters.area);
  }

  // Pre-filter: only rows that could have a price drop (peak_price > price).
  // The exact percentage is computed in-memory after enrichment.
  if (filters.min_drop_pct > 0) {
    query = query.not('peak_price', 'is', null).not('price', 'is', null);
  }

  const { data, error } = await query;
  if (error) throw error;

  let listings = (data ?? []) as Listing[];

  // In-memory filter for drop_pct (handles both pre-computed and derived cases).
  if (filters.min_drop_pct > 0) {
    listings = listings.filter((l) => {
      const pct =
        l.drop_pct !== null
          ? l.drop_pct
          : l.peak_price && l.price && l.peak_price > 0
          ? ((l.peak_price - l.price) / l.peak_price) * 100
          : null;
      return pct !== null && pct >= filters.min_drop_pct;
    });
  }

  const leads = await buildLeadListings(listings);

  // Filter by min_score after enrichment.
  const filtered = filters.min_score > 0
    ? leads.filter((l) => l.lead_score !== null && l.lead_score >= filters.min_score)
    : leads;

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'lead_score_desc') {
      return (b.lead_score ?? 0) - (a.lead_score ?? 0);
    }
    if (sort === 'drop_pct_desc') {
      return (b.drop_pct ?? 0) - (a.drop_pct ?? 0);
    }
    // newest: sort by created_at desc
    return b.created_at.localeCompare(a.created_at);
  });

  const total = sorted.length;
  const offset = (pagination.page - 1) * pagination.limit;
  const page = sorted.slice(offset, offset + pagination.limit);

  return {
    data: page,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      total_pages: Math.ceil(total / pagination.limit),
    },
  };
}
