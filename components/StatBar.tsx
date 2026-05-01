'use client';

interface StatItem {
  label: string;
  value: string | number;
  highlight?: boolean;
}

interface StatBarProps {
  stats: StatItem[];
}

export function StatBar({ stats }: StatBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[#1F1F2E] bg-[#111118] px-4 py-3">
      {stats.map((stat, i) => (
        <div key={i} className="flex items-center gap-2">
          {i > 0 && <div className="h-4 w-px bg-[#1F1F2E]" />}
          <div className="flex flex-col">
            <span className="text-xs text-slate-500">{stat.label}</span>
            <span
              className={`tabular-nums text-sm font-semibold ${
                stat.highlight ? 'text-[#6366F1]' : 'text-slate-100'
              }`}
            >
              {stat.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
