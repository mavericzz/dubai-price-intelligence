'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ComputedListing } from '@/types';
import { ListingCard } from '@/components/ListingCard';
import { ListingTableRow } from '@/components/ListingTableRow';
import { StatBar } from '@/components/StatBar';
import type { Currency } from '@/components/PriceDisplay';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DUBAI_AREAS = [
  'Dubai Marina',
  'Downtown Dubai',
  'Business Bay',
  'Jumeirah Lake Towers',
  'Palm Jumeirah',
  'Dubai Hills Estate',
  'Jumeirah Village Circle',
  'Arabian Ranches',
  'Dubai Creek Harbour',
  'DIFC',
  'Al Barsha',
  'Mirdif',
  'Deira',
  'Bur Dubai',
  'Dubai Sports City',
  'Dubai South',
  'The Springs',
  'Emirates Hills',
] as const;

interface SortOption {
  label: string;
  field: string;
  direction: 'asc' | 'desc';
}

const SORT_OPTIONS: SortOption[] = [
  { label: 'Drop % (High → Low)', field: 'drop_percent', direction: 'desc' },
  { label: 'Price (Low → High)', field: 'price', direction: 'asc' },
  { label: 'Price (High → Low)', field: 'price', direction: 'desc' },
  { label: 'Days on Market', field: 'days_on_market', direction: 'desc' },
  { label: 'Yield (High → Low)', field: 'yield', direction: 'desc' },
];

const CURRENCIES: Currency[] = ['AED', 'USD', 'EUR'];
const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Stats {
  activeDrops: number;
  avgDropPercent: number;
  topAreaByDrops: string;
}

// ---------------------------------------------------------------------------
// Shared select / input styles
// ---------------------------------------------------------------------------

const selectCls =
  'rounded-lg border border-[#1F1F2E] bg-[#111118] px-3 py-2 text-sm text-slate-200 ' +
  'focus:outline-none focus:ring-1 focus:ring-[#6366F1] focus:border-[#6366F1] transition-colors';

