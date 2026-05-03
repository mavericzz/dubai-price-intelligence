import { NextRequest, NextResponse } from 'next/server';
import { getListings } from '@/lib/queries';
import type { ListingFilters, ListingSortField, SortDirection, MotivationLabel } from '@/types';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const filters: ListingFilters = { is_active: true };

  const area = searchParams.get('area');
  if (area) filters.area = area;

  const property_type = searchParams.get('property_type');
  if (property_type) filters.property_type = property_type;

  const bedsParam = searchParams.get('beds');
  if (bedsParam !== null && bedsParam !== '') {
    const n = parseInt(bedsParam, 10);
    if (!isNaN(n)) filters.beds = n;
  }

  const minDrop = searchParams.get('min_drop_percent');
  if (minDrop) {
    const n = parseFloat(minDrop);
    if (!isNaN(n) && n > 0) filters.min_drop_percent = n;
  }

  const minYield = searchParams.get('min_yield');
  if (minYield) {
    const n = parseFloat(minYield);
    if (!isNaN(n) && n > 0) filters.min_yield = n;
  }

  const motivation = searchParams.get('motivation');
  if (motivation && ['HIGH', 'MEDIUM', 'LOW'].includes(motivation)) {
    filters.motivation = motivation as MotivationLabel;
  }

  const sortField = (searchParams.get('sort_field') ?? 'drop_percent') as ListingSortField;
  const sortDirection = (searchParams.get('sort_direction') ?? 'desc') as SortDirection;

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));

  try {
    const listings = await getListings(
      filters,
      { field: sortField, direction: sortDirection },
      { page, limit },
    );
    return NextResponse.json({ listings });
  } catch (err) {
    console.error('[api/listings] error:', err);
    return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 });
  }
}
