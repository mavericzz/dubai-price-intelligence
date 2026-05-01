import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getListingById,
  getListingPriceHistory,
  getDLDComps,
  getYieldTrend,
  getSimilarDrops,
} from '@/lib/queries';
import {
  DropBadge,
  MotivationBadge,
  PriceDisplay,
  ContactAgentButton,
  ListingCard,
} from '@/components';
import type { DLDTransaction } from '@/types';
import { PriceHistoryChart } from './PriceHistoryChart';
import { YieldTrendChart } from './YieldTrendChart';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const listing = await getListingById(params.id);
  if (!listing) return { title: 'Listing not found' };
  return {
    title: listing.title ?? `Listing in ${listing.area ?? 'Dubai'}`,
    description: `Price: AED ${listing.price?.toLocaleString()} · ${listing.area}`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null, suffix = '') {
  if (n === null) return '—';
  return `${n.toLocaleString('en-US')}${suffix}`;
}

function medianPsf(txns: DLDTransaction[]): number | null {
  const psfs = txns
    .map((t) => {
      if (t.price_per_sqft !== null) return t.price_per_sqft;
      if (t.price !== null && t.size_sqft !== null && t.size_sqft > 0) {
        return t.price / t.size_sqft;
      }
      return null;
    })
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  if (psfs.length === 0) return null;
  const mid = Math.floor(psfs.length / 2);
  return psfs.length % 2 === 0 ? (psfs[mid - 1] + psfs[mid]) / 2 : psfs[mid];
}

