'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getOffPlanListings } from '@/lib/queries';
import { PriceDisplay, DropBadge, MotivationBadge, ContactAgentButton } from '@/components';
import type { OffPlanListing, ListingSortField, SortDirection } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

const PROPERTY_TYPES = ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio'] as const;
const BED_OPTIONS = [null, 0, 1, 2, 3, 4] as const; // null = any, 0 = studio, 4 = 4+

type SortOption = { label: string; field: ListingSortField; direction: SortDirection };
const SORT_OPTIONS: SortOption[] = [
  { label: 'Biggest Drop', field: 'drop_percent', direction: 'desc' },
  { label: 'Highest Price', field: 'price', direction: 'desc' },
  { label: 'Lowest Price', field: 'price', direction: 'asc' },
  { label: 'Days on Market', field: 'days_on_market', direction: 'desc' },
  { label: 'Motivation', field: 'motivation_score', direction: 'desc' },
];

interface Filters {
  area?: string;
  property_type?: string;
  beds?: number;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OffPlanFeedProps {
  initialAreas: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OffPlanFeed({ initialAreas }: OffPlanFeedProps) {
  const [listings, setListings] = useState<OffPlanListing[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sortIdx, setSortIdx] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Stable fetch function — only changes when needed
  const doFetch = useCallback(
    async (
      p: number,
      f: Filters,
      sIdx: number,
      append: boolean,
    ) => {
      setLoading(true);
      try {
        const sort = SORT_OPTIONS[sIdx];
        const data = await getOffPlanListings(
          f,
          { field: sort.field, direction: sort.direction },
          { page: p, limit: PAGE_SIZE },
        );
        setListings((prev) => (append ? [...prev, ...data] : data));
        setHasMore(data.length === PAGE_SIZE);
      } catch (err) {
        console.error('off-plan fetch error', err);
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    },
    [],
  );

  // Initial load + filter/sort change: reset to page 1
  useEffect(() => {
    setPage(1);
    doFetch(1, filters, sortIdx, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sortIdx]);

  // Append when page increments beyond 1
  useEffect(() => {
    if (page <= 1) return;
    doFetch(page, filters, sortIdx, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && hasMore) {
          setPage((p) => p + 1);
        }
      },
      { rootMargin: '300px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, hasMore]);

  // Filter helpers
  function setFilter<K extends keyof Filters>(key: K, value: Filters[K] | undefined) {
    setFilters((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '') {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }

  const selectClass =
    'rounded-lg border border-[#1F1F2E] bg-[#09090E] px-3 py-1.5 text-sm text-slate-200 focus:border-[#6366F1] focus:outline-none cursor-pointer';

  return (
    <div className="space-y-4">
      {/* ── Filter bar ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#1F1F2E] bg-[#111118] p-4">
        {/* Area */}
        <select
          value={filters.area ?? ''}
          onChange={(e) => setFilter('area', e.target.value || undefined)}
          className={selectClass}
          aria-label="Filter by area"
        >
          <option value="">All Areas</option>
          {initialAreas.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {/* Property type */}
        <select
          value={filters.property_type ?? ''}
          onChange={(e) => setFilter('property_type', e.target.value || undefined)}
          className={selectClass}
          aria-label="Filter by property type"
        >
          <option value="">All Types</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Beds */}
        <div className="flex items-center gap-1" role="group" aria-label="Filter by bedrooms">
          {BED_OPTIONS.map((b) => {
            const label = b === null ? 'Any' : b === 0 ? 'Studio' : b === 4 ? '4+' : `${b}BR`;
            const active = b === null ? filters.beds === undefined : filters.beds === (b === 4 ? 4 : b);
            return (
              <button
                key={String(b)}
                onClick={() => setFilter('beds', b === null ? undefined : b === 4 ? 4 : b)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? 'bg-[#6366F1] text-white'
                    : 'border border-[#1F1F2E] bg-[#09090E] text-slate-400 hover:border-[#6366F1]/50 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="off-plan-sort">Sort</label>
          <select
            id="off-plan-sort"
            value={sortIdx}
            onChange={(e) => setSortIdx(Number(e.target.value))}
            className={selectClass}
          >
            {SORT_OPTIONS.map((o, i) => (
              <option key={i} value={i}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Results count / skeleton ────────────────────────────────── */}
      {!initialLoad && (
        <p className="text-xs text-slate-500">
          {listings.length === 0 ? 'No listings found' : `${listings.length} listing${listings.length !== 1 ? 's' : ''}${hasMore ? '+' : ''}`}
        </p>
      )}

      {initialLoad && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-[#111118]" />
          ))}
        </div>
      )}

      {/* ── Desktop table ───────────────────────────────────────────── */}
      {!initialLoad && listings.length > 0 && (
        <div className="hidden overflow-x-auto rounded-xl border border-[#1F1F2E] lg:block">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-[#1F1F2E] text-left">
                <th className="w-14 py-3 pl-4 pr-2 font-medium text-slate-500"></th>
                <th className="min-w-[160px] px-3 py-3 font-medium text-slate-500">Title / Area</th>
                <th className="min-w-[110px] px-3 py-3 font-medium text-slate-500">Developer</th>
                <th className="px-3 py-3 font-medium text-slate-500">Price</th>
                <th className="px-3 py-3 font-medium text-slate-500">Launch Price</th>
                <th className="px-3 py-3 font-medium text-slate-500">Drop Since Launch</th>
                <th className="min-w-[130px] px-3 py-3 font-medium text-slate-500">Payment Plan</th>
                <th className="px-3 py-3 font-medium text-slate-500">Completion</th>
                <th className="px-3 py-3 font-medium text-slate-500">Motivation</th>
                <th className="px-3 py-3 pr-4 font-medium text-slate-500">Contact</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <OffPlanTableRow key={listing.id} listing={listing} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Mobile cards ────────────────────────────────────────────── */}
      {!initialLoad && listings.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
          {listings.map((listing) => (
            <Link key={listing.id} href={`/listing/${listing.id}`}>
              <OffPlanCard listing={listing} />
            </Link>
          ))}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────── */}
      {!initialLoad && !loading && listings.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[#1F1F2E] bg-[#111118] py-16 text-center">
          <BuildingIcon />
          <p className="text-slate-400">No off-plan listings match your filters</p>
          <button
            onClick={() => { setFilters({}); setSortIdx(0); }}
            className="text-sm text-[#6366F1] hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* ── Load more spinner ───────────────────────────────────────── */}
      {loading && !initialLoad && (
        <div className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#6366F1] border-t-transparent" />
        </div>
      )}

      {/* ── Infinite scroll sentinel ────────────────────────────────── */}
      <div ref={sentinelRef} className="h-1" aria-hidden="true" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop table row
// ---------------------------------------------------------------------------

function OffPlanTableRow({ listing }: { listing: OffPlanListing }) {
  const completionLabel = listing.completion_date
    ? new Date(listing.completion_date).toLocaleDateString('en-GB', {
        month: 'short',
        year: 'numeric',
      })
    : '—';

  return (
    <tr className="border-b border-[#1F1F2E] transition-colors hover:bg-[#111118]/60">
      {/* Thumbnail */}
      <td className="w-14 py-3 pl-4 pr-2">
        <Link href={`/listing/${listing.id}`}>
          <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded bg-[#09090E]">
            {listing.image_url ? (
              <Image
                src={listing.image_url}
                alt=""
                fill
                className="object-cover"
                sizes="56px"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-700">
                <SmallHomeIcon />
              </div>
            )}
          </div>
        </Link>
      </td>

      {/* Title / Area */}
      <td className="px-3 py-3">
        <Link href={`/listing/${listing.id}`} className="flex flex-col gap-0.5">
          <span className="line-clamp-1 font-medium text-slate-100 hover:text-[#6366F1] transition-colors">
            {listing.title ?? '—'}
          </span>
          <span className="text-xs text-slate-500">{listing.area ?? '—'}</span>
        </Link>
      </td>

      {/* Developer */}
      <td className="px-3 py-3 text-slate-300">
        {listing.developer ?? '—'}
      </td>

      {/* Current price */}
      <td className="px-3 py-3">
        <PriceDisplay price={listing.price} />
      </td>

      {/* Launch price */}
      <td className="px-3 py-3">
        <PriceDisplay price={listing.launch_price} />
      </td>

      {/* Drop since launch */}
      <td className="px-3 py-3">
        <DropSinceLaunchBadge value={listing.drop_since_launch} />
      </td>

      {/* Payment plan */}
      <td className="max-w-[140px] px-3 py-3">
        <span className="line-clamp-1 text-slate-400" title={listing.payment_plan ?? undefined}>
          {listing.payment_plan ?? '—'}
        </span>
      </td>

      {/* Completion */}
      <td className="px-3 py-3 tabular-nums text-slate-400">
        {completionLabel}
      </td>

      {/* Motivation */}
      <td className="px-3 py-3">
        <MotivationBadge motivation={listing.motivation_score} />
      </td>

      {/* Contact */}
      <td className="px-3 py-3 pr-4">
        <ContactAgentButton
          listingTitle={listing.title}
          listingUrl={listing.listing_url}
          className="px-2 py-1 text-xs"
        />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function OffPlanCard({ listing }: { listing: OffPlanListing }) {
  const completionLabel = listing.completion_date
    ? new Date(listing.completion_date).toLocaleDateString('en-GB', {
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-[#1F1F2E] bg-[#111118] transition-colors hover:border-[#6366F1]/40">
      {/* Thumbnail */}
      <div className="relative aspect-[16/9] w-full bg-[#09090E]">
        {listing.image_url ? (
          <Image
            src={listing.image_url}
            alt={listing.title ?? ''}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 50vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-700">
            <LargeHomeIcon />
          </div>
        )}
        {/* Off-plan badge overlaid on image */}
        <span className="absolute left-2 top-2 inline-flex items-center rounded-full bg-indigo-900/80 px-2 py-0.5 text-xs font-medium text-indigo-300 backdrop-blur-sm">
          Off-Plan
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <DropBadge dropPercent={listing.drop_percent} />
          <MotivationBadge motivation={listing.motivation_score} />
        </div>

        {/* Developer */}
        {listing.developer && (
          <p className="text-xs font-medium text-[#6366F1]">{listing.developer}</p>
        )}

        {/* Title */}
        {listing.title && (
          <p className="line-clamp-2 text-sm font-medium text-slate-100">{listing.title}</p>
        )}

        {/* Pricing row */}
        <div className="flex flex-wrap items-baseline gap-2">
          <PriceDisplay price={listing.price} className="text-base" />
          {listing.launch_price !== null && (
            <span className="text-xs text-slate-500">
              from AED {listing.launch_price.toLocaleString()}
              {listing.drop_since_launch !== null && listing.drop_since_launch > 0 && (
                <span className="ml-1 text-red-400">
                  (-{listing.drop_since_launch.toFixed(1)}%)
                </span>
              )}
            </span>
          )}
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
          {listing.area && <span>{listing.area}</span>}
          {listing.beds !== null && (
            <>
              <span>·</span>
              <span>{listing.beds === 0 ? 'Studio' : `${listing.beds}BR`}</span>
            </>
          )}
          {listing.size_sqft && (
            <>
              <span>·</span>
              <span>{listing.size_sqft.toLocaleString()} sqft</span>
            </>
          )}
        </div>

        {/* Off-plan details */}
        <div className="space-y-1 rounded-lg border border-[#1F1F2E] bg-[#09090E] p-2 text-xs">
          {listing.payment_plan && (
            <div className="flex gap-1">
              <span className="shrink-0 text-slate-500">Plan:</span>
              <span className="line-clamp-1 text-slate-300">{listing.payment_plan}</span>
            </div>
          )}
          {completionLabel && (
            <div className="flex gap-1">
              <span className="shrink-0 text-slate-500">Completion:</span>
              <span className="text-slate-300">{completionLabel}</span>
            </div>
          )}
        </div>

        {/* Contact */}
        <div className="pt-1">
          <ContactAgentButton
            listingTitle={listing.title}
            listingUrl={listing.listing_url}
            className="w-full justify-center px-3 py-1.5 text-xs"
          />
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Drop since launch badge
// ---------------------------------------------------------------------------

function DropSinceLaunchBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-500">—</span>;

  if (value > 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-600/20 px-2 py-0.5 text-xs font-medium tabular-nums text-red-400">
        -{value.toFixed(1)}%
      </span>
    );
  }

  if (value < 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-600/20 px-2 py-0.5 text-xs font-medium tabular-nums text-emerald-400">
        +{Math.abs(value).toFixed(1)}%
      </span>
    );
  }

  return <span className="text-xs text-slate-500">0%</span>;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function SmallHomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M3 9.5L12 3l9 6.5V21H3V9.5z" />
    </svg>
  );
}

function LargeHomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10" aria-hidden="true">
      <path d="M3 9.5L12 3l9 6.5V21H3V9.5z" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-10 w-10 text-slate-700" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
    </svg>
  );
}
