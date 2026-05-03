#!/usr/bin/env ts-node
/* Run: npx ts-node lib/seed.ts [--force]
   Env: SUPABASE_URL, SUPABASE_SERVICE_KEY */

import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';
import * as crypto from 'crypto';

// ─── Env check ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env['SUPABASE_URL'];
const SUPABASE_SERVICE_KEY = process.env['SUPABASE_SERVICE_KEY'];

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Area data ────────────────────────────────────────────────────────────────

const AREAS = [
  'Dubai Marina', 'JBR', 'Downtown Dubai', 'Business Bay', 'JLT',
  'Palm Jumeirah', 'Arabian Ranches', 'Dubai Hills Estate', 'Dubai Creek Harbour',
  'MBR City', 'Jumeirah Village Circle', 'Al Barsha', 'DIFC', 'City Walk',
  'Bluewaters Island', 'Dubai Sports City', 'Motor City', 'International City',
] as const;

const PSF_RANGE: Record<string, [number, number]> = {
  'Dubai Marina':            [1400, 2200],
  'JBR':                     [1500, 2500],
  'Downtown Dubai':          [1800, 3000],
  'Business Bay':            [1200, 2000],
  'JLT':                     [900,  1600],
  'Palm Jumeirah':           [2500, 5000],
  'Arabian Ranches':         [800,  1400],
  'Dubai Hills Estate':      [1200, 2000],
  'Dubai Creek Harbour':     [1300, 2000],
  'MBR City':                [1400, 2200],
  'Jumeirah Village Circle': [800,  1400],
  'Al Barsha':               [700,  1200],
  'DIFC':                    [1600, 2800],
  'City Walk':               [1800, 2800],
  'Bluewaters Island':       [2200, 3500],
  'Dubai Sports City':       [700,  1200],
  'Motor City':              [600,  1000],
  'International City':      [300,   700],
};

const COORDS: Record<string, [number, number]> = {
  'Dubai Marina':            [25.080400, 55.140400],
  'JBR':                     [25.076600, 55.132900],
  'Downtown Dubai':          [25.197200, 55.274400],
  'Business Bay':            [25.186600, 55.259600],
  'JLT':                     [25.067000, 55.149800],
  'Palm Jumeirah':           [25.112400, 55.139000],
  'Arabian Ranches':         [25.055900, 55.273600],
  'Dubai Hills Estate':      [25.103400, 55.237500],
  'Dubai Creek Harbour':     [25.212000, 55.326600],
  'MBR City':                [25.163200, 55.311400],
  'Jumeirah Village Circle': [25.058600, 55.210500],
  'Al Barsha':               [25.106400, 55.200900],
  'DIFC':                    [25.213600, 55.282200],
  'City Walk':               [25.212500, 55.260100],
  'Bluewaters Island':       [25.084500, 55.123900],
  'Dubai Sports City':       [25.039700, 55.225600],
  'Motor City':              [25.042800, 55.233200],
  'International City':      [25.165000, 55.418100],
};

// ─── Lookup tables ────────────────────────────────────────────────────────────

interface BedsSpec { beds: number; sizeRange: [number, number]; priceRange: [number, number] }

const BEDS_SPEC: BedsSpec[] = [
  { beds: 0, sizeRange: [350,  600],  priceRange: [400_000,    1_500_000] },
  { beds: 1, sizeRange: [600,  1000], priceRange: [600_000,    3_000_000] },
  { beds: 2, sizeRange: [900,  1500], priceRange: [900_000,    5_000_000] },
  { beds: 3, sizeRange: [1400, 2200], priceRange: [1_500_000,  8_000_000] },
  { beds: 4, sizeRange: [2000, 4000], priceRange: [3_000_000, 15_000_000] },
];

const RENTAL_RANGE: Record<number, [number, number]> = {
  0: [28_000,   75_000],
  1: [45_000,  140_000],
  2: [65_000,  200_000],
  3: [100_000, 350_000],
  4: [150_000, 600_000],
};

const VILLA_AREAS  = new Set(['Arabian Ranches', 'Motor City', 'Dubai Hills Estate', 'Palm Jumeirah', 'MBR City']);
const PENT_AREAS   = new Set(['Downtown Dubai', 'DIFC', 'City Walk', 'Bluewaters Island', 'Palm Jumeirah']);

