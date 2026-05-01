'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Dot,
} from 'recharts';
import type { PriceHistory } from '@/types';

interface ChartPoint {
  date: string;
  price: number;
  isDrop: boolean;
}

interface PriceHistoryChartProps {
  history: PriceHistory[];
  peakPrice: number | null;
}

function buildPoints(history: PriceHistory[]): ChartPoint[] {
  const sorted = [...history].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  return sorted.map((ph, i) => ({
    date: new Date(ph.recorded_at).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
    price: ph.price,
    isDrop: i > 0 && ph.price < sorted[i - 1].price,
  }));
}

function formatAed(value: number) {
  if (value >= 1_000_000) return `AED ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `AED ${(value / 1_000).toFixed(0)}K`;
  return `AED ${value.toLocaleString()}`;
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
}

function CustomDot({ cx, cy, payload }: CustomDotProps) {
  if (!payload?.isDrop) return null;
  return <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#09090E" strokeWidth={2} />;
}

export function PriceHistoryChart({ history, peakPrice }: PriceHistoryChartProps) {
  if (history.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-slate-500 text-sm">
        No price history available
      </div>
    );
  }

  const points = buildPoints(history);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={points} margin={{ top: 16, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F1F2E" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={{ stroke: '#1F1F2E' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatAed}
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={90}
        />
        <Tooltip
          contentStyle={{ background: '#111118', border: '1px solid #1F1F2E', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8', fontSize: 12 }}
          formatter={(value) => [formatAed(Number(value)), 'Price']}
        />
        {peakPrice !== null && (
          <ReferenceLine
            y={peakPrice}
            stroke="#6366F1"
            strokeDasharray="4 4"
            label={{ value: 'Peak', fill: '#6366F1', fontSize: 11, position: 'right' }}
          />
        )}
        <Line
          type="monotone"
          dataKey="price"
          stroke="#6366F1"
          strokeWidth={2}
          dot={<CustomDot />}
          activeDot={{ r: 4, fill: '#6366F1' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
