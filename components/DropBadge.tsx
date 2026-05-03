'use client';

interface DropBadgeProps {
  dropPercent: number | null;
}

export function DropBadge({ dropPercent }: DropBadgeProps) {
  if (dropPercent === null || dropPercent <= 0) return null;

  return (
    <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white tabular-nums">
      -{dropPercent.toFixed(1)}%
    </span>
  );
}
