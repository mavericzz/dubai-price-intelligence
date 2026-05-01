'use client';

interface YieldDisplayProps {
  grossYield: number | null;
}

function yieldColor(pct: number): string {
  if (pct > 6) return 'text-emerald-400';
  if (pct >= 4) return 'text-amber-400';
  return 'text-slate-400';
}

export function YieldDisplay({ grossYield }: YieldDisplayProps) {
  if (grossYield === null) {
    return <span className="text-slate-500 text-sm">—</span>;
  }

  return (
    <span className={`tabular-nums text-sm font-medium ${yieldColor(grossYield)}`}>
      {grossYield.toFixed(1)}%
    </span>
  );
}
