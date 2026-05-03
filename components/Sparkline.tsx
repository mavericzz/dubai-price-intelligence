'use client';

interface Props {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ data, width = 120, height = 26, color = 'var(--red)' }: Props) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 2) - 1] as const);
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg
      style={{ width: '100%', height, display: 'block' }}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <path d={path} fill="none" stroke={color} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={1.8} fill={color} />
    </svg>
  );
}
