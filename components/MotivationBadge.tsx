'use client';

import type { MotivationLabel } from '@/types';

interface MotivationBadgeProps {
  motivation: MotivationLabel;
}

const STYLES: Record<MotivationLabel, string> = {
  HIGH: 'bg-red-600 text-white',
  MEDIUM: 'bg-amber-500 text-black',
  LOW: 'bg-teal-600 text-white',
};

export function MotivationBadge({ motivation }: MotivationBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[motivation]}`}
    >
      {motivation}
    </span>
  );
}
