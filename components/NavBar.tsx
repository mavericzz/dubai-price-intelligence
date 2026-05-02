'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Feed' },
  { href: '/map', label: 'Map' },
  { href: '/off-plan', label: 'Off-Plan' },
  { href: '/watchlist', label: 'Watchlist' },
];

function NavBarInner() {
  const pathname = usePathname() ?? '/';

  return (
    <div className="flex items-center gap-1">
      {NAV_LINKS.map(({ href, label }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-[#1F1F2E] text-slate-100'
                : 'text-slate-400 hover:bg-[#111118] hover:text-slate-200'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

export function NavBar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-[#1F1F2E] bg-[#09090E]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-100 hover:text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#6366F1] text-xs font-bold text-white">D</span>
          <span className="hidden sm:inline">Dubai Price Intelligence</span>
        </Link>
        <NavBarInner />
      </div>
    </nav>
  );
}
