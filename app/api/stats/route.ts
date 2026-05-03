import { NextResponse } from 'next/server';
import { getActiveDropsCount, getAvgDropPercent } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const [activeDrops, avgDrop] = await Promise.all([
      getActiveDropsCount(),
      getAvgDropPercent(),
    ]);

    // Derive top area by drop count
    const { data, error } = await supabase
      .from('listings')
      .select('area, price, peak_price')
      .eq('is_active', true)
      .not('price', 'is', null)
      .not('peak_price', 'is', null)
      .not('area', 'is', null);

    if (error) throw error;

    type Row = { area: string | null; price: number | null; peak_price: number | null };
    const dropped = ((data ?? []) as Row[]).filter(
      (r) => r.area && r.price !== null && r.peak_price !== null && r.peak_price > r.price,
    );

    const areaCount = new Map<string, number>();
    for (const r of dropped) {
      if (r.area) areaCount.set(r.area, (areaCount.get(r.area) ?? 0) + 1);
    }

    let topAreaByDrops = '—';
    let maxCount = 0;
    for (const [area, count] of areaCount.entries()) {
      if (count > maxCount) {
        maxCount = count;
        topAreaByDrops = area;
      }
    }

    return NextResponse.json({
      activeDrops,
      avgDropPercent: Math.round(avgDrop * 10) / 10,
      topAreaByDrops,
    });
  } catch (err) {
    console.error('[api/stats] error:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
