import type {
  Listing,
  PriceHistory,
  DLDTransaction,
  DLDRental,
  ComputedListing,
  MotivationLabel,
} from '../types';

// 1
export function calcDropAmountAed(
  currentPrice: number | null,
  peakPrice: number | null,
): number | null {
  if (currentPrice === null || peakPrice === null) return null;
  return peakPrice - currentPrice;
}

// 2
export function calcDropPercent(
  currentPrice: number | null,
  peakPrice: number | null,
): number | null {
  if (currentPrice === null || peakPrice === null || peakPrice === 0) return null;
  return ((peakPrice - currentPrice) / peakPrice) * 100;
}

// 3
export function calcDropCount(priceHistory: PriceHistory[]): number {
  if (priceHistory.length < 2) return 0;
  const sorted = [...priceHistory].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  let count = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].price < sorted[i - 1].price) count++;
  }
  return count;
}

// 4 — drops per day since the first observed price drop
export function calcDropVelocity(priceHistory: PriceHistory[]): number | null {
  if (priceHistory.length < 2) return null;
  const sorted = [...priceHistory].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  let firstDropIndex = -1;
  let dropCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].price < sorted[i - 1].price) {
      if (firstDropIndex === -1) firstDropIndex = i;
      dropCount++;
    }
  }

  if (firstDropIndex === -1) return null;

  const firstDropMs = new Date(sorted[firstDropIndex].recorded_at).getTime();
  const lastMs = new Date(sorted[sorted.length - 1].recorded_at).getTime();
  const daysSinceFirstDrop = (lastMs - firstDropMs) / (1000 * 60 * 60 * 24);

  // Can't compute a meaningful rate with zero elapsed time
  if (daysSinceFirstDrop === 0) return null;

  return dropCount / daysSinceFirstDrop;
}

// 5
export function calcMotivationScore(
  dropPercent: number | null,
  dropCount: number,
  dropVelocity: number | null,
  daysOnMarket: number | null,
): MotivationLabel {
  if (
    (dropPercent !== null && dropPercent > 15) ||
    (dropVelocity !== null && dropVelocity > 0.5) ||
    (daysOnMarket !== null && daysOnMarket > 180)
  ) {
    return 'HIGH';
  }

  if (
    (dropPercent === null || dropPercent < 5) &&
    (daysOnMarket === null || daysOnMarket < 30)
  ) {
    return 'LOW';
  }

  return 'MEDIUM';
}

// 6 — (area avg annual rent / price) * 100
export function calcEstimatedGrossYield(
  price: number | null,
  areaAvgRent: number | null,
): number | null {
  if (price === null || price === 0 || areaAvgRent === null) return null;
  return (areaAvgRent / price) * 100;
}

// 7
export function calcAreaAvgPsf(dldTransactions: DLDTransaction[]): number | null {
  const psfs = dldTransactions
    .map(t => {
      if (t.price_per_sqft !== null) return t.price_per_sqft;
      if (t.price !== null && t.size_sqft !== null && t.size_sqft > 0) {
        return t.price / t.size_sqft;
      }
      return null;
    })
    .filter((v): v is number => v !== null);

  if (psfs.length === 0) return null;
  return psfs.reduce((sum, v) => sum + v, 0) / psfs.length;
}

// 8
export function calcListingPsf(
  price: number | null,
  sizeSqft: number | null,
): number | null {
  if (price === null || sizeSqft === null || sizeSqft === 0) return null;
  return price / sizeSqft;
}

// 9
export function calcPsfVsAreaAvg(
  listingPsf: number | null,
  areaAvgPsf: number | null,
): number | null {
  if (listingPsf === null || areaAvgPsf === null || areaAvgPsf === 0) return null;
  return ((listingPsf - areaAvgPsf) / areaAvgPsf) * 100;
}

// Internal helper used by computeListingFields
export function calcAreaAvgRent(dldRentals: DLDRental[]): number | null {
  const rents = dldRentals
    .map(r => r.annual_rent)
    .filter((v): v is number => v !== null);
  if (rents.length === 0) return null;
  return rents.reduce((sum, v) => sum + v, 0) / rents.length;
}

// 10
export function computeListingFields(
  listing: Listing,
  priceHistory: PriceHistory[],
  dldTransactions: DLDTransaction[],
  dldRentals: DLDRental[],
): ComputedListing {
  const dropAmountAed = calcDropAmountAed(listing.price, listing.peak_price);
  const dropPercent = calcDropPercent(listing.price, listing.peak_price);
  const dropCount = calcDropCount(priceHistory);
  const dropVelocity = calcDropVelocity(priceHistory);
  const motivationScore = calcMotivationScore(
    dropPercent,
    dropCount,
    dropVelocity,
    listing.days_on_market,
  );
  const areaAvgRent = calcAreaAvgRent(dldRentals);
  const estimatedGrossYield = calcEstimatedGrossYield(listing.price, areaAvgRent);
  const areaAvgPsf = calcAreaAvgPsf(dldTransactions);
  const listingPsf = calcListingPsf(listing.price, listing.size_sqft);
  const psfVsAreaAvg = calcPsfVsAreaAvg(listingPsf, areaAvgPsf);

  return {
    ...listing,
    drop_amount_aed: dropAmountAed,
    drop_percent: dropPercent,
    drop_count: dropCount,
    drop_velocity: dropVelocity,
    motivation_score: motivationScore,
    estimated_gross_yield: estimatedGrossYield,
    area_avg_psf: areaAvgPsf,
    listing_psf: listingPsf,
    psf_vs_area_avg: psfVsAreaAvg,
  };
}

// Namespace export
export const calculations = {
  calcDropAmountAed,
  calcDropPercent,
  calcDropCount,
  calcDropVelocity,
  calcMotivationScore,
  calcEstimatedGrossYield,
  calcAreaAvgPsf,
  calcAreaAvgRent,
  calcListingPsf,
  calcPsfVsAreaAvg,
  computeListingFields,
};
