import { supabase } from './supabase';
import type {
  Listing,
  PriceHistory,
  DLDTransaction,
  DLDRental,
  Watchlist,
  ComputedListing,
  ListingFilters,
  ListingSortField,
  SortDirection,
  PaginationParams,
  OffPlanListing,
} from '../types';
import {
  computeListingFields,
  calcDropPercent,
  calcDropCount,
  calcAreaAvgRent,
  calcEstimatedGrossYield,
  calcDealScore,
  selectRentalComps,
} from './calculations';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export async function enrichListings(listings: Listing[]): Promise<ComputedListing[]> {
  if (listings.length === 0) return [];

  const listingIds = listings.map((l) => l.id);
  const areas = [
    ...new Set(listings.map((l) => l.area).filter((a): a is string => a !== null)),
  ];

  const [phResult, dldTxResult, dldRentResult] = await Promise.all([
    supabase.from('price_history').select('*').in('listing_id', listingIds),
    areas.length > 0
      ? supabase.from('dld_transactions').select('*').in('area', areas)
      : (Promise.resolve({ data: [], error: null }) as Promise<{
          data: DLDTransaction[];
          error: null;
        }>),
    areas.length > 0
      ? supabase.from('dld_rentals').select('*').in('area', areas)
      : (Promise.resolve({ data: [], error: null }) as Promise<{
          data: DLDRental[];
          error: null;
        }>),
  ]);

  if (phResult.error) throw phResult.error;
  if (dldTxResult.error) throw dldTxResult.error;
  if (dldRentResult.error) throw dldRentResult.error;

  const priceHistories = (phResult.data ?? []) as PriceHistory[];
  const dldTransactions = (dldTxResult.data ?? []) as DLDTransaction[];
  const dldRentals = (dldRentResult.data ?? []) as DLDRental[];

  const phByListing = new Map<string, PriceHistory[]>();
  for (const ph of priceHistories) {
    const arr = phByListing.get(ph.listing_id) ?? [];
    arr.push(ph);
    phByListing.set(ph.listing_id, arr);
  }

  const txByArea = new Map<string, DLDTransaction[]>();
  for (const tx of dldTransactions) {
    if (tx.area === null) continue;
    const arr = txByArea.get(tx.area) ?? [];
    arr.push(tx);
    txByArea.set(tx.area, arr);
  }

  return listings.map((listing) =>
    computeListingFields(
      listing,
      phByListing.get(listing.id) ?? [],
      listing.area !== null ? (txByArea.get(listing.area) ?? []) : [],
      // Building-first waterfall: selectRentalComps picks the best comp tier
      // (building → area+beds → area-all) matching the DB trigger logic.
      selectRentalComps(listing, dldRentals),
    ),
  );
}

function sortComputedListings(
  listings: ComputedListing[],
  field: ListingSortField,
  direction: SortDirection,
): ComputedListing[] {
  const mul = direction === 'asc' ? 1 : -1;
  return [...listings].sort((a, b) => {
    let va: number | null = null;
    let vb: number | null = null;
    switch (field) {
      case 'price':
        va = a.price;
        vb = b.price;
        break;
      case 'drop_percent':
        va = a.drop_percent;
        vb = b.drop_percent;
        break;
      case 'days_on_market':
        va = a.days_on_market;
        vb = b.days_on_market;
        break;
      case 'yield':
        va = a.estimated_gross_yield;
        vb = b.estimated_gross_yield;
        break;
      case 'motivation_score': {
        const order: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        va = order[a.motivation_score] ?? 0;
        vb = order[b.motivation_score] ?? 0;
        break;
      }
      case 'deal_score':
        va = a.deal_score;
        vb = b.deal_score;
        break;
    }
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return (va - vb) * mul;
  });
}

// ---------------------------------------------------------------------------
// Public query functions
// ---------------------------------------------------------------------------

