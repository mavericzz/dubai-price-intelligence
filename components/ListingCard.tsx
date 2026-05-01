'use client';

import Image from 'next/image';
import type { ComputedListing } from '@/types';
import { DropBadge } from './DropBadge';
import { MotivationBadge } from './MotivationBadge';
import { PriceDisplay } from './PriceDisplay';

interface ListingCardProps {
  listing: ComputedListing;
  onClick?: () => void;
}

export function ListingCard({ listing, onClick }: ListingCardProps) {
  const bedsLabel = listing.beds !== null ? `${listing.beds}BR` : null;
  const bathsLabel = listing.baths !== null ? `${listing.baths}BA` : null;
  const specs = [bedsLabel, bathsLabel].filter(Boolean).join(' · ');

  return (
    <article
      className="flex flex-col overflow-hidden rounded-xl border border-[#1F1F2E] bg-[#111118] cursor-pointer transition-colors hover:border-[#6366F1]/40"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[16/9] w-full bg-[#09090E]">
        {listing.image_url ? (
          <Image
            src={listing.image_url}
            alt={listing.title ?? 'Listing image'}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 50vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-700">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10" aria-hidden="true">
              <path d="M3 9.5L12 3l9 6.5V21H3V9.5z" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* Badges */}
        <div className="flex items-center gap-1.5">
          <DropBadge dropPercent={listing.drop_percent} />
          <MotivationBadge motivation={listing.motivation_score} />
        </div>

        {/* Title */}
        {listing.title && (
          <p className="line-clamp-2 text-sm font-medium text-slate-100">{listing.title}</p>
        )}

        {/* Price */}
        <PriceDisplay price={listing.price} className="text-base" />

        {/* Meta */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {listing.area && <span>{listing.area}</span>}
          {specs && (
            <>
              <span>·</span>
              <span>{specs}</span>
            </>
          )}
          {listing.size_sqft && (
            <>
              <span>·</span>
              <span>{listing.size_sqft.toLocaleString()} sqft</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
