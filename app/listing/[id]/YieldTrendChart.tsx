'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface YieldPoint {
  month: string;
  yield: number;
}

interface YieldTrendChartProps {
  data: YieldPoint[];
}

export function YieldTrendChart({ data }: YieldTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-slate-500 text-sm">
        No yield trend data available
      </div>
    );
  }

  const formatted = data.map((d) => ({
    month: new Date(d.month + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
    yield: parseFloat(d.yield.toFixed(2)),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={formatted} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F1F2E" />
        <XAxis
          dataKey="month"
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={{ stroke: '#1F1F2E' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          contentStyle={{ background: '#111118', border: '1px solid #1F1F2E', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8', fontSize: 12 }}
          formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Gross Yield']}
        />
        <Line
          type="monotone"
          dataKey="yield"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#10b981' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
