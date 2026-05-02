/**
 * dld-sync.ts — DLD Transaction Sync Job
 *
 * Schedule: Weekly, Sunday 04:00 GST (UTC+4) → Sunday 00:00 UTC
 * Cron expression: "0 0 * * 0"
 *
 * What it does:
 *   1. Fetches an OAuth2 token from Dubai Pulse (client_credentials flow).
 *   2. Queries the DLD transactions open-data API for the past 14 days.
 *   3. Upserts new transactions into dld_transactions (deduped by external_id).
 *   4. Matches each transaction to an active listing:
 *      - Primary:  building_name + unit_number (exact, case-insensitive)
 *      - Fallback: area + price ±10% + transaction_date within 30 days of now
 *   5. On match: sets listing_status = 'confirmed_sold', records dld_transaction_id
 *      and sold_detected_at.
 *
 * Required env vars:
 *   DUBAI_PULSE_CLIENT_ID      — OAuth2 client_id
 *   DUBAI_PULSE_CLIENT_SECRET  — OAuth2 client_secret
 *   SUPABASE_URL               — Supabase project URL (used by supabase client)
 *   SUPABASE_SERVICE_ROLE_KEY  — Service-role key for writes
 */

import { supabase } from '../supabase';
import type { Listing, DLDTransaction } from '../../types';

// ---------------------------------------------------------------------------
// Dubai Pulse API types
// ---------------------------------------------------------------------------

interface DubaiPulseTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface DubaiPulseTxRecord {
  transaction_id: string;
  transaction_date: string; // YYYY-MM-DD
  property_type_en: string;
  area_en: string;
  sub_area_en: string;
  building_name_en: string;
  unit_number: string;
  rooms_en: string; // e.g. "2 B/R"
  actual_worth: number;
  procedure_area: number; // sq metres
  is_free_hold_en: string; // "Free Hold" | "Non Free Hold"
  transaction_type_en: string; // "Sales" | "Mortgage" | etc.
}