const inputCls =
  'w-28 rounded-lg border border-[#1F1F2E] bg-[#111118] px-3 py-2 text-sm text-slate-200 ' +
  'placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#6366F1] ' +
  'focus:border-[#6366F1] transition-colors [appearance:textfield] ' +
  '[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function FeedClient() {
  const router = useRouter();

  // --- Filter state ---
  const [propertyType, setPropertyType] = useState('');
  const [area, setArea] = useState('');
  const [beds, setBeds] = useState('');
  const [minDropInput, setMinDropInput] = useState('');
  const [minYieldInput, setMinYieldInput] = useState('');
  const [minDrop, setMinDrop] = useState(''); // debounced
  const [minYield, setMinYield] = useState(''); // debounced
  const [motivation, setMotivation] = useState('');
  const [sortIndex, setSortIndex] = useState(0);
  const [currency, setCurrency] = useState<Currency>('AED');

  // --- Data state ---
  const [listings, setListings] = useState<ComputedListing[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ---------------------------------------------------------------------------
  // Debounce number inputs
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const t = setTimeout(() => setMinDrop(minDropInput), 500);
    return () => clearTimeout(t);
  }, [minDropInput]);

  useEffect(() => {
    const t = setTimeout(() => setMinYield(minYieldInput), 500);
    return () => clearTimeout(t);
  }, [minYieldInput]);

  // ---------------------------------------------------------------------------
  // Stats (once on mount)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d: Stats) => setStats(d))
      .catch(() => {});
  }, []);

  // ---------------------------------------------------------------------------
  // Core fetch function
  // ---------------------------------------------------------------------------

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);

      const sort = SORT_OPTIONS[sortIndex];
      const params = new URLSearchParams();
      if (propertyType) params.set('property_type', propertyType);
      if (area) params.set('area', area);
      if (beds !== '') params.set('beds', beds);
      if (minDrop) params.set('min_drop_percent', minDrop);
      if (minYield) params.set('min_yield', minYield);
      if (motivation) params.set('motivation', motivation);
      params.set('sort_field', sort.field);
      params.set('sort_direction', sort.direction);
      params.set('page', String(pageNum));
      params.set('limit', String(PAGE_SIZE));

      try {
        const res = await fetch(`/api/listings?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const newListings: ComputedListing[] = data.listings ?? [];

        setListings((prev) => (append ? [...prev, ...newListings] : newListings));
        setHasMore(newListings.length === PAGE_SIZE);
        setCurrentPage(pageNum);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.error('[feed] fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [propertyType, area, beds, minDrop, minYield, motivation, sortIndex],
  );

  // ---------------------------------------------------------------------------
  // Reset + fetch when filters / sort change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    fetchPage(1, false);
  }, [fetchPage]);

  // ---------------------------------------------------------------------------
  // Infinite scroll
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isLoading) {
          fetchPage(currentPage + 1, true);
        }
      },
      { rootMargin: '200px', threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, currentPage, fetchPage]);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const statItems = stats
    ? [
        { label: 'Active Drops', value: stats.activeDrops.toLocaleString(), highlight: true },
        { label: 'Avg Drop %', value: `${stats.avgDropPercent.toFixed(1)}%` },
        { label: 'Top Area by Drops', value: stats.topAreaByDrops },
      ]
    : [
        { label: 'Active Drops', value: '—' },
        { label: 'Avg Drop %', value: '—' },
        { label: 'Top Area by Drops', value: '—' },
      ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#09090E]">
      {/* ------------------------------------------------------------------ */}
      {/* Sticky filter bar                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="sticky top-[53px] z-20 border-b border-[#1F1F2E] bg-[#09090E]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex flex-wrap items-end gap-2">
            {/* Property type */}
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className={selectCls}
              aria-label="Property type"
            >
              <option value="">All Types</option>
              <option value="Apartment">Apartment</option>
              <option value="Villa">Villa</option>
              <option value="Townhouse">Townhouse</option>
              <option value="Penthouse">Penthouse</option>
            </select>

            {/* Area */}
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className={selectCls}
              aria-label="Area"
            >
              <option value="">All Areas</option>
              {DUBAI_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            {/* Beds */}
            <select
              value={beds}
              onChange={(e) => setBeds(e.target.value)}
              className={selectCls}
              aria-label="Bedrooms"
            >
              <option value="">Any Beds</option>
              <option value="0">Studio</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5+</option>
            </select>

            {/* Min drop % */}
            <input
              type="number"
              placeholder="Min Drop %"
              value={minDropInput}
              onChange={(e) => setMinDropInput(e.target.value)}
              min={0}
              max={100}
              step={1}
              className={inputCls}
              aria-label="Minimum drop percent"
            />

            {/* Min yield % */}
            <input
              type="number"
              placeholder="Min Yield %"
              value={minYieldInput}
              onChange={(e) => setMinYieldInput(e.target.value)}
              min={0}
              max={30}
              step={0.1}
              className={inputCls}
              aria-label="Minimum yield percent"
            />

            {/* Motivation */}
            <select
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              className={selectCls}
              aria-label="Motivation"
            >
              <option value="">All Motivation</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>

            {/* Sort by */}
            <select
              value={sortIndex}
              onChange={(e) => setSortIndex(Number(e.target.value))}
              className={selectCls}
              aria-label="Sort by"
            >
              {SORT_OPTIONS.map((opt, i) => (
                <option key={i} value={i}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Currency toggle */}
            <div
              className="flex overflow-hidden rounded-lg border border-[#1F1F2E]"
              role="group"
              aria-label="Currency"
            >
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    currency === c
                      ? 'bg-[#6366F1] text-white'
                      : 'bg-[#111118] text-slate-400 hover:text-slate-200'
                  }`}
                  aria-pressed={currency === c}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Main content                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        {/* StatBar */}
        <StatBar stats={statItems} />

        {/* ---------------------------------------------------------------- */}
        {/* Desktop table (md+)                                               */}
        {/* ---------------------------------------------------------------- */}
        <div className="hidden md:block">
          <div className="overflow-x-auto rounded-xl border border-[#1F1F2E]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#1F1F2E] bg-[#111118]">
                  {[
                    'Property',
                    'Price',
                    'Drop %',
                    'Motivation',
                    'Yield',
                    'Beds / Bath',
                    'Size',
                    'Days on Mkt',
                  ].map((col) => (
                    <th
                      key={col}
                      className={`py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                        col === 'Property' ? 'pl-4 pr-3' : col === 'Days on Mkt' ? 'px-3 pr-4' : 'px-3'
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-[#09090E]">
                {listings.map((listing) => (
                  <ListingTableRow
                    key={listing.id}
                    listing={listing}
                    currency={currency}
                    onClick={() => router.push(`/listing/${listing.id}`)}
                  />
                ))}
              </tbody>
            </table>

            {/* Empty state inside table wrapper */}
            {!isLoading && listings.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-1 py-20 text-center">
                <p className="text-slate-400">No listings match your filters</p>
                <p className="text-sm text-slate-600">Try broadening your search criteria</p>
              </div>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Mobile card grid (<md)                                            */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              currency={currency}
              onClick={() => router.push(`/listing/${listing.id}`)}
            />
          ))}

          {/* Empty state */}
          {!isLoading && listings.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center gap-1 py-20 text-center">
              <p className="text-slate-400">No listings match your filters</p>
              <p className="text-sm text-slate-600">Try broadening your search criteria</p>
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Loading spinner                                                   */}
        {/* ---------------------------------------------------------------- */}
        {isLoading && (
          <div className="flex justify-center py-8" aria-label="Loading listings">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1F1F2E] border-t-[#6366F1]" />
          </div>
        )}

        {/* End-of-list message */}
        {!hasMore && listings.length > 0 && (
          <p className="py-4 text-center text-xs text-slate-600">
            {listings.length} listing{listings.length !== 1 ? 's' : ''} shown
          </p>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />
      </div>
    </div>
  );
}
