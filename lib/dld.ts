import { supabase } from './supabase';
import type { DLDApiTransaction, DLDSyncResult } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DLD_TOKEN_URL =
  'https://api.dubaipulse.gov.ae/oauth/client_credential/accesstoken?grant_type=client_credentials';
const DLD_TRANSACTIONS_URL =
  'https://api.dubaipulse.gov.ae/open/dld/dld_transactions-open-api';

/** Re-use the token within a single sync run (valid 30 min). */
let _tokenCache: { value: string; expiresAt: number } | null = null;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.value;
  }

  const clientId = process.env['DLD_CLIENT_ID'];
  const clientSecret = process.env['DLD_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new Error('DLD_CLIENT_ID and DLD_CLIENT_SECRET env vars are required');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(DLD_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DLD OAuth2 failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  _tokenCache = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return _tokenCache.value;
}

// ---------------------------------------------------------------------------
// Fetch transactions
// ---------------------------------------------------------------------------

/** Fetch all sale transactions registered in the last `windowHours` hours. */
async function fetchRecentTransactions(windowHours = 48): Promise<DLDApiTransaction[]> {
  const token = await getAccessToken();

  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const sinceStr = since.toISOString().split('T')[0]; // YYYY-MM-DD

  const results: DLDApiTransaction[] = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const params = new URLSearchParams({
      transaction_type: 'Sale',
      date_from: sinceStr,
      limit: String(pageSize),
      offset: String(offset),
    });

    const res = await fetch(`${DLD_TRANSACTIONS_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`DLD transactions API failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as { data?: DLDApiTransaction[]; result?: DLDApiTransaction[] };
    // Dubai Pulse API may wrap results under 'data' or 'result'
    const page = json.data ?? json.result ?? [];
    results.push(...(page as DLDApiTransaction[]));

    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/** Map DLD rooms string ("2 B/R", "Studio", etc.) to integer beds. */
function parseBeds(rooms: string | null): number | null {
  if (!rooms) return null;
  const lower = rooms.toLowerCase().trim();
  if (lower === 'studio') return 0;
  const match = lower.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/** Normalise area name for fuzzy-matching against listings.area. */
function normaliseArea(area: string): string {
  return area.trim().toLowerCase();
}

/** Normalise property type for comparison. */
function normalisePropType(type: string): string {
  return type.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Upsert + cross-reference
// ---------------------------------------------------------------------------

async function upsertTransaction(tx: DLDApiTransaction): Promise<void> {
  const beds = parseBeds(tx.rooms_en);

  await supabase.from('dld_transactions').upsert(
    {
      external_id: tx.trans_id,
      area: tx.area_en,
      property_type: tx.property_type_en,
      beds,
      price: tx.actual_worth,
      price_aed: Math.round(tx.actual_worth),
      transaction_date: tx.instance_date.split('T')[0],
      building_name: tx.project_name_en ?? null,
      unit_number: tx.unit_no ?? null,
      transaction_type: 'Sale',
      synced_at: new Date().toISOString(),
    },
    { onConflict: 'external_id', ignoreDuplicates: false },
  );
}

/**
 * Find any active listing that matches this DLD transaction on:
 *  - area (case-insensitive)
 *  - property_type (case-insensitive)
 *  - beds (exact)
 *  - price within ±5%
 *
 * Returns the matched listing's UUID, or null.
 */
async function findMatchingListing(tx: DLDApiTransaction): Promise<string | null> {
  const beds = parseBeds(tx.rooms_en);
  const low = tx.actual_worth * 0.95;
  const high = tx.actual_worth * 1.05;

  let query = supabase
    .from('listings')
    .select('id')
    .eq('is_active', true)
    .eq('listing_status', 'active')
    .ilike('area', tx.area_en.trim())
    .ilike('property_type', tx.property_type_en.trim())
    .gte('price', low)
    .lte('price', high)
    .limit(1);

  if (beds !== null) {
    query = query.eq('beds', beds);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data as Array<{ id: string }> | null;
  return rows && rows.length > 0 ? rows[0].id : null;
}

/** Mark a listing as sold via DLD and record the transaction reference. */
async function markListingSold(listingId: string, transactionId: string): Promise<void> {
  const { error } = await supabase
    .from('listings')
    .update({
      is_active: false,
      listing_status: 'sold_dld',
      sold_detected_at: new Date().toISOString(),
      dld_transaction_id: transactionId,
    })
    .eq('id', listingId);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function syncDLDTransactions(windowHours = 48): Promise<DLDSyncResult> {
  const transactions = await fetchRecentTransactions(windowHours);

  let upserted = 0;
  let matched = 0;

  for (const tx of transactions) {
    try {
      await upsertTransaction(tx);
      upserted++;

      const listingId = await findMatchingListing(tx);
      if (listingId) {
        await markListingSold(listingId, tx.trans_id);
        matched++;
      }
    } catch (err) {
      // Log and continue — a single bad row should not abort the whole run.
      console.error(`[dld-sync] error processing tx ${tx.trans_id}:`, err);
    }
  }

  return { fetched: transactions.length, upserted, matched };
}
