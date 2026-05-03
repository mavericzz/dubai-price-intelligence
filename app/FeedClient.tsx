'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ComputedListing } from '@/types';
import { Sparkline } from '@/components/Sparkline';
import { fmtAED, classifyCut } from '@/lib/almanac';

const FILTER_AREAS = [
  'All',
  'Downtown Dubai',
  'Dubai Marina',
  'Palm Jumeirah',
  'Business Bay',
  'Dubai Hills Estate',
  'Dubai Creek Harbour',
  'Emirates Hills',
];

const PAGE_SIZE = 20;

interface Stats {
  activeDrops: number;
  avgDropPercent: number;
  topAreaByDrops: string;
}

function todayUpper(): string {
  return new Date()
    .toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();
}

export default function FeedClient() {
  const router = useRouter();
  const [filter, setFilter] = useState('All');
  const [propertyType, setPropertyType] = useState('');
  const [minDrop, setMinDrop] = useState('');
  const [minDropInput, setMinDropInput] = useState('');

  const [listings, setListings] = useState<ComputedListing[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [today, setToday] = useState('');

  useEffect(() => setToday(todayUpper()), []);

  useEffect(() => {
    const t = setTimeout(() => setMinDrop(minDropInput), 500);
    return () => clearTimeout(t);
  }, [minDropInput]);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats(d))
      .catch(() => {});
  }, []);

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      const params = new URLSearchParams();
      if (propertyType) params.set('property_type', propertyType);
      if (filter !== 'All') params.set('area', filter);
      if (minDrop) params.set('min_drop_percent', minDrop);
      params.set('sort_field', 'drop_percent');
      params.set('sort_direction', 'desc');
      params.set('page', String(pageNum));
      params.set('limit', String(PAGE_SIZE));

      try {
        const res = await fetch(`/api/listings?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error('http');
        const data = await res.json();
        const fresh: ComputedListing[] = data.listings ?? [];
        setListings((prev) => (append ? [...prev, ...fresh] : fresh));
        setHasMore(fresh.length === PAGE_SIZE);
        setPage(pageNum);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error('[front-page] fetch:', e);
      } finally {
        setLoading(false);
      }
    },
    [filter, propertyType, minDrop],
  );

  useEffect(() => {
    fetchPage(1, false);
  }, [fetchPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loading) fetchPage(page + 1, true);
      },
      { rootMargin: '300px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, page, fetchPage]);

  const ledeProperty = useMemo(
    () => listings.find((l) => Math.abs(l.drop_percent ?? 0) >= 17) ?? listings[0] ?? null,
    [listings],
  );
  const todaysMarks = listings.slice(0, 5);

  const areaIndex = useMemo(() => {
    const map = new Map<string, { count: number; sum: number }>();
    listings.forEach((l) => {
      if (!l.area) return;
      const cur = map.get(l.area) ?? { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += l.drop_percent ?? 0;
      map.set(l.area, cur);
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, count: v.count, drop: v.sum / v.count }))
      .sort((a, b) => a.drop - b.drop)
      .slice(0, 6);
  }, [listings]);

  return (
    <div className="almanac-page">
      {/* FRONT PAGE */}
      <section className="front">
        <article className="lede">
          <div className="lede-eyebrow">Front Page · Capitulation Watch</div>
          <h2>
            The <em>quiet correction</em> on the {ledeProperty?.area ?? 'Marina'}
          </h2>
          <p className="lede-deck">
            {ledeProperty
              ? `${ledeProperty.title ?? ledeProperty.area ?? 'A property'} has been re-priced ${ledeProperty.drop_count} time${ledeProperty.drop_count === 1 ? '' : 's'} — bringing the headline cut to ${Math.abs(ledeProperty.drop_percent ?? 0).toFixed(1)} per cent below initial ask.`
              : 'A quiet, daily register of price corrections in Dubai property — filed before the noise of the market opens, read by those who prefer signal to alarm.'}
          </p>
          <div className="lede-byline">FILED · {today} · DXB CORRESPONDENT</div>

          <div className="lede-art">
            <div className="ph ph-cool"></div>
            <div className="gallery-cap">View toward the Marina · 06:42 GST</div>
          </div>
          <div className="lede-art-cap">
            {ledeProperty?.title ?? 'The Marina'}, photographed on the morning of the latest reduction.
          </div>
        </article>

        <div className="col-divider"></div>

        <div>
          <div className="col-section">
            <div className="col-head">Today&rsquo;s Marks</div>
            {todaysMarks.length === 0 && (
              <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', color: 'var(--ink-3)', padding: '12px 0' }}>
                No marks filed yet.
              </div>
            )}
            {todaysMarks.map((p) => (
              <div
                className="col-item"
                key={p.id}
                onClick={() => router.push(`/listing/${p.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="col-item-row">
                  <div className="col-item-title">{p.title ?? p.area}</div>
                  <div className="col-item-pct">{(p.drop_percent ?? 0).toFixed(1)}%</div>
                </div>
                <div className="col-item-meta">
                  {p.area} · {p.beds ?? '—'}br · cut №{p.drop_count}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-divider"></div>

        <div>
          <div className="col-section">
            <div className="col-head">Areas · index</div>
            {areaIndex.map((a) => (
              <div className="col-item" key={a.name}>
                <div className="col-item-row">
                  <div className="col-item-title" style={{ fontSize: 16 }}>
                    {a.name}
                  </div>
                  <div className="col-item-pct">{a.drop.toFixed(1)}%</div>
                </div>
                <div className="col-item-meta">{a.count} listings tracked</div>
              </div>
            ))}
          </div>
          <div className="col-section">
            <div className="col-head">Almanac</div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 12,
                letterSpacing: '0.04em',
                color: 'var(--ink-2)',
                lineHeight: 1.9,
                textTransform: 'uppercase',
              }}
            >
              Listings tracked · {stats ? stats.activeDrops.toLocaleString() : '—'}<br />
              Avg. cut · {stats ? `${stats.avgDropPercent.toFixed(1)}%` : '—'}<br />
              Top area · {stats?.topAreaByDrops ?? '—'}<br />
              Median cut watch · daily<br />
              Filed daily, save Fridays
            </div>
          </div>
        </div>
      </section>

      {/* SECTION HEAD */}
      <div className="section-bar">
        <h3>
          The <em>Register</em> of cuts
        </h3>
        <div className="section-bar-meta">
          {listings.length} entries · sorted by depth of cut<br />
          Filed {today.split(' ').slice(0, 4).join(' ')}
        </div>
      </div>

      {/* FILTERS */}
      <div className="filter-bar">
        <div className="filter-group">
          <span className="filter-label">Area</span>
          <div className="filter-options">
            {FILTER_AREAS.map((a) => (
              <button
                key={a}
                type="button"
                className={'filter-opt' + (filter === a ? ' active' : '')}
                onClick={() => setFilter(a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">Type</span>
          <select
            className="filter-select"
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
          >
            <option value="">Any</option>
            <option value="Apartment">Apartment</option>
            <option value="Villa">Villa</option>
            <option value="Townhouse">Townhouse</option>
            <option value="Penthouse">Penthouse</option>
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">Min cut %</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={minDropInput}
            onChange={(e) => setMinDropInput(e.target.value)}
            className="filter-input"
            min={0}
            max={100}
            step={1}
          />
        </div>
        <div className="filter-group">
          <span className="filter-label">Sort</span>
          <span className="filter-opt active">Depth of cut</span>
        </div>
      </div>

      {/* REGISTER */}
      <div className="register">
        <div className="register-head">
          <span>№</span>
          <span>Address</span>
          <span>Configuration</span>
          <span>Listed</span>
          <span>Movement</span>
          <span>Current ask</span>
          <span style={{ textAlign: 'right' }}>Cut</span>
        </div>

        {listings.map((p, i) => {
          const c = classifyCut(p.drop_percent, p.drop_count);
          const dropPct = (p.drop_percent ?? 0).toFixed(1);
          const peakPrice = p.peak_price ?? p.price ?? 0;
          const currentPrice = p.price ?? 0;
          const history = p.peak_price && p.price && p.peak_price !== p.price
            ? [p.peak_price, p.peak_price * 0.97, p.peak_price * 0.94, p.price]
            : [currentPrice, currentPrice];

          return (
            <div
              className="register-row"
              key={p.id}
              onClick={() => router.push(`/listing/${p.id}`)}
            >
              <div className="reg-num">{String(i + 1).padStart(2, '0')}.</div>
              <div>
                <div className="reg-name">{p.title ?? p.area ?? 'Untitled listing'}</div>
                <div className="reg-name-sub">
                  {[p.area, p.sub_area].filter(Boolean).join(', ') || '—'}
                </div>
                <span className={'classif ' + c.cls}>{c.label}</span>
              </div>
              <div className="reg-cell">
                <strong>{p.property_type ?? 'Property'}</strong>
                {p.beds !== null ? `, ${p.beds}br` : ''}
                <span className="reg-cell-sub">
                  {p.size_sqft ? `${p.size_sqft.toLocaleString()} sqft` : ''}
                  {p.size_sqft && p.baths ? ' · ' : ''}
                  {p.baths !== null ? `${p.baths} bath` : ''}
                </span>
              </div>
              <div className="reg-cell">
                <strong>{p.days_on_market ?? '—'} days</strong>
                <span className="reg-cell-sub">
                  {p.drop_count} reduction{p.drop_count === 1 ? '' : 's'}
                </span>
              </div>
              <div className="reg-spark">
                <Sparkline data={history} width={120} height={26} />
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'var(--ink-3)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Peak → Today
                </div>
              </div>
              <div>
                <div className="reg-price">{fmtAED(currentPrice)}</div>
                {peakPrice > currentPrice && (
                  <div className="reg-price-was">was {fmtAED(peakPrice)}</div>
                )}
              </div>
              <div>
                <div className="reg-drop">{dropPct}%</div>
                <div className="reg-drop-sub">{p.motivation_score} motivation</div>
              </div>
            </div>
          );
        })}

        {!loading && listings.length === 0 && (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              fontFamily: 'var(--display)',
              fontStyle: 'italic',
              color: 'var(--ink-3)',
              fontSize: 22,
            }}
          >
            — Nothing filed under these particulars —
          </div>
        )}
      </div>

      {loading && (
        <div
          style={{
            padding: '24px 0',
            textAlign: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.14em',
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
          }}
        >
          — Compiling further entries —
        </div>
      )}

      {!loading && hasMore && listings.length > 0 && (
        <div
          style={{
            padding: '24px 0',
            textAlign: 'center',
            fontFamily: 'var(--display)',
            fontStyle: 'italic',
            fontSize: 18,
            color: 'var(--ink-3)',
          }}
        >
          Continue to page two — further entries below →
        </div>
      )}

      <div ref={sentinelRef} className="h-1" aria-hidden="true" />
    </div>
  );
}