export async function getListings(
  filters: ListingFilters,
  sort: { field: ListingSortField; direction: SortDirection },
  page: PaginationParams,
): Promise<ComputedListing[]> {
  let query = supabase.from('listings').select('*');

  // Default to active listings only; callers can override by passing listing_status explicitly.
  query = query.eq('listing_status', filters.listing_status ?? 'active');

  if (filters.area !== undefined) query = query.eq('area', filters.area);
  if (filters.property_type !== undefined) query = query.eq('property_type', filters.property_type);
  if (filters.beds !== undefined) query = query.eq('beds', filters.beds);
  if (filters.is_off_plan !== undefined) query = query.eq('is_off_plan', filters.is_off_plan);

  const { data, error } = await query;
  if (error) throw error;

  let computed = await enrichListings((data ?? []) as Listing[]);

  if (filters.min_drop_percent !== undefined) {
    const min = filters.min_drop_percent;
    computed = computed.filter(
      (l) => l.drop_percent !== null && l.drop_percent >= min,
    );
  }
  if (filters.min_yield !== undefined) {
    const min = filters.min_yield;
    computed = computed.filter(
      (l) => l.estimated_gross_yield !== null && l.estimated_gross_yield >= min,
    );
  }
  if (filters.motivation !== undefined) {
    const motivation = filters.motivation;
    computed = computed.filter((l) => l.motivation_score === motivation);
  }
  if (filters.min_deal_score !== undefined) {
    const min = filters.min_deal_score;
    computed = computed.filter((l) => l.deal_score >= min);
  }

  computed = sortComputedListings(computed, sort.field, sort.direction);

  const offset = (page.page - 1) * page.limit;
  return computed.slice(offset, offset + page.limit);
}

export async function getListingById(id: string): Promise<ComputedListing | null> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .eq('listing_status', 'active')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const [computed] = await enrichListings([data as Listing]);
  return computed ?? null;
}

export async function getListingPriceHistory(listingId: string): Promise<PriceHistory[]> {
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('listing_id', listingId)
    .order('recorded_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as PriceHistory[];
}

export async function getDLDComps(
  area: string,
  propertyType: string,
  beds: number,
): Promise<DLDTransaction[]> {
  const { data, error } = await supabase
    .from('dld_transactions')
    .select('*')
    .eq('area', area)
    .eq('property_type', propertyType)
    .eq('beds', beds)
    .order('transaction_date', { ascending: false });

  if (error) throw error;
  return (data ?? []) as DLDTransaction[];
}

export async function getYieldTrend(
  area: string,
  months: number,
): Promise<{ month: string; yield: number }[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const [rentalsResult, txResult] = await Promise.all([
    supabase
      .from('dld_rentals')
      .select('annual_rent, lease_date')
      .eq('area', area)
      .gte('lease_date', cutoffStr),
    supabase
      .from('dld_transactions')
      .select('price, transaction_date')
      .eq('area', area)
      .gte('transaction_date', cutoffStr),
  ]);

  if (rentalsResult.error) throw rentalsResult.error;
  if (txResult.error) throw txResult.error;

  type RentalRow = { annual_rent: number | null; lease_date: string | null };
  type TxRow = { price: number | null; transaction_date: string | null };

  const rentByMonth = new Map<string, number[]>();
  for (const r of (rentalsResult.data ?? []) as RentalRow[]) {
    if (r.annual_rent === null || r.lease_date === null) continue;
    const month = r.lease_date.slice(0, 7);
    const arr = rentByMonth.get(month) ?? [];
    arr.push(r.annual_rent);
    rentByMonth.set(month, arr);
  }

  const priceByMonth = new Map<string, number[]>();
  for (const t of (txResult.data ?? []) as TxRow[]) {
    if (t.price === null || t.transaction_date === null) continue;
    const month = t.transaction_date.slice(0, 7);
    const arr = priceByMonth.get(month) ?? [];
    arr.push(t.price);
    priceByMonth.set(month, arr);
  }

  const result: { month: string; yield: number }[] = [];
  for (const [month, rents] of rentByMonth.entries()) {
    const prices = priceByMonth.get(month);
    if (!prices || prices.length === 0) continue;
    const avgRent = rents.reduce((s, v) => s + v, 0) / rents.length;
    const avgPrice = prices.reduce((s, v) => s + v, 0) / prices.length;
    if (avgPrice === 0) continue;
    result.push({ month, yield: (avgRent / avgPrice) * 100 });
  }

  return result.sort((a, b) => a.month.localeCompare(b.month));
}

export async function getSimilarDrops(
  area: string,
  currentListingId: string,
  limit: number,
): Promise<ComputedListing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('area', area)
    .eq('listing_status', 'active')
    .neq('id', currentListingId)
    .not('price', 'is', null)
    .not('peak_price', 'is', null)
    .limit(limit * 5);

  if (error) throw error;
  const listings = (data ?? []) as Listing[];

  const dropped = listings.filter(
    (l) => l.price !== null && l.peak_price !== null && l.peak_price > l.price,
  );

  const computed = await enrichListings(dropped);
  return computed.slice(0, limit);
}

