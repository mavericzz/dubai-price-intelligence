// Price-drop WhatsApp alert job.
//
// Run this on a schedule (e.g. every 5 minutes) to stay within the 15-minute
// delivery SLA. The job is idempotent: the DB unique index on
// (watchlist_id, listing_id, channel, price_at_alert) prevents duplicate sends
// even if the job overlaps with itself.
//
// Required env vars (in addition to Supabase vars):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, APP_BASE_URL

import { supabaseService } from '../supabase-service';
import { enrichListings, getDroppedListings } from '../queries';
import { sendWhatsAppMessage, formatPriceDropMessage } from '../whatsapp';
import type { Watchlist, ComputedListing } from '../../types';

// Twilio's default rate limit for WhatsApp is 1 msg/sec per sender.
// 1.1s gives a small buffer.
const INTER_MESSAGE_DELAY_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AlertJobResult {
  watchlistsProcessed: number;
  matchesFound: number;
  alertsSent: number;
  alertsSkipped: number;
  errors: number;
}

/** True if the listing satisfies all filter criteria on the watchlist. */
function listingMatchesWatchlist(
  listing: ComputedListing,
  wl: Watchlist,
): boolean {
  if (wl.areas && wl.areas.length > 0 && !wl.areas.includes(listing.area ?? ''))
    return false;
  if (wl.property_type && listing.property_type !== wl.property_type)
    return false;
  if (wl.beds_min !== null && (listing.beds ?? 0) < wl.beds_min)
    return false;
  if (wl.beds_max !== null && (listing.beds ?? Infinity) > wl.beds_max)
    return false;
  if (wl.max_price !== null && (listing.price ?? Infinity) > wl.max_price)
    return false;
  if (wl.min_drop_percent !== null && (listing.drop_percent ?? 0) < wl.min_drop_percent)
    return false;
  if (wl.min_yield !== null && (listing.estimated_gross_yield ?? 0) < wl.min_yield)
    return false;
  if (wl.motivation_filter && listing.motivation_score !== wl.motivation_filter)
    return false;
  return true;
}

/**
 * Check whether we have already sent a WhatsApp alert for this listing at this
 * exact price. A new alert is warranted only when the price drops further.
 */
async function alreadyAlerted(
  watchlistId: string,
  listingId: string,
  priceAtAlert: number,
): Promise<boolean> {
  const { data, error } = await supabaseService
    .from('alert_log')
    .select('id')
    .eq('watchlist_id', watchlistId)
    .eq('listing_id', listingId)
    .eq('channel', 'whatsapp')
    .eq('price_at_alert', priceAtAlert)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

/** Insert a row into alert_log. The unique index is the final dedup guard. */
async function logAlert(
  watchlistId: string,
  listingId: string,
  priceAtAlert: number,
): Promise<void> {
  const { error } = await supabaseService.from('alert_log').insert({
    watchlist_id:   watchlistId,
    listing_id:     listingId,
    channel:        'whatsapp',
    price_at_alert: priceAtAlert,
  });

  // 23505 = unique_violation: a concurrent job already logged this alert.
  if (error && (error as { code?: string }).code !== '23505') throw error;
}

/**
 * Main entry point. Finds all price-dropped listings, matches them against
 * WhatsApp-enabled watchlists, deduplicates, and sends alerts.
 */
export async function runPriceDropAlerts(): Promise<AlertJobResult> {
  const result: AlertJobResult = {
    watchlistsProcessed: 0,
    matchesFound:        0,
    alertsSent:          0,
    alertsSkipped:       0,
    errors:              0,
  };

  // 1. Fetch and enrich active listings with price drops.
  const rawDropped = await getDroppedListings();
  if (rawDropped.length === 0) return result;

  const droppedListings = await enrichListings(rawDropped);

  // 2. Fetch all WhatsApp-enabled watchlists that haven't been opted out.
  const { data: watchlistData, error: wlError } = await supabaseService
    .from('watchlists')
    .select('*')
    .eq('whatsapp_enabled', true)
    .not('whatsapp_phone', 'is', null)
    .is('whatsapp_opted_out_at', null);

  if (wlError) throw wlError;
  const watchlists = (watchlistData ?? []) as Watchlist[];
  result.watchlistsProcessed = watchlists.length;

  // 3. For each watchlist × listing pair, check match + dedup then send.
  for (const wl of watchlists) {
    const phone = wl.whatsapp_phone!;

    for (const listing of droppedListings) {
      if (!listingMatchesWatchlist(listing, wl)) continue;
      if (listing.price === null) continue;

      result.matchesFound++;

      try {
        const duplicate = await alreadyAlerted(wl.id, listing.id, listing.price);
        if (duplicate) {
          result.alertsSkipped++;
          continue;
        }

        const body = formatPriceDropMessage({
          title:         listing.title ?? 'Property',
          area:          listing.area,
          newPrice:      listing.price,
          dropPercent:   listing.drop_percent ?? 0,
          dropAmountAed: listing.drop_amount_aed ?? 0,
          listingId:     listing.id,
          listingUrl:    listing.listing_url,
        });

        await sendWhatsAppMessage({ to: phone, body });
        await logAlert(wl.id, listing.id, listing.price);

        result.alertsSent++;

        // Respect Twilio rate limit between sends.
        await sleep(INTER_MESSAGE_DELAY_MS);
      } catch (err) {
        result.errors++;
        console.error(
          `[price-drop-alerts] Error sending to watchlist=${wl.id} listing=${listing.id}:`,
          err,
        );
      }
    }
  }

  return result;
}
