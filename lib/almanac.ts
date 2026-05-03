export function fmtAED(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
}

export function fmtFull(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return 'AED ' + n.toLocaleString('en-AE');
}

export function classifyCut(dropPercent: number | null, dropCount: number) {
  const dp = Math.abs(dropPercent ?? 0);
  if (dp >= 17) return { label: 'Capitulation', cls: 'severe' as const };
  if (dropCount >= 4) return { label: 'Repeat Cuts', cls: 'steady' as const };
  if (dropCount === 0) return { label: 'First Mark', cls: 'mild' as const };
  return { label: 'First Mark', cls: 'mild' as const };
}

export function patternFor(area: string | null | undefined): string {
  if (!area) return 'warm';
  const map: Record<string, string> = {
    'Dubai Marina': 'cool',
    'Palm Jumeirah': 'sand',
    'Downtown Dubai': 'warm',
    'Business Bay': 'olive',
    'Dubai Hills Estate': 'olive',
    'Bluewaters': 'cool',
    'Emirates Hills': 'olive',
    'Dubai Creek Harbour': 'cool',
    'City Walk': 'warm',
    'DIFC': 'cool',
    'Jumeirah Village Circle': 'rose',
  };
  return map[area] ?? 'warm';
}