interface DubaiPulseTxResponse {
  result: DubaiPulseTxRecord[];
  total: number;
  page: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DLD_API_BASE = 'https://api.dubaipulse.gov.ae';
const DLD_TRANSACTIONS_PATH = '/open/dld/dld_transactions-open-api';
const TOKEN_PATH = '/oauth2/token';
const PRICE_MATCH_TOLERANCE = 0.10; // ±10%
const LOOKBACK_DAYS = 14;
const SQM_TO_SQFT = 10.7639;

// ---------------------------------------------------------------------------
// OAuth2 helpers
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string> {
  const clientId = process.env.DUBAI_PULSE_CLIENT_ID;
  const clientSecret = process.env.DUBAI_PULSE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing DUBAI_PULSE_CLIENT_ID or DUBAI_PULSE_CLIENT_SECRET env vars. ' +
      'Register at dubaipulse.gov.ae for a free API key.',
    );
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${DLD_API_BASE}${TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Dubai Pulse token request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as DubaiPulseTokenResponse;
  return json.access_token;
}

// ---------------------------------------------------------------------------
// API fetch helpers
// ---------------------------------------------------------------------------

async function fetchDLDTransactions(
  token: string,
  fromDate: string,
  toDate: string,
  page = 1,
  pageSize = 200,
): Promise<DubaiPulseTxResponse> {
  const params = new URLSearchParams({
    transaction_date_from: fromDate,
    transaction_date_to: toDate,
    transaction_type_en: 'Sales',
    page: String(page),
    page_size: String(pageSize),
  });

  const res = await fetch(`${DLD_API_BASE}${DLD_TRANSACTIONS_PATH}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`DLD API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<DubaiPulseTxResponse>;
}

async function fetchAllTransactions(
  token: string,
  fromDate: string,
  toDate: string,
): Promise<DubaiPulseTxRecord[]> {
  const PAGE_SIZE = 200;
  const first = await fetchDLDTransactions(token, fromDate, toDate, 1, PAGE_SIZE);
  const all: DubaiPulseTxRecord[] = [...first.result];

  const totalPages = Math.ceil(first.total / PAGE_SIZE);
  const remaining = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

  for (const page of remaining) {
    const batch = await fetchDLDTransactions(token, fromDate, toDate, page, PAGE_SIZE);
    all.push(...batch.result);
  }

  return all;
}

// ---------------------------------------------------------------------------
// Data normalisation
// ---------------------------------------------------------------------------

function parseBeds(roomsEn: string): number | null {
  if (!roomsEn) return null;
  const lower = roomsEn.toLowerCase();
  if (lower.includes('studio')) return 0;
  const match = lower.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function normaliseBuildingName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function mapRecordToDbRow(r: DubaiPulseTxRecord) {
  return {
    external_id: r.transaction_id,
    area: r.area_en ?? null,
    sub_area: r.sub_area_en ?? null,
    property_type: r.property_type_en ?? null,
    beds: parseBeds(r.rooms_en),
    size_sqft: r.procedure_area != null ? Math.round(r.procedure_area * SQM_TO_SQFT) : null,
    price: r.actual_worth ?? null,
    price_per_sqft:
      r.actual_worth && r.procedure_area
        ? Math.round(r.actual_worth / (r.procedure_area * SQM_TO_SQFT))
        : null,
    transaction_date: r.transaction_date ?? null,
    is_off_plan: false,
    building_name: r.building_name_en ? normaliseBuildingName(r.building_name_en) : null,
    unit_number: r.unit_number ? r.unit_number.trim() : null,
    transaction_type: r.transaction_type_en ?? null,
  };
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

type ListingRow = Pick<
  Listing,
  'id' | 'area' | 'price' | 'building_name' | 'unit_number' | 'listing_status'
>;

function primaryMatch(listing: ListingRow, tx: ReturnType<typeof mapRecordToDbRow>): boolean {
  if (!listing.building_name || !listing.unit_number) return false;
  if (!tx.building_name || !tx.unit_number) return false;
  return (
    normaliseBuildingName(listing.building_name) === tx.building_name &&
    listing.unit_number.trim().toLowerCase() === tx.unit_number.toLowerCase()
  );
}

function fallbackMatch(
  listing: ListingRow,
  tx: ReturnType<typeof mapRecordToDbRow>,
  txDate: Date,
  now: Date,
): boolean {
  if (!listing.area || !tx.area) return false;
  if (listing.area.toLowerCase() !== tx.area.toLowerCase()) return false;
  if (!listing.price || !tx.price) return false;

  const priceLow = listing.price * (1 - PRICE_MATCH_TOLERANCE);
  const priceHigh = listing.price * (1 + PRICE_MATCH_TOLERANCE);
  if (tx.price < priceLow || tx.price > priceHigh) return false;

  // Transaction must be recent (within 30 days of today)
  const ageMs = now.getTime() - txDate.getTime();
  return ageMs <= 30 * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Main job entry point
// ---------------------------------------------------------------------------

export interface DLDSyncResult {
  transactionsUpserted: number;
  listingsMatched: number;
  errors: string[];
}

export async function runDLDSync(): Promise<DLDSyncResult> {
  const result: DLDSyncResult = { transactionsUpserted: 0, listingsMatched: 0, errors: [] };
  const now = new Date();

  const toDate = now.toISOString().split('T')[0];
  const fromDate = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  console.log(`[dld-sync] Fetching DLD sales from ${fromDate} to ${toDate}`);

  // 1. Authenticate
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`OAuth2 token error: ${msg}`);
    return result;
  }

  // 2. Fetch transactions
  let records: DubaiPulseTxRecord[];
  try {
    records = await fetchAllTransactions(token, fromDate, toDate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`DLD API fetch error: ${msg}`);
    return result;
  }

  console.log(`[dld-sync] Fetched ${records.length} sale transactions`);

  // 3. Upsert transactions
  const rows = records.map(mapRecordToDbRow);
  if (rows.length > 0) {
    const { error: upsertError, count } = await supabase
      .from('dld_transactions')
      .upsert(rows, { onConflict: 'external_id', ignoreDuplicates: false })
      .select('id');

    if (upsertError) {
      result.errors.push(`DB upsert error: ${upsertError.message}`);
      return result;
    }
    result.transactionsUpserted = count ?? rows.length;
  }

  // 4. Load active listings for matching (only fields needed for matching)
  const { data: listingsData, error: listingsError } = await supabase
    .from('listings')
    .select('id, area, price, building_name, unit_number, listing_status')
    .eq('listing_status', 'active');

  if (listingsError) {
    result.errors.push(`Listings fetch error: ${listingsError.message}`);
    return result;
  }

  const listings = (listingsData ?? []) as ListingRow[];

  // 5. Re-fetch upserted transactions with their DB ids for dld_transaction_id
  const externalIds = rows.map((r) => r.external_id).filter(Boolean) as string[];
  const { data: dbTxData, error: dbTxError } = await supabase
    .from('dld_transactions')
    .select('id, external_id, area, price, building_name, unit_number, transaction_date')
    .in('external_id', externalIds);

  if (dbTxError) {
    result.errors.push(`DB tx fetch error: ${dbTxError.message}`);
    return result;
  }

  type DbTxRow = {
    id: string;
    external_id: string | null;
    area: string | null;
    price: number | null;
    building_name: string | null;
    unit_number: string | null;
    transaction_date: string | null;
  };

  const dbTransactions = (dbTxData ?? []) as DbTxRow[];

  // 6. Match and update listings
  const matchedListingIds = new Set<string>();
  const updates: Array<{
    id: string;
    listing_status: 'confirmed_sold';
    dld_transaction_id: string;
    sold_detected_at: string;
  }> = [];

  for (const tx of dbTransactions) {
    const txRow = mapRecordToDbRow(
      records.find((r) => r.transaction_id === tx.external_id)!,
    );
    const txDate = tx.transaction_date ? new Date(tx.transaction_date) : now;

    for (const listing of listings) {
      if (matchedListingIds.has(listing.id)) continue;

      const matched = primaryMatch(listing, txRow) || fallbackMatch(listing, txRow, txDate, now);
      if (matched) {
        matchedListingIds.add(listing.id);
        updates.push({
          id: listing.id,
          listing_status: 'confirmed_sold',
          dld_transaction_id: tx.id,
          sold_detected_at: now.toISOString(),
        });
      }
    }
  }

  // 7. Batch update matched listings
  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('listings')
      .update({
        listing_status: update.listing_status,
        dld_transaction_id: update.dld_transaction_id,
        sold_detected_at: update.sold_detected_at,
      })
      .eq('id', update.id);

    if (updateError) {
      result.errors.push(`Update listing ${update.id}: ${updateError.message}`);
    } else {
      result.listingsMatched += 1;
    }
  }

  console.log(
    `[dld-sync] Done. upserted=${result.transactionsUpserted} matched=${result.listingsMatched} errors=${result.errors.length}`,
  );
  return result;
}

// ---------------------------------------------------------------------------
// Standalone runner
// ---------------------------------------------------------------------------

if (require.main === module) {
  runDLDSync()
    .then((r) => {
      console.log('[dld-sync] Result:', r);
      if (r.errors.length > 0) process.exit(1);
    })
    .catch((err) => {
      console.error('[dld-sync] Fatal:', err);
      process.exit(1);
    });
}