export async function getWatchlists(userId: string): Promise<Watchlist[]> {
  const { data, error } = await supabase
    .from('watchlists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Watchlist[];
}

export async function createWatchlist(
  watchlistData: Omit<Watchlist, 'id' | 'created_at' | 'updated_at'>,
): Promise<Watchlist> {
  const { data, error } = await supabase
    .from('watchlists')
    .insert(watchlistData)
    .select()
    .single();

  if (error) throw error;
  return data as Watchlist;
}

export async function updateWatchlist(
  id: string,
  watchlistData: Partial<Watchlist>,
): Promise<Watchlist> {
  const { data, error } = await supabase
    .from('watchlists')
    .update(watchlistData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Watchlist;
}

export async function deleteWatchlist(id: string): Promise<void> {
  const { error } = await supabase.from('watchlists').delete().eq('id', id);
  if (error) throw error;
}

export async function getActiveDropsCount(): Promise<number> {
  const { data, error } = await supabase
    .from('listings')
    .select('price, peak_price')
    .eq('listing_status', 'active')
    .not('price', 'is', null)
    .not('peak_price', 'is', null);

  if (error) throw error;
  type PriceRow = { price: number | null; peak_price: number | null };
  return ((data ?? []) as PriceRow[]).filter(
    (l) => l.price !== null && l.peak_price !== null && l.peak_price > l.price,
  ).length;
}

export async function getAvgDropPercent(): Promise<number> {
  const { data, error } = await supabase
    .from('listings')
    .select('price, peak_price')
    .eq('listing_status', 'active')
    .not('price', 'is', null)
    .not('peak_price', 'is', null);

  if (error) throw error;
  type PriceRow = { price: number | null; peak_price: number | null };
  const rows = (data ?? []) as PriceRow[];

  const drops = rows.filter(
    (l) => l.price !== null && l.peak_price !== null && l.peak_price > l.price,
  );
  if (drops.length === 0) return 0;

  const total = drops.reduce((sum, l) => sum + (calcDropPercent(l.price, l.peak_price) ?? 0), 0);
  return total / drops.length;
}

// ---------------------------------------------------------------------------
// Alert job helpers (used by lib/jobs/price-drop-alerts.ts)
// These use the public supabase client because listings data is public.
// The alert job itself uses supabaseService for watchlists + alert_log writes.
// ---------------------------------------------------------------------------

/** Fetch all active listings that have dropped below their peak price. */
export async function getDroppedListings(): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('listing_status', 'active')
    .not('price', 'is', null)
    .not('peak_price', 'is', null);

  if (error) throw error;
  return ((data ?? []) as Listing[]).filter(
    (l) => l.price !== null && l.peak_price !== null && l.peak_price > l.price,
  );
}

// ---------------------------------------------------------------------------
// Deal score batch recalculation
// Call with no args for nightly cron; pass specific IDs on each price-drop event.
// ---------------------------------------------------------------------------

/**
 * Recomputes deal_score and deal_score_breakdown for active listings and
 * persists the results back to the DB.
 *
 * Usage:
 *   await recalculateDealScores();               // all active listings (nightly cron)
 *   await recalculateDealScores([listingId]);     // single listing (price-drop event)
 */
export async function recalculateDealScores(
  listingIds?: string[],
): Promise<{ updated: number }> {
  let query = supabase.from('listings').select('*').eq('listing_status', 'active');
  if (listingIds && listingIds.length > 0) {
    query = query.in('id', listingIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  const listings = (data ?? []) as Listing[];
  if (listings.length === 0) return { updated: 0 };

  const ids = listings.map((l) => l.id);
  const areas = [
    ...new Set(listings.map((l) => l.area).filter((a): a is string => a !== null)),
  ];

  const [phResult, rentResult] = await Promise.all([
    supabase.from('price_history').select('*').in('listing_id', ids),
    areas.length > 0
      ? supabase.from('dld_rentals').select('*').in('area', areas)
      : (Promise.resolve({ data: [], error: null }) as Promise<{
          data: DLDRental[];
          error: null;
        }>),
  ]);

  if (phResult.error) throw phResult.error;
  if (rentResult.error) throw rentResult.error;

  const priceHistories = (phResult.data ?? []) as PriceHistory[];
  const dldRentals = (rentResult.data ?? []) as DLDRental[];

  const phByListing = new Map<string, PriceHistory[]>();
  for (const ph of priceHistories) {
    const arr = phByListing.get(ph.listing_id) ?? [];
    arr.push(ph);
    phByListing.set(ph.listing_id, arr);
  }

  const updates = listings.map((listing) => {
    const ph = phByListing.get(listing.id) ?? [];
    const rentalComps = selectRentalComps(listing, dldRentals);

    const dropPercent = calcDropPercent(listing.price, listing.peak_price);
    const dropCount = calcDropCount(ph);
    const areaAvgRent = calcAreaAvgRent(rentalComps);
    const estimatedGrossYield = calcEstimatedGrossYield(listing.price, areaAvgRent);
    const { score, breakdown } = calcDealScore(
      dropPercent,
      dropCount,
      listing.days_on_market,
      estimatedGrossYield,
    );

    return { id: listing.id, deal_score: score, deal_score_breakdown: breakdown };
  });

  const { error: upsertError } = await supabase
    .from('listings')
    .upsert(updates, { onConflict: 'id' });

  if (upsertError) throw upsertError;
  return { updated: updates.length };
}

// ---------------------------------------------------------------------------
// Off-plan query functions (used by /off-plan feed)
// ---------------------------------------------------------------------------

export async function getOffPlanListings(
  filters: { area?: string; property_type?: string; beds?: number },
  sort: { field: ListingSortField; direction: SortDirection },
  page: PaginationParams,
): Promise<OffPlanListing[]> {
  let query = supabase
    .from('listings')
    .select('id,title,area,developer,price,peak_price,payment_plan,completion_date,motivation_score,beds,size_sqft,image_url,listing_url,drop_pct,price_original_aed,days_on_market,listing_status')
    .eq('is_off_plan', true)
    .eq('listing_status', 'active');

  if (filters.area) query = query.eq('area', filters.area);
  if (filters.property_type) query = query.eq('property_type', filters.property_type);
  if (filters.beds !== undefined) query = query.eq('beds', filters.beds);

  const { data, error } = await query;
  if (error) throw error;

  type Row = {
    id: string;
    title: string | null;
    area: string | null;
    developer: string | null;
    price: number | null;
    peak_price: number | null;
    payment_plan: string | null;
    completion_date: string | null;
    motivation_score: number | null;
    beds: number | null;
    size_sqft: number | null;
    image_url: string | null;
    listing_url: string | null;
    drop_pct: number | null;
    price_original_aed: number | null;
    days_on_market: number | null;
    listing_status: string;
  };

  const rows = (data ?? []) as Row[];

  const listings: OffPlanListing[] = rows.map((r) => {
    const launchPrice = r.peak_price ?? r.price_original_aed ?? null;
    let dropSinceLaunch: number | null = null;
    if (launchPrice !== null && r.price !== null && launchPrice > 0) {
      dropSinceLaunch = ((launchPrice - r.price) / launchPrice) * 100;
    }
    const dropPercent = r.drop_pct ?? dropSinceLaunch;
    const rawScore = r.motivation_score ?? 0;
    const motivationScore = rawScore >= 7 ? 'HIGH' : rawScore >= 4 ? 'MEDIUM' : 'LOW';

    return {
      id: r.id,
      title: r.title,
      area: r.area,
      developer: r.developer,
      price: r.price,
      launch_price: launchPrice,
      drop_since_launch: dropSinceLaunch,
      drop_percent: dropPercent,
      payment_plan: r.payment_plan,
      completion_date: r.completion_date,
      motivation_score: motivationScore,
      beds: r.beds,
      size_sqft: r.size_sqft,
      image_url: r.image_url,
      listing_url: r.listing_url,
    } satisfies OffPlanListing;
  });

  const mul = sort.direction === 'asc' ? 1 : -1;
  listings.sort((a, b) => {
    let va: number | null = null;
    let vb: number | null = null;
    switch (sort.field) {
      case 'price': va = a.price; vb = b.price; break;
      case 'drop_percent': va = a.drop_percent; vb = b.drop_percent; break;
      case 'days_on_market': va = null; vb = null; break;
      case 'motivation_score': {
        const order: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        va = order[a.motivation_score] ?? 0;
        vb = order[b.motivation_score] ?? 0;
        break;
      }
      default: break;
    }
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return (va - vb) * mul;
  });

  const offset = (page.page - 1) * page.limit;
  return listings.slice(offset, offset + page.limit);
}

export async function getOffPlanAreas(): Promise<string[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('area')
    .eq('is_off_plan', true)
    .eq('listing_status', 'active')
    .not('area', 'is', null);

  if (error) throw error;
  type Row = { area: string | null };
  const areas = [
    ...new Set(((data ?? []) as Row[]).map((r) => r.area).filter((a): a is string => a !== null)),
  ];
  return areas.sort();
}
