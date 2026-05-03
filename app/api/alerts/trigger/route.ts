import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import type { Listing, PriceHistory, Watchlist, DLDTransaction, DLDRental, ComputedListing } from '../../../../types';
import { computeListingFields } from '../../../../lib/calculations';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function buildEmailHtml(listing: ComputedListing, dropPercent: number, currentPrice: number): string {
  const formatted = new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 0,
  }).format(currentPrice);

  const url = listing.listing_url ?? '#';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    ${listing.image_url ? `<img src="${listing.image_url}" alt="" style="width:100%;height:240px;object-fit:cover;">` : ''}
    <div style="padding:20px;">
      <span style="background:#dc2626;color:#fff;padding:3px 10px;border-radius:4px;font-size:13px;font-weight:700;">
        ▼ ${dropPercent.toFixed(1)}% Price Drop
      </span>
      <h2 style="margin:10px 0 6px;font-size:17px;color:#111;">${listing.title ?? 'Property Listing'}</h2>
      <p style="margin:0 0 4px;color:#555;font-size:14px;">
        📍 ${listing.area ?? ''}${listing.beds !== null ? ` · ${listing.beds} bed${listing.beds !== 1 ? 's' : ''}` : ''}
      </p>
      <p style="margin:10px 0;font-size:26px;font-weight:700;color:#111;">${formatted}</p>
      <a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;">
        View Listing →
      </a>
    </div>
  </div>
  <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:20px;">
    Dubai Price Intelligence &mdash; You're receiving this because you set up a price-drop watchlist.
  </p>
