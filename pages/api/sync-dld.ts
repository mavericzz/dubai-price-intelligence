import type { NextApiRequest, NextApiResponse } from 'next';
import { syncDLDTransactions } from '../../lib/dld';
import type { DLDSyncResult } from '../../types';

type ErrorResponse = { error: string };

/**
 * POST /api/sync-dld
 *
 * Triggers a DLD transaction sync for the last 48 hours (or custom window via
 * ?window_hours query param). Intended to be called by a cron job or manually
 * by an admin — protect behind a shared secret in production.
 *
 * Required env vars:
 *   DLD_CLIENT_ID, DLD_CLIENT_SECRET  — Dubai Pulse OAuth2 credentials
 *   SYNC_SECRET                        — Bearer token for this endpoint (optional but recommended)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DLDSyncResult | ErrorResponse>,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Optional: protect with a shared secret so only cron/admin can trigger.
  const syncSecret = process.env['SYNC_SECRET'];
  if (syncSecret) {
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token !== syncSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const windowHours = Number(req.query['window_hours'] ?? 48);
  if (!Number.isFinite(windowHours) || windowHours <= 0 || windowHours > 720) {
    res.status(400).json({ error: 'window_hours must be a positive number ≤ 720' });
    return;
  }

  try {
    const result = await syncDLDTransactions(windowHours);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-dld] error:', err);
    res.status(500).json({ error: message });
  }
}