const DEVELOPERS    = ['Emaar', 'DAMAC', 'Meraas', 'Nakheel', 'Dubai Properties', 'Sobha Realty', 'Binghatti'];
const PAYMENT_PLANS = ['40/60', '50/50', '60/40', '20/80', '30/70'];
const AGENT_NAMES   = [
  'Ahmed Al Mansoori', 'Sara Khalid', 'Rami Jaber', 'Priya Nair', 'John Smith',
  'Fatima Hassan', 'Omar Shaikh', 'Elena Petrova', 'Rajesh Kumar', 'Layla Al Fahim',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rand  = (min: number, max: number) => Math.random() * (max - min) + min;
const rInt  = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick  = <T>(arr: readonly T[] | T[]) => arr[Math.floor(Math.random() * arr.length)];
const r6    = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
const r2    = (n: number) => Math.round(n * 100) / 100;
const kAed  = (n: number) => Math.round(n / 1_000) * 1_000;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function futureDate(monthsAhead: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + Math.round(monthsAhead));
  return isoDate(d);
}

function propType(area: string, beds: number): string {
  if (VILLA_AREAS.has(area) && beds >= 2) {
    const r = Math.random();
    if (area === 'Palm Jumeirah' && r < 0.12) return 'penthouse';
    if (r < 0.45) return 'villa';
    if (r < 0.65) return 'townhouse';
    return 'apartment';
  }
  if (PENT_AREAS.has(area) && beds >= 3 && Math.random() < 0.12) return 'penthouse';
  return 'apartment';
}

// ─── Row generators ───────────────────────────────────────────────────────────

function genListing(index: number) {
  const area = AREAS[index % AREAS.length];
  const spec = BEDS_SPEC[rInt(0, BEDS_SPEC.length - 1)];
  const [psfMin, psfMax] = PSF_RANGE[area];
  const size  = Math.round(rand(...spec.sizeRange));
  let   price = kAed(rand(psfMin, psfMax) * size);
  price = Math.max(spec.priceRange[0], Math.min(spec.priceRange[1], price));
  const peakPrice = kAed(price * rand(1.05, 1.30));

  const dom = rInt(7, 365);
  const createdAt = daysAgo(dom);

  const isOffPlan = Math.random() < 0.20;
  const beds = spec.beds;
  const baths = beds === 0 ? 1 : beds;
  const [baseLat, baseLng] = COORDS[area];

  return {
    external_id:     `SEED-${String(index).padStart(4, '0')}-${crypto.randomUUID().slice(0, 8)}`,
    title:           `${beds === 0 ? 'Studio' : `${beds} BR`} ${propType(area, beds)} in ${area}`,
    area,
    sub_area:        null as string | null,
    property_type:   propType(area, beds),
    beds,
    baths,
    size_sqft:       size,
    price,
    peak_price:      peakPrice,
    listing_url:     `https://www.bayut.com/property/details-seed-${index + 1000}.html`,
    image_url:       null as string | null,
    agent_name:      pick(AGENT_NAMES),
    agent_phone:     `+9715${rInt(0, 9)}${rInt(1_000_000, 9_999_999)}`,
    lat:             r6(baseLat + rand(-0.008, 0.008)),
    lng:             r6(baseLng + rand(-0.008, 0.008)),
    is_off_plan:     isOffPlan,
    developer:       isOffPlan ? pick(DEVELOPERS) : null as string | null,
    payment_plan:    isOffPlan ? pick(PAYMENT_PLANS) : null as string | null,
    completion_date: isOffPlan ? futureDate(rand(6, 36)) : null as string | null,
    is_active:       Math.random() < 0.85,
    motivation_score: null as number | null,
    created_at:      createdAt.toISOString(),
    updated_at:      createdAt.toISOString(),
  };
}

function genPriceHistory(listingId: string, price: number, peakPrice: number, dom: number) {
  const n = rInt(3, 8);
  const maxBack = Math.max(n + 1, Math.min(dom - 1, 365));
  const rows = [];

  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1); // 0 = oldest/peak, 1 = newest/current
    const daysBack = Math.max(1, Math.round((1 - t) * maxBack));

    let p: number;
    if (i === 0)     { p = peakPrice; }
    else if (i === n - 1) { p = price; }
    else {
      const base = peakPrice - t * (peakPrice - price);
      p = kAed(base * rand(0.97, 1.03));
      p = Math.max(price, Math.min(peakPrice, p));
    }

    rows.push({
      listing_id:  listingId,
      price:       p,
      recorded_at: daysAgo(daysBack).toISOString(),
    });
  }

  return rows;
}