function buildMotivationNarrative(
  dropPercent: number | null,
  dropCount: number,
  dropVelocity: number | null,
  daysOnMarket: number | null,
): string {
  const parts: string[] = [];

  if (dropCount > 0) {
    const avgDrop = dropPercent !== null ? ` averaging ${(dropPercent / dropCount).toFixed(1)}% per drop` : '';
    parts.push(`This seller has dropped the price ${dropCount} time${dropCount > 1 ? 's' : ''}${avgDrop}.`);
  }

  if (daysOnMarket !== null) {
    parts.push(`The listing has been on the market for ${daysOnMarket} days.`);
  }

  if (dropVelocity !== null && dropVelocity > 0) {
    const rate = (dropVelocity * 30).toFixed(1);
    parts.push(`Drop velocity is ${rate} drops per month.`);
  }

  if (parts.length === 0) return 'Insufficient price history to assess motivation.';

  const dom = daysOnMarket ?? 0;
  if ((dropPercent ?? 0) > 10 || dom > 180 || (dropVelocity ?? 0) > 0.5) {
    parts.push('Combined signals suggest high motivation to sell.');
  } else if (dropCount === 0 && dom < 30) {
    parts.push('Early on market with no drops — seller may not be motivated yet.');
  } else {
    parts.push('Moderate seller motivation.');
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const listing = await getListingById(params.id);
  if (!listing) notFound();

  const [priceHistory, comps, yieldTrend, similarDrops] = await Promise.all([
    getListingPriceHistory(params.id),
    listing.area && listing.property_type && listing.beds !== null
      ? getDLDComps(listing.area, listing.property_type, listing.beds)
      : Promise.resolve([]),
    listing.area ? getYieldTrend(listing.area, 12) : Promise.resolve([]),
    listing.area ? getSimilarDrops(listing.area, params.id, 4) : Promise.resolve([]),
  ]);

  const medPsf = medianPsf(comps);
  const narrative = buildMotivationNarrative(
    listing.drop_percent,
    listing.drop_count,
    listing.drop_velocity,
    listing.days_on_market,
  );

  const areaAvgYield =
    yieldTrend.length > 0
      ? yieldTrend.reduce((s, d) => s + d.yield, 0) / yieldTrend.length
      : null;

  return (
    <main className="min-h-screen bg-[#09090E] px-4 pb-16 pt-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-10">

        {/* ── 1. Hero ───────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-[#1F1F2E] bg-[#111118] overflow-hidden">
          {/* Image */}
          <div className="relative aspect-[21/9] w-full bg-[#09090E]">
            {listing.image_url ? (
              <Image
                src={listing.image_url}
                alt={listing.title ?? 'Property image'}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 1024px"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-700">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-16 w-16" aria-hidden="true">
                  <path d="M3 9.5L12 3l9 6.5V21H3V9.5z" />
                </svg>
              </div>
            )}
          </div>

          <div className="p-6 space-y-4">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <DropBadge dropPercent={listing.drop_percent} />
              <MotivationBadge motivation={listing.motivation_score} />
              {listing.is_off_plan && (
                <span className="inline-flex items-center rounded-full bg-indigo-900/60 px-2 py-0.5 text-xs font-medium text-indigo-300">
                  Off-Plan
                </span>
              )}
            </div>

            {/* Title */}
            {listing.title && (
              <h1 className="text-2xl font-bold text-slate-100 leading-snug">{listing.title}</h1>
            )}

            {/* Price */}
            <div className="flex flex-wrap items-end gap-3">
              <PriceDisplay price={listing.price} className="text-3xl" />
              {listing.peak_price !== null && listing.drop_amount_aed !== null && listing.drop_amount_aed > 0 && (
                <span className="text-sm text-slate-500 line-through">
                  AED {listing.peak_price.toLocaleString()}
                </span>
              )}
            </div>

            {/* Property details grid */}
            <div className="flex flex-wrap gap-4 text-sm">
              {listing.beds !== null && (
                <div className="flex items-center gap-1.5 text-slate-300">
                  <BedIcon />
                  <span>{listing.beds} bed{listing.beds !== 1 ? 's' : ''}</span>
                </div>
              )}
              {listing.baths !== null && (
                <div className="flex items-center gap-1.5 text-slate-300">
                  <BathIcon />
                  <span>{listing.baths} bath{listing.baths !== 1 ? 's' : ''}</span>
                </div>
              )}
              {listing.size_sqft !== null && (
                <div className="flex items-center gap-1.5 text-slate-300">
                  <SqftIcon />
                  <span>{listing.size_sqft.toLocaleString()} sqft</span>
                </div>
              )}
              {listing.area && (
                <div className="flex items-center gap-1.5 text-slate-400">
                  <PinIcon />
                  <span>{listing.area}{listing.sub_area ? `, ${listing.sub_area}` : ''}</span>
                </div>
              )}
              {listing.days_on_market !== null && (
                <div className="flex items-center gap-1.5 text-slate-400">
                  <CalendarIcon />
                  <span>{listing.days_on_market} days on market</span>
                </div>
              )}
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3 pt-2">
              <ContactAgentButton
                listingTitle={listing.title}
                listingUrl={listing.listing_url}
              />
              {listing.listing_url && (
                <a
                  href={listing.listing_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#1F1F2E] bg-[#09090E] px-4 py-2 text-sm font-medium text-slate-300 hover:border-[#6366F1]/50 hover:text-white transition-colors"
                >
                  View Original Listing ↗
                </a>
              )}
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-[#1F1F2E] bg-[#09090E] px-4 py-2 text-sm font-medium text-slate-300 hover:border-[#6366F1]/50 hover:text-white transition-colors"
                aria-label="Save to watchlist"
              >
                <BookmarkIcon />
                Save to Watchlist
              </button>
            </div>
          </div>
        </section>

        {/* ── 2. Price History chart ────────────────────────────────────── */}
        <section className="rounded-2xl border border-[#1F1F2E] bg-[#111118] p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-100">Price History</h2>
          <PriceHistoryChart history={priceHistory} peakPrice={listing.peak_price} />
          {priceHistory.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              {priceHistory.length} data point{priceHistory.length !== 1 ? 's' : ''} ·
              Purple dashed line = peak price · Red dots = price drops
            </p>
          )}
        </section>

        {/* ── 3. DLD Comps table ───────────────────────────────────────── */}
        <section className="rounded-2xl border border-[#1F1F2E] bg-[#111118] p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-100">DLD Comparable Transactions</h2>

          {/* Median PSF callout */}
          {medPsf !== null && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-[#1F1F2E] bg-[#09090E] px-4 py-2">
              <span className="text-xs text-slate-500">Median PSF</span>
              <span className="tabular-nums text-lg font-bold text-[#6366F1]">
                AED {Math.round(medPsf).toLocaleString()}
              </span>
              <span className="text-xs text-slate-500">/ sqft</span>
            </div>
          )}

          {comps.length === 0 ? (
            <p className="text-sm text-slate-500">No comparable DLD transactions found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1F1F2E] text-left">
                    <th className="pb-2 pr-4 font-medium text-slate-500">Date</th>
                    <th className="pb-2 pr-4 font-medium text-slate-500">Price</th>
                    <th className="pb-2 pr-4 font-medium text-slate-500">Size (sqft)</th>
                    <th className="pb-2 font-medium text-slate-500">PSF</th>
                  </tr>
                </thead>
                <tbody>
                  {comps.slice(0, 20).map((tx) => {
                    const psf =
                      tx.price_per_sqft ??
                      (tx.price !== null && tx.size_sqft !== null && tx.size_sqft > 0
                        ? Math.round(tx.price / tx.size_sqft)
                        : null);
                    return (
                      <tr
                        key={tx.id}
                        className="border-b border-[#1F1F2E]/50 hover:bg-[#09090E]/60 transition-colors"
                      >
                        <td className="py-2 pr-4 text-slate-400 tabular-nums">
                          {tx.transaction_date
                            ? new Date(tx.transaction_date).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </td>
                        <td className="py-2 pr-4 text-slate-100 tabular-nums">
                          {tx.price !== null ? `AED ${tx.price.toLocaleString()}` : '—'}
                        </td>
                        <td className="py-2 pr-4 text-slate-400 tabular-nums">
                          {fmt(tx.size_sqft)}
                        </td>
                        <td className="py-2 text-slate-300 tabular-nums">
                          {psf !== null ? `AED ${Math.round(psf).toLocaleString()}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {comps.length > 20 && (
                <p className="mt-2 text-xs text-slate-500">Showing 20 of {comps.length} transactions</p>
              )}
            </div>
          )}
        </section>

        {/* ── 4. Yield Analysis ────────────────────────────────────────── */}
        <section className="rounded-2xl border border-[#1F1F2E] bg-[#111118] p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-100">Yield Analysis</h2>

          <div className="mb-6 flex flex-wrap gap-4">
            {/* Current yield */}
            <div className="flex flex-col gap-1 rounded-xl border border-[#1F1F2E] bg-[#09090E] px-5 py-3">
              <span className="text-xs text-slate-500">Estimated Gross Yield</span>
              <span
                className={`tabular-nums text-3xl font-bold ${
                  listing.estimated_gross_yield !== null && listing.estimated_gross_yield > 6
                    ? 'text-emerald-400'
                    : listing.estimated_gross_yield !== null && listing.estimated_gross_yield >= 4
                    ? 'text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                {listing.estimated_gross_yield !== null
                  ? `${listing.estimated_gross_yield.toFixed(1)}%`
                  : '—'}
              </span>
            </div>

            {/* Area average */}
            {areaAvgYield !== null && (
              <div className="flex flex-col gap-1 rounded-xl border border-[#1F1F2E] bg-[#09090E] px-5 py-3">
                <span className="text-xs text-slate-500">12-Month Area Average</span>
                <span className="tabular-nums text-3xl font-bold text-slate-300">
                  {areaAvgYield.toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          <h3 className="mb-3 text-sm font-medium text-slate-400">12-Month Yield Trend — {listing.area}</h3>
          <YieldTrendChart data={yieldTrend} />
        </section>

        {/* ── 5. Seller Motivation breakdown ───────────────────────────── */}
        <section className="rounded-2xl border border-[#1F1F2E] bg-[#111118] p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-100">Seller Motivation</h2>

          {/* Large badge */}
          <div className="mb-6 flex items-center gap-3">
            <MotivationBadgeLarge motivation={listing.motivation_score} />
          </div>

          {/* Score factors */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ScoreFactor
              label="Price Drop"
              value={listing.drop_percent !== null ? `${listing.drop_percent.toFixed(1)}%` : '—'}
              sub="from peak"
              highlight={listing.drop_percent !== null && listing.drop_percent > 10}
            />
            <ScoreFactor
              label="Drop Count"
              value={fmt(listing.drop_count)}
              sub="total drops"
              highlight={listing.drop_count >= 3}
            />
            <ScoreFactor
              label="Drop Velocity"
              value={
                listing.drop_velocity !== null
                  ? `${(listing.drop_velocity * 30).toFixed(1)}/mo`
                  : '—'
              }
              sub="drops per month"
              highlight={listing.drop_velocity !== null && listing.drop_velocity > 0.5}
            />
            <ScoreFactor
              label="Days on Market"
              value={fmt(listing.days_on_market)}
              sub="days listed"
              highlight={listing.days_on_market !== null && listing.days_on_market > 90}
            />
          </div>

          {/* Plain English interpretation */}
          <div className="rounded-xl border border-[#1F1F2E] bg-[#09090E] p-4">
            <p className="text-sm leading-relaxed text-slate-300">{narrative}</p>
          </div>
        </section>

        {/* ── 6. Similar Active Drops ──────────────────────────────────── */}
        {similarDrops.length > 0 && (
          <section className="rounded-2xl border border-[#1F1F2E] bg-[#111118] p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-100">
              Similar Active Drops in {listing.area}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {similarDrops.map((similar) => (
                <Link key={similar.id} href={`/listing/${similar.id}`}>
                  <ListingCard listing={similar} />
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Small local components
// ---------------------------------------------------------------------------

function MotivationBadgeLarge({ motivation }: { motivation: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const styles: Record<string, string> = {
    HIGH: 'bg-red-600 text-white',
    MEDIUM: 'bg-amber-500 text-black',
    LOW: 'bg-teal-600 text-white',
  };
  const labels: Record<string, string> = {
    HIGH: 'High Motivation',
    MEDIUM: 'Medium Motivation',
    LOW: 'Low Motivation',
  };
  return (
    <span className={`inline-flex items-center rounded-xl px-5 py-2.5 text-xl font-bold ${styles[motivation]}`}>
      {labels[motivation]}
    </span>
  );
}

function ScoreFactor({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[#1F1F2E] bg-[#09090E] p-4">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={`tabular-nums text-2xl font-bold ${highlight ? 'text-red-400' : 'text-slate-100'}`}
      >
        {value}
      </span>
      <span className="text-xs text-slate-600">{sub}</span>
    </div>
  );
}

// Inline SVG icons to avoid adding an icon library
function BedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 text-slate-500" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12V6a1 1 0 011-1h2m0 0v7m0-7h10m0 0a1 1 0 011 1v5m0 0H4m16 0v3M4 17v3" />
    </svg>
  );
}

function BathIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 text-slate-500" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 13.5V5a2 2 0 014 0v.75m4.5 7.75H3.75a.75.75 0 000 1.5h.75v1.5a2.25 2.25 0 004.5 0V15h1.5v1.5a2.25 2.25 0 004.5 0V15h.75a.75.75 0 000-1.5z" />
    </svg>
  );
}

function SqftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 text-slate-500" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 text-slate-500" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 text-slate-500" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
    </svg>
  );
}