</body>
</html>`;
}

function buildWhatsAppMessage(listing: ComputedListing, dropPercent: number, currentPrice: number): string {
  const formatted = new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 0,
  }).format(currentPrice);

  return [
    '🏠 *Price Drop Alert!*',
    '',
    listing.title ?? 'Property Listing',
    `📍 ${listing.area ?? ''}${listing.beds !== null ? ` · ${listing.beds} bed${listing.beds !== 1 ? 's' : ''}` : ''}`,
    `💰 ${formatted} (▼${dropPercent.toFixed(1)}%)`,
    '',
    listing.listing_url ? `View: ${listing.listing_url}` : '',
  ]
    .join('\n')
    .trim();
}

function matchesWatchlist(listing: ComputedListing, watchlist: Watchlist): boolean {
  if (watchlist.areas !== null && watchlist.areas.length > 0) {
    if (listing.area === null || !watchlist.areas.includes(listing.area)) return false;
  }
  if (watchlist.property_type !== null && listing.property_type !== watchlist.property_type) return false;
  if (watchlist.beds_min !== null && (listing.beds === null || listing.beds < watchlist.beds_min)) return false;
  if (watchlist.beds_max !== null && (listing.beds === null || listing.beds > watchlist.beds_max)) return false;
  if (watchlist.max_price !== null && (listing.price === null || listing.price > watchlist.max_price)) return false;
  if (watchlist.min_drop_percent !== null) {
    if (listing.drop_percent === null || listing.drop_percent < watchlist.min_drop_percent) return false;
  }
  if (watchlist.min_yield !== null) {
    if (listing.estimated_gross_yield === null || listing.estimated_gross_yield < watchlist.min_yield) return false;
  }
  if (watchlist.motivation_filter !== null && listing.motivation_score !== watchlist.motivation_filter) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret');
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  let processed = 0;
  let emailsSent = 0;
  let whatsappStubbed = 0;
  let skipped = 0;

  // 1. Fetch all active watchlists
  const { data: rawWatchlists, error: wErr } = await supabase
    .from('watchlists')
    .select('*')
    .or('email_enabled.eq.true,whatsapp_enabled.eq.true');

  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });
  const watchlists = (rawWatchlists ?? []) as Watchlist[];
  if (watchlists.length === 0) {
    return NextResponse.json({ processed: 0, emailsSent: 0, whatsappStubbed: 0, skipped: 0 });
  }

  // 2. Find listings with a price drop in the last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentEntries, error: phErr } = await supabase
    .from('price_history')
    .select('listing_id')
    .gte('recorded_at', since);

  if (phErr) return NextResponse.json({ error: phErr.message }, { status: 500 });

  const recentIds = [...new Set((recentEntries ?? []).map((r: { listing_id: string }) => r.listing_id))];
  if (recentIds.length === 0) {
    return NextResponse.json({ processed: 0, emailsSent: 0, whatsappStubbed: 0, skipped: 0 });
  }

  // For each recently updated listing, fetch latest 2 price_history entries to detect a drop
  const droppedListingIds: string[] = [];
  for (const listingId of recentIds) {
    const { data: hist } = await supabase
      .from('price_history')
      .select('price, recorded_at')
      .eq('listing_id', listingId)
      .order('recorded_at', { ascending: false })
      .limit(2);

    if (hist && hist.length >= 2) {
      const latest = (hist[0] as { price: number }).price;
      const prev = (hist[1] as { price: number }).price;
      if (latest < prev) droppedListingIds.push(listingId);
    }
  }

  if (droppedListingIds.length === 0) {
    return NextResponse.json({ processed: 0, emailsSent: 0, whatsappStubbed: 0, skipped: 0 });
  }

  // 3. Fetch and enrich the dropped listings
  const { data: rawListings, error: lErr } = await supabase
    .from('listings')
    .select('*')
    .in('id', droppedListingIds)
    .eq('is_active', true);

  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
  const listings = (rawListings ?? []) as Listing[];
  if (listings.length === 0) {
    return NextResponse.json({ processed: 0, emailsSent: 0, whatsappStubbed: 0, skipped: 0 });
  }

  const activeIds = listings.map((l) => l.id);
  const areas = [...new Set(listings.map((l) => l.area).filter((a): a is string => a !== null))];

  const [phAll, txAll, rentAll] = await Promise.all([
    supabase.from('price_history').select('*').in('listing_id', activeIds),
    areas.length > 0
      ? supabase.from('dld_transactions').select('*').in('area', areas)
      : Promise.resolve({ data: [] as DLDTransaction[], error: null }),
    areas.length > 0
      ? supabase.from('dld_rentals').select('*').in('area', areas)
      : Promise.resolve({ data: [] as DLDRental[], error: null }),
  ]);

  if (phAll.error) return NextResponse.json({ error: phAll.error.message }, { status: 500 });
  if (txAll.error) return NextResponse.json({ error: txAll.error.message }, { status: 500 });
  if (rentAll.error) return NextResponse.json({ error: rentAll.error.message }, { status: 500 });

  const phByListing = new Map<string, PriceHistory[]>();
  for (const ph of (phAll.data ?? []) as PriceHistory[]) {
    const arr = phByListing.get(ph.listing_id) ?? [];
    arr.push(ph);
    phByListing.set(ph.listing_id, arr);
  }
  const txByArea = new Map<string, DLDTransaction[]>();
  for (const tx of (txAll.data ?? []) as DLDTransaction[]) {
    if (tx.area === null) continue;
    const arr = txByArea.get(tx.area) ?? [];
    arr.push(tx);
    txByArea.set(tx.area, arr);
  }
  const rentByArea = new Map<string, DLDRental[]>();
  for (const r of (rentAll.data ?? []) as DLDRental[]) {
    if (r.area === null) continue;
    const arr = rentByArea.get(r.area) ?? [];
    arr.push(r);
    rentByArea.set(r.area, arr);
  }

  const computedListings: ComputedListing[] = listings.map((listing) =>
    computeListingFields(
      listing,
      phByListing.get(listing.id) ?? [],
      listing.area !== null ? (txByArea.get(listing.area) ?? []) : [],
      listing.area !== null ? (rentByArea.get(listing.area) ?? []) : [],
    ),
  );

  // Cache user emails to avoid redundant auth lookups
  const emailCache = new Map<string, string | null>();

  async function getUserEmail(userId: string): Promise<string | null> {
    if (emailCache.has(userId)) return emailCache.get(userId)!;
    const { data } = await supabase.auth.admin.getUserById(userId);
    const email = data?.user?.email ?? null;
    emailCache.set(userId, email);
    return email;
  }

  // 4. Process each watchlist
  for (const watchlist of watchlists) {
    const matching = computedListings.filter((l) => matchesWatchlist(l, watchlist));
    if (matching.length === 0) continue;

    // Fetch existing alert_log entries to dedup
    const { data: existingAlerts } = await supabase
      .from('alert_log')
      .select('listing_id, channel')
      .eq('watchlist_id', watchlist.id)
      .in('listing_id', matching.map((l) => l.id));

    const alertedPairs = new Set(
      (existingAlerts ?? []).map((a: { listing_id: string; channel: string }) => `${a.listing_id}:${a.channel}`),
    );

    const now = new Date().toISOString();

    for (const listing of matching) {
      processed++;
      const currentPrice = listing.price ?? 0;
      const dropPercent = listing.drop_percent ?? 0;

      // Email channel
      if (watchlist.email_enabled) {
        const pairKey = `${listing.id}:email`;
        if (alertedPairs.has(pairKey)) {
          skipped++;
        } else {
          const userEmail = await getUserEmail(watchlist.user_id);
          if (userEmail) {
            try {
              await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL!,
                to: userEmail,
                subject: `Price drop: ${listing.title ?? 'Property'} — ▼${dropPercent.toFixed(1)}%`,
                html: buildEmailHtml(listing, dropPercent, currentPrice),
              });
              await supabase.from('alert_log').insert({
                watchlist_id: watchlist.id,
                listing_id: listing.id,
                channel: 'email',
                sent_at: now,
              });
              emailsSent++;
              alertedPairs.add(pairKey);
            } catch (err) {
              console.error(`[alerts] email send failed for listing ${listing.id}:`, err);
            }
          }
        }
      }

      // WhatsApp channel (stub)
      if (watchlist.whatsapp_enabled) {
        const pairKey = `${listing.id}:whatsapp`;
        if (alertedPairs.has(pairKey)) {
          skipped++;
        } else {
          const msg = buildWhatsAppMessage(listing, dropPercent, currentPrice);
          console.log(`[alerts/whatsapp] to=${watchlist.whatsapp_phone ?? 'unknown'} msg=${msg}`);
          await supabase.from('alert_log').insert({
            watchlist_id: watchlist.id,
            listing_id: listing.id,
            channel: 'whatsapp',
            sent_at: now,
          });
          whatsappStubbed++;
          alertedPairs.add(pairKey);
        }
      }
    }
  }

  return NextResponse.json({ processed, emailsSent, whatsappStubbed, skipped });
}