function genDldTransaction(index: number) {
  const area = AREAS[index % AREAS.length];
  const spec  = BEDS_SPEC[rInt(0, 3)];
  const [psfMin, psfMax] = PSF_RANGE[area];
  const psf  = Math.round(rand(psfMin, psfMax));
  const size = Math.round(rand(...spec.sizeRange));

  return {
    area,
    sub_area:         null as string | null,
    property_type:    propType(area, spec.beds),
    beds:             spec.beds,
    size_sqft:        size,
    price:            kAed(psf * size),
    price_per_sqft:   psf,
    transaction_date: isoDate(daysAgo(rInt(1, 730))),
    is_off_plan:      Math.random() < 0.30,
  };
}

function genDldRental(index: number) {
  const area  = AREAS[index % AREAS.length];
  const spec  = BEDS_SPEC[rInt(0, 3)];
  const size  = Math.round(rand(...spec.sizeRange));
  const [rentMin, rentMax] = RENTAL_RANGE[spec.beds];

  // Scale by area premium: Palm Jumeirah ~2× International City
  const [psfMin, psfMax] = PSF_RANGE[area];
  const premiumFactor = Math.sqrt((psfMin + psfMax) / 2 / 1400);
  const rent = kAed(Math.min(rentMax * 1.5, Math.max(rentMin, rand(rentMin, rentMax) * premiumFactor)));

  return {
    area,
    sub_area:       null as string | null,
    property_type:  propType(area, spec.beds),
    beds:           spec.beds,
    size_sqft:      size,
    annual_rent:    rent,
    rent_per_sqft:  r2(rent / size),
    lease_date:     isoDate(daysAgo(rInt(1, 365))),
  };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function batchInsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  batchSize = 100,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const { data, error } = await db
      .from(table)
      .insert(rows.slice(i, i + batchSize))
      .select();
    if (error) throw new Error(`Insert ${table} batch ${i}: ${error.message}`);
    results.push(...(data as T[]));
  }
  return results;
}

async function clearAll() {
  // Dependents before parents (FK constraints)
  const tables = ['alert_log', 'price_history', 'listings', 'dld_transactions', 'dld_rentals'];
  for (const table of tables) {
    const { error } = await db.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`Clear ${table}: ${error.message}`);
    console.log(`  cleared ${table}`);
  }
}

function askConfirm(q: string): Promise<boolean> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, ans => { rl.close(); resolve(ans.trim().toLowerCase() === 'y'); });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const force = process.argv.includes('--force');

  if (!force) {
    const ok = await askConfirm('Clear all existing data and re-seed? [y/N] ');
    if (!ok) { console.log('Aborted.'); process.exit(0); }
  }

  console.log('\nClearing existing data...');
  await clearAll();

  console.log('\nSeeding 200 listings...');
  const listingRows = Array.from({ length: 200 }, (_, i) => genListing(i));
  const listings = await batchInsert('listings', listingRows) as unknown as Array<{
    id: string; price: number; peak_price: number; days_on_market: number | null;
  }>;
  console.log(`  ✓ ${listings.length} listings`);

  console.log('Seeding price history...');
  const historyRows = listings.flatMap(l =>
    genPriceHistory(l.id, l.price, l.peak_price, l.days_on_market ?? 30),
  );
  await batchInsert('price_history', historyRows, 200);
  console.log(`  ✓ ${historyRows.length} price history entries (avg ${(historyRows.length / listings.length).toFixed(1)} per listing)`);

  console.log('Seeding 500 DLD transactions...');
  await batchInsert('dld_transactions', Array.from({ length: 500 }, (_, i) => genDldTransaction(i)));
  console.log('  ✓ 500 DLD transactions');

  console.log('Seeding 300 DLD rentals...');
  await batchInsert('dld_rentals', Array.from({ length: 300 }, (_, i) => genDldRental(i)));
  console.log('  ✓ 300 DLD rentals');

  console.log('\nSeed complete.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('\nSeed failed:', err);
  process.exit(1);
});
