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
    date: new Date(ph.recorded_at)
      .toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
      .replace(' ', " '"),
    price: ph.price,
    isDrop: i > 0 && ph.price < sorted[i - 1].price,
  }));
}

function formatAed(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toLocaleString();
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
}

function CustomDot({ cx, cy, payload }: CustomDotProps) {
  if (!payload?.isDrop) return null;
  return <circle cx={cx} cy={cy} r={5} fill="var(--paper)" stroke="var(--red)" strokeWidth={1.5} />;
}

export function PriceHistoryChart({ history, peakPrice }: PriceHistoryChartProps) {
  if (history.length === 0) {
    return (
      <div
        style={{
          height: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--display)',
          fontStyle: 'italic',
          color: 'var(--ink-3)',
        }}
      >
        No price history filed.
      </div>
    );
  }

  const points = buildPoints(history);

  return (
    <div className="chart-frame">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: '1px solid var(--rule-soft)',
        }}
      >
        <div>
          <div className="eyebrow">Figure 1 · Asking-price progression</div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 18, marginTop: 4 }}>
            {points[0].date} — {points[points.length - 1].date}
          </div>
        </div>
        <div
          style={{
            textAlign: 'right',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--ink-3)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          n = {points.length} marks
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={points} margin={{ top: 16, right: 24, left: 16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="1 3" stroke="var(--rule-soft)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--ink-3)', fontSize: 10, fontFamily: 'var(--mono)' }}
            axisLine={{ stroke: 'var(--rule-soft)' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatAed}
            tick={{ fill: 'var(--ink-3)', fontSize: 10, fontFamily: 'var(--mono)' }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--paper)',
              border: '1px solid var(--rule)',
              borderRadius: 0,
              fontFamily: 'var(--mono)',
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--ink-3)', fontSize: 11 }}
            formatter={(value) => [`AED ${formatAed(Number(value))}`, 'Asking']}
          />
          {peakPrice !== null && (
            <ReferenceLine
              y={peakPrice}
              stroke="var(--ink-3)"
              strokeDasharray="2 4"
              label={{ value: 'Peak', fill: 'var(--ink-3)', fontSize: 10, position: 'right' }}
            />
          )}
          <Line
            type="monotone"
            dataKey="price"
            stroke="var(--red)"
            strokeWidth={1.5}
            dot={<CustomDot />}
            activeDot={{ r: 4, fill: 'var(--red)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
