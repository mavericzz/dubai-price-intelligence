import type { NextApiRequest, NextApiResponse } from 'next';
import { getLeads } from '../../lib/leads';
import type { LeadsResponse, LeadFilters, LeadSort } from '../../types';

type ErrorResponse = { error: string };

const VALID_SORTS: LeadSort[] = ['lead_score_desc', 'drop_pct_desc', 'newest'];

function parsePositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * GET /api/leads
 *
 * Returns active listings that match lead-discovery criteria.
 *
 * Query params:
 *   min_drop_pct    number   default 5
 *   max_price_aed   number   default 2000000
 *   area            string   comma-separated, default all
 *   property_type   string   default all
 *   min_score       number   default 0
 *   beds            number   default any
 *   sort            enum     lead_score_desc | drop_pct_desc | newest  default lead_score_desc
 *   page            number   default 1
 *   limit           number   default 20  (max 100)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LeadsResponse | ErrorResponse>,
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const q = req.query;

  // Parse sort
  const sortRaw = String(q['sort'] ?? 'lead_score_desc');
  if (!VALID_SORTS.includes(sortRaw as LeadSort)) {
    res.status(400).json({
      error: `sort must be one of: ${VALID_SORTS.join(', ')}`,
    });
    return;
  }
  const sort = sortRaw as LeadSort;

  // Parse pagination
  const page = parsePositiveInt(q['page'], 1);
  const limit = Math.min(parsePositiveInt(q['limit'], 20), 100);

  // Parse filters
  const areaRaw = q['area'];
  const areas =
    typeof areaRaw === 'string' && areaRaw.trim().length > 0
      ? areaRaw.split(',').map((a) => a.trim()).filter(Boolean)
      : undefined;

  const bedsRaw = q['beds'];
  const beds =
    bedsRaw !== undefined && bedsRaw !== ''
      ? parsePositiveInt(bedsRaw, NaN)
      : undefined;

  if (beds !== undefined && !Number.isFinite(beds)) {
    res.status(400).json({ error: 'beds must be a positive integer' });
    return;
  }

  const filters: LeadFilters = {
    min_drop_pct: parsePositiveNumber(q['min_drop_pct'], 5),
    max_price_aed: parsePositiveNumber(q['max_price_aed'], 2_000_000),
    min_score: parsePositiveNumber(q['min_score'], 0),
    property_type: typeof q['property_type'] === 'string' ? q['property_type'] : undefined,
    area: areas,
    beds,
  };

  try {
    const result = await getLeads(filters, sort, { page, limit });
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[leads] error:', err);
    res.status(500).json({ error: message });
  }
}
