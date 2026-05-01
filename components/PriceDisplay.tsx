'use client';

type Currency = 'AED' | 'USD' | 'EUR';

interface PriceDisplayProps {
  price: number | null;
  currency?: Currency;
  className?: string;
}

const SYMBOLS: Record<Currency, string> = {
  AED: 'AED',
  USD: '$',
  EUR: '€',
};

const EXCHANGE_RATES: Record<Currency, number> = {
  AED: 1,
  USD: 0.272,
  EUR: 0.251,
};

export function PriceDisplay({ price, currency = 'AED', className = '' }: PriceDisplayProps) {
  if (price === null) {
    return <span className="text-slate-500">—</span>;
  }

  const converted = Math.round(price * EXCHANGE_RATES[currency]);
  const formatted = converted.toLocaleString('en-US');
  const symbol = SYMBOLS[currency];

  return (
    <span className={`tabular-nums font-semibold text-slate-100 ${className}`}>
      {symbol === 'AED' ? `AED ${formatted}` : `${symbol}${formatted}`}
    </span>
  );
}
