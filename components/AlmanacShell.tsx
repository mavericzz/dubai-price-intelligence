'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV = [
  { href: '/', label: 'Front Page' },
  { href: '/map', label: 'Yield Atlas' },
  { href: '/watchlist', label: 'The Ledger' },
  { href: '/off-plan', label: 'Off-Plan' },
];

interface MarketSnapshot {
  totalListings: number;
  avgDropPercent: number;
}

function todayStr(): string {
  return new Date()
    .toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();
}

function fmtAED(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
}

interface TickerItem {
  sym: string;
  area: string;
  pct: number;
  price: number;
}

function TickerTape({ items }: { items: TickerItem[] }) {
  const all = items.length > 0 ? [...items, ...items] : [];
  if (all.length === 0) return null;
  return (
    <div className="ticker-tape" aria-hidden="true">
      <div className="ticker-track">
        {all.map((it, i) => (
          <span className="ticker-item" key={i}>
            <span style={{ fontWeight: 500 }}>{it.sym}</span>
            <span className="ticker-sep">·</span>
            <span>{it.area}</span>
            <span className="ticker-sep">·</span>
            <span>AED {fmtAED(it.price)}</span>
            <span className={it.pct < 0 ? 'neg' : 'pos'}>{it.pct.toFixed(1)}%</span>
            <span className="ticker-sep" style={{ margin: '0 8px' }}>◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function AlmanacShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const [today, setToday] = useState('');
  const [stats, setStats] = useState<MarketSnapshot | null>(null);
  const [ticker, setTicker] = useState<TickerItem[]>([]);

  useEffect(() => {
    setToday(todayStr());
  }, []);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setStats({
            totalListings: d.activeDrops ?? 0,
            avgDropPercent: d.avgDropPercent ?? 0,
          });
        }
      })
      .catch(() => {});

    fetch('/api/listings?sort_field=drop_percent&sort_direction=desc&limit=10&page=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const items: TickerItem[] = (d?.listings ?? [])
          .filter((l: { price: number | null; area: string | null }) => l.price && l.area)
          .map((l: {
            title: string | null;
            area: string;
            drop_percent: number | null;
            price: number;
          }) => ({
            sym: (l.title ?? l.area)
              .split(/\s+/)
              .map((w) => w[0])
              .join('')
              .slice(0, 4)
              .toUpperCase(),
            area: l.area,
            pct: l.drop_percent ?? 0,
            price: l.price,
          }))
          .slice(0, 10);
        setTicker(items);
      })
      .catch(() => {});
  }, []);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <>
      <header className="masthead">
        <div className="masthead-top">
          <span>
            <span className="dot-live"></span> Live · Market Open
          </span>
          <span>{today}</span>
          <span>Edition № {Math.floor(Date.now() / 86_400_000) % 999} · Volume IV</span>
        </div>
        <Link href="/" className="masthead-title" style={{ display: 'block' }}>
          <h1>
            The DXB <em>Almanac</em>
          </h1>
          <div className="masthead-tag">— A register of price corrections in Dubai property —</div>
        </Link>
        <div className="masthead-rule">
          <span>Established MMXXVI</span>
          <span>{stats ? `${stats.totalListings.toLocaleString()} listings under watch` : 'Listings under watch'}</span>
          <span>{stats ? `Median cut · ${stats.avgDropPercent.toFixed(1)}%` : 'Filed daily'}</span>
          <span>Filed daily, save Fridays</span>
        </div>
      </header>

      <TickerTape items={ticker} />

      <nav className="almanac-nav">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={isActive(n.href) ? 'active' : ''}>
            {n.label}
          </Link>
        ))}
        <Link href="/watchlist">Subscribe</Link>
      </nav>

      {children}

      <footer className="colophon">
        <div className="colophon-mark">
          <em>The</em> DXB <em>Almanac</em>
        </div>
        <div>
          <div style={{ marginBottom: 8, color: 'var(--ink-2)' }}>Editorial</div>
          Founded MMXXVI<br />
          Filed from Dubai<br />
          Independent, unsponsored
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ marginBottom: 8, color: 'var(--ink-2)' }}>Notice</div>
          All data indicative<br />
          Sourced from public sheets<br />
          Not a brokerage
        </div>
      </footer>
    </>
  );
}
