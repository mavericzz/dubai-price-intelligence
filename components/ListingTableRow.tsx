'use client';

import type { ComputedListing } from '@/types';
import { DropBadge } from './DropBadge';
import { MotivationBadge } from './MotivationBadge';
import { YieldDisplay } from './YieldDisplay';
import { PriceDisplay } from './PriceDisplay';

interface ListingTableRowProps {
  listing: ComputedListing;
  onClick?: () => void;
}

export function ListingTableRow({ listing, onClick }: ListingTableRowProps) {
  const bedsLabel = listing.beds !== null ? `${listing.beds}` : '—';
  const bathsLabel = listing.baths !== null ? `${listing.baths}` : '—';

  return (
    <tr
      className="border-b border-[#1F1F2E] hover:bg-[#111118]/60 cursor-pointer transition-colors"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {/* Title + area */}
      <td className="py-3 pl-4 pr-3">
        <div className="flex flex-col gap-0.5">
          <span className="line-clamp-1 text-sm font-medium text-slate-100">
            {listing.title ?? '—'}
          </span>
          <span className="text-xs text-slate-500">{listing.area ?? '—'}</span>
        </div>
      </td>

      {/* Price */}
      <td className="px-3 py-3">
        <PriceDisplay price={listing.price} />
      </td>

      {/* Drop */}
      <td className="px-3 py-3">
        <DropBadge dropPercent={listing.drop_percent} />
      </td>

      {/* Motivation */}
      <td className="px-3 py-3">
        <MotivationBadge motivation={listing.motivation_score} />
      </td>

      {/* Yield */}
      <td className="px-3 py-3">
        <YieldDisplay grossYield={listing.estimated_gross_yield} />
      </td>

      {/* Beds / Baths */}
      <td className="px-3 py-3 tabular-nums text-sm text-slate-300">
        {bedsLabel} / {bathsLabel}
      </td>

      {/* Size */}
      <td className="px-3 py-3 tabular-nums text-sm text-slate-400">
        {listing.size_sqft !== null ? `${listing.size_sqft.toLocaleString()} sqft` : '—'}
      </td>

      {/* Days on market */}
      <td className="px-3 py-3 pr-4 tabular-nums text-sm text-slate-400">
        {listing.days_on_market !== null ? `${listing.days_on_market}d` : '—'}
      </td>
    </tr>
  );
}
