import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
import {
  getListingById,
  getListingPriceHistory,
  getDLDComps,
  getYieldTrend,
  getSimilarDrops,
} from '@/lib/queries';
import type { DLDTransaction } from '@/types';
import { PriceHistoryChart } from './PriceHistoryChart';
import { fmtAED, fmtFull, classifyCut, patternFor } from '@/lib/almanac';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  try {
    const listing = await getListingById(params.id);
    if (!listing) return { title: 'Dossier not found · The DXB Almanac' };
    return {
      title: `${listing.title ?? listing.area ?? 'Dossier'} · The DXB Almanac`,
      description: `Asking ${listing.price ? `AED ${listing.price.toLocaleString()}` : '—'} · ${listing.area ?? 'Dubai'}`,
    };
  } catch {
    return { title: 'Dossier not found · The DXB Almanac' };
  }
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

function shortDate(): string {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function buildEssay(p: {
  title: string | null;
  area: string | null;
  beds: number | null;
  baths: number | null;
  property_type: string | null;
  price: number | null;
  peak_price: number | null;
  drop_percent: number | null;
  drop_count: number;
  days_on_market: number | null;
  agent_name: string | null;
  listing_psf: number | null;
}): string[] {
  const months = p.days_on_market ? Math.max(1, Math.round(p.days_on_market / 30)) : null;
  const cut = Math.abs(p.drop_percent ?? 0);
  const intro = `${p.title ?? 'This entry'} first arrived on the listing sheets ${
    p.agent_name ? `of ${p.agent_name}` : ''
  } at a confident ${fmtFull(p.peak_price)} — a figure consistent with the bull tone that prevailed across ${
    p.area ?? 'the area'
  } through the back half of last year. ${
    months ? `${months} month${months === 1 ? '' : 's'} and ` : ''
  }${p.drop_count} ${p.drop_count === 1 ? 'silent revision' : 'silent revisions'} later, the asking has settled at ${fmtFull(
    p.price,
  )}, a level that places it firmly in the bottom quartile of comparable ${
    p.beds !== null ? `${p.beds}-bedroom` : ''
  } stock in the area.`;

  const middle =
    p.drop_count >= 3
      ? `The pattern is the giveaway. ${p.drop_count} cuts ${months ? `in ${months} months` : ''} is not a negotiation; it is, in the parlance of this almanac, a *capitulation*. The seller has stopped guessing what the property is worth and started asking the market what it will pay. That is the moment, our correspondent observes, when the buyer's leverage is highest and the broker's voice softest.`
      : p.drop_count > 0
      ? `The first reduction is rarely the last. At ${cut.toFixed(1)} per cent below the original ask, this entry has crossed the threshold at which most listings begin a measured descent — the point where the seller's patience and the broker's diary diverge.`
      : `No cuts have been filed yet, but the long days on market suggest the next mark is not far off. Patience, on either side of this transaction, is the relevant currency.`;

  const close = p.listing_psf
    ? `Comparable stock in ${p.area ?? 'the area'} currently transacts at roughly AED ${Math.round(
        p.listing_psf * 1.08,
      ).toLocaleString()} per square foot. This entry sits at AED ${Math.round(
        p.listing_psf,
      ).toLocaleString()}. The chart below traces the descent.`
    : `The chart below traces the descent of the asking-price line over the period this almanac has had the property under watch.`;

  return [intro, middle, close];
}

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let listing;
  try {
    listing = await getListingById(params.id);
  } catch {
    notFound();
  }
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
  const c = classifyCut(listing.drop_percent, listing.drop_count);
  const dossierNum = parseInt(listing.id.replace(/\D/g, '').slice(0, 6) || '1', 10) % 999;
  const cut = Math.abs(listing.drop_percent ?? 0);

  const titleParts = (listing.title ?? listing.area ?? 'Dossier').split(' ');
  const titleHead = titleParts.slice(0, -1).join(' ') || titleParts[0];
  const titleTail = titleParts.length > 1 ? titleParts[titleParts.length - 1] : '';

  const essay = buildEssay({
    title: listing.title,
    area: listing.area,
    beds: listing.beds,
    baths: listing.baths,
    property_type: listing.property_type,
    price: listing.price,
    peak_price: listing.peak_price,
    drop_percent: listing.drop_percent,
    drop_count: listing.drop_count,
    days_on_market: listing.days_on_market,
    agent_name: listing.agent_name,
    listing_psf: listing.listing_psf,
  });

  const pattern = patternFor(listing.area);

  const areaAvgYield =
    yieldTrend.length > 0
      ? yieldTrend.reduce((s, d) => s + d.yield, 0) / yieldTrend.length
      : null;

  return (
    <main className="almanac-page">
      <Link href="/" className="dossier-back">
        ← Return to the Register
      </Link>

      <div className="dossier-head">
        <div>
          <div className="dossier-eyebrow">
            <span>Dossier №{String(dossierNum).padStart(3, '0')}</span>
            <span>·</span>
            <span>{listing.area ?? 'Dubai'}</span>
            <span>·</span>
            <span style={{ color: 'var(--red)' }}>{c.label}</span>
          </div>
          <h1 className="dossier-title">
            {titleHead} {titleTail && <em>{titleTail}</em>}
          </h1>
          <p className="dossier-deck">
            A {listing.beds !== null ? `${listing.beds}-bedroom ` : ''}
            {(listing.property_type ?? 'property').toLowerCase()}
            {listing.sub_area ? ` on ${listing.sub_area}` : ''}, marked down {listing.drop_count}{' '}
            {listing.drop_count === 1 ? 'time' : 'times'} since first watch — now offered{' '}
            {cut.toFixed(1)} percent below initial ask.
          </p>
        </div>
        <div className="dossier-num">{String(dossierNum).padStart(3, '0')}</div>
      </div>

      <div className="dossier-body">
        {/* MAIN COLUMN */}
        <div>
          <div className="essay dropcap">
            {essay.map((para, i) => (
              <p key={i}>
                {para.split('*').map((seg, j) =>
                  j % 2 === 1 ? <em key={j}>{seg}</em> : <span key={j}>{seg}</span>,
                )}
              </p>
            ))}
          </div>

          <PriceHistoryChart history={priceHistory} peakPrice={listing.peak_price} />

          <div className="gallery">
            {listing.image_url ? (
              <div style={{ position: 'relative' }}>
                <Image
                  src={listing.image_url}
                  alt={listing.title ?? 'Property image'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 600px"
                />
                <div className="gallery-cap">{listing.area ?? 'Reception'}</div>
              </div>
            ) : (
              <div>
                <div className={`ph ph-${pattern}`}></div>
                <div className="gallery-cap">Reception</div>
              </div>
            )}
            <div>
              <div className={`ph ph-${pattern}`}></div>
              <div className="gallery-cap">Kitchen</div>
            </div>
            <div>
              <div className={`ph ph-${pattern}`}></div>
              <div className="gallery-cap">Aspect</div>
            </div>
            <div>
              <div className={`ph ph-${pattern}`}></div>
              <div className="gallery-cap">Principal bedroom</div>
            </div>
            <div>
              <div className={`ph ph-${pattern}`}></div>
              <div className="gallery-cap">Terrace</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 24, marginTop: 8 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              The Particulars
            </div>
            <div className="facts">
              <div className="fact">
                <span className="fact-label">Type</span>
                <span className="fact-val">{listing.property_type ?? '—'}</span>
              </div>
              <div className="fact">
                <span className="fact-label">Built-up area</span>
                <span className="fact-val">
                  {listing.size_sqft ? listing.size_sqft.toLocaleString() : '—'}{' '}
                  <span style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>sqft</span>
                </span>
              </div>
              <div className="fact">
                <span className="fact-label">Bedrooms / Baths</span>
                <span className="fact-val">
                  {listing.beds ?? '—'} / {listing.baths ?? '—'}
                </span>
              </div>
              <div className="fact">
                <span className="fact-label">Area</span>
                <span className="fact-val" style={{ fontSize: 18 }}>
                  {listing.area ?? '—'}
                </span>
              </div>
              <div className="fact">
                <span className="fact-label">Price / sqft</span>
                <span className="fact-val">
                  {listing.listing_psf ? `AED ${Math.round(listing.listing_psf).toLocaleString()}` : '—'}
                </span>
              </div>
              <div className="fact">
                <span className="fact-label">Days on market</span>
                <span className="fact-val">{listing.days_on_market ?? '—'}</span>
              </div>
              <div className="fact">
                <span className="fact-label">Reductions filed</span>
                <span className="fact-val">{listing.drop_count}</span>
              </div>
              <div className="fact">
                <span className="fact-label">Listed by</span>
                <span className="fact-val" style={{ fontSize: 16, fontStyle: 'italic' }}>
                  {listing.agent_name ?? '—'}
                </span>
              </div>
            </div>
          </div>

          {medPsf !== null && comps.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Comparable Transactions · DLD register
              </div>
              <div
                style={{
                  fontFamily: 'var(--display)',
                  fontStyle: 'italic',
                  fontSize: 22,
                  marginBottom: 14,
                }}
              >
                Median PSF · <span style={{ fontFamily: 'var(--mono)', fontStyle: 'normal', fontSize: 18 }}>AED {Math.round(medPsf).toLocaleString()}</span> per square foot, {comps.length} comparables
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--serif)', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px 8px 0', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Price</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Size</th>
                    <th style={{ textAlign: 'right', padding: '8px 0 8px 12px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>PSF</th>
                  </tr>
                </thead>
                <tbody>
                  {comps.slice(0, 12).map((tx) => {
                    const psf =
                      tx.price_per_sqft ??
                      (tx.price !== null && tx.size_sqft !== null && tx.size_sqft > 0
                        ? Math.round(tx.price / tx.size_sqft)
                        : null);
                    return (
                      <tr key={tx.id} style={{ borderBottom: '1px dotted var(--rule-soft)' }}>
                        <td style={{ padding: '10px 12px 10px 0', color: 'var(--ink-2)' }}>
                          {tx.transaction_date
                            ? new Date(tx.transaction_date).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--display)', fontSize: 18 }}>
                          {tx.price ? fmtFull(tx.price) : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--ink-2)', fontFamily: 'var(--mono)', fontSize: 13 }}>
                          {tx.size_sqft ? `${tx.size_sqft.toLocaleString()} sqft` : '—'}
                        </td>
                        <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                          {psf !== null ? `AED ${Math.round(psf).toLocaleString()}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {similarDrops.length > 0 && (
            <div style={{ marginTop: 40, borderTop: '4px double var(--rule)', paddingTop: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Of similar particular · in {listing.area}
              </div>
              <div className="register">
                {similarDrops.map((sim, i) => (
                  <Link
                    href={`/listing/${sim.id}`}
                    key={sim.id}
                    style={{ display: 'block', textDecoration: 'none' }}
                  >
                    <div
                      className="atlas-item"
                      style={{ gridTemplateColumns: '36px 1fr auto' }}
                    >
                      <div className="num">{String(i + 1).padStart(2, '0')}.</div>
                      <div>
                        <div className="name">{sim.title ?? sim.area}</div>
                        <div className="meta">
                          {sim.area} · {sim.beds ?? '—'}br · {sim.property_type ?? '—'}
                        </div>
                      </div>
                      <div>
                        <div className="price">{fmtAED(sim.price ?? 0)}</div>
                        <div className="drop">↓ {Math.abs(sim.drop_percent ?? 0).toFixed(1)}%</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="v-rule"></div>

        {/* SIDE — price summary */}
        <aside className="dossier-side">
          <div className="side-block">
            <div className="side-block-label">Current Asking · {shortDate()}</div>
            <div className="side-current">{fmtAED(listing.price ?? 0)}</div>
            {listing.peak_price && listing.peak_price !== listing.price && (
              <div className="side-was">listed {fmtFull(listing.peak_price)}</div>
            )}
            {(listing.drop_percent ?? 0) !== 0 && (
              <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`classif ${c.cls}`} style={{ margin: 0 }}>
                  ↓ {cut.toFixed(1)}% from list
                </span>
              </div>
            )}
          </div>

          <div className="side-block">
            <div className="side-block-label">The Numbers</div>
            <div className="side-row">
              <span className="label">Reductions</span>
              <span className="val">{listing.drop_count}</span>
            </div>
            <div className="side-row">
              <span className="label">Days on market</span>
              <span className="val">{listing.days_on_market ?? '—'}</span>
            </div>
            <div className="side-row">
              <span className="label">Price / sqft</span>
              <span className="val">
                {listing.listing_psf ? Math.round(listing.listing_psf).toLocaleString() : '—'}
              </span>
            </div>
            <div className="side-row">
              <span className="label">Area median</span>
              <span className="val">
                {listing.area_avg_psf ? Math.round(listing.area_avg_psf).toLocaleString() : '—'}
              </span>
            </div>
            <div className="side-row">
              <span className="label">Gross yield</span>
              <span className="val">
                {listing.estimated_gross_yield !== null
                  ? `${listing.estimated_gross_yield.toFixed(1)}%`
                  : '—'}
              </span>
            </div>
            {areaAvgYield !== null && (
              <div className="side-row">
                <span className="label">Area yield · 12mo</span>
                <span className="val">{areaAvgYield.toFixed(1)}%</span>
              </div>
            )}
            <div className="side-row">
              <span className="label">Motivation</span>
              <span className={`val ${listing.motivation_score === 'HIGH' ? 'red' : ''}`}>
                {listing.motivation_score}
              </span>
            </div>
          </div>

          {listing.agent_name && (
            <div className="side-block">
              <div className="side-block-label">Of the Correspondent</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: '-0.005em' }}>
                {listing.agent_name}
              </div>
              {listing.agent_phone && (
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 13,
                    color: 'var(--ink-3)',
                    marginTop: 4,
                  }}
                >
                  {listing.agent_phone}
                </div>
              )}
            </div>
          )}

          {listing.listing_url && (
            <a
              href={listing.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="cta-stamp"
              style={{ textDecoration: 'none' }}
            >
              View original sheet ↗
            </a>
          )}
          <Link href="/watchlist" className="cta-secondary" style={{ textDecoration: 'none' }}>
            Notify me on next mark
          </Link>
          <Link href="/watchlist" className="cta-secondary" style={{ textDecoration: 'none' }}>
            Add to ledger
          </Link>

          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px solid var(--rule-soft)',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              lineHeight: 1.8,
            }}
          >
            Reference · DXB-{listing.id.slice(0, 8).toUpperCase()}-{String(dossierNum).padStart(3, '0')}<br />
            All data indicative. Sourced from public listing sheets.
          </div>
        </aside>
      </div>
    </main>
  );
}
