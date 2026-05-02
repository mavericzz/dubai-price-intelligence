/**
 * archive.ts — Daily Archival Job
 *
 * Schedule: Daily, 03:00 GST (UTC+4) → 23:00 UTC previous day
 * Cron expression: "0 23 * * *"
 *
 * What it does:
 *   Moves listings to archived_listings when:
 *   - listing_status = 'confirmed_sold'         (archive_reason = 'confirmed_sold')
 *   - listing_status = 'suspected_removed'
 *     AND removed_from_portal_at < NOW() - 7 days  (archive_reason = 'suspected_removed_stale')
 *
 * Both cases:
 *   1. INSERT INTO archived_listings (SELECT * FROM listings WHERE ...)
 *   2. DELETE FROM listings WHERE id = ANY(archived_ids)
 *
 * Required env vars:
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service-role key (bypasses RLS for bulk moves)
 */

import { supabase } from '../supabase';

export interface ArchiveJobResult {
  archivedSold: number;
  archivedSuspectedRemoved: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helper: move a batch of listings to archived_listings and delete originals
// ---------------------------------------------------------------------------

async function archiveBatch(
  ids: string[],
  archiveReason: string,
  errors: string[],
): Promise<number> {
  if (ids.length === 0) return 0;

  // Fetch full rows
  const { data: rows, error: fetchError } = await supabase
    .from('listings')
    .select('*')
    .in('id', ids);

  if (fetchError) {
    errors.push(`Fetch error (${archiveReason}): ${fetchError.message}`);
    return 0;
  }

  if (!rows || rows.length === 0) return 0;

  // Insert into archived_listings with archive metadata
  const archiveRows = rows.map((r) => ({
    ...r,
    archive_reason: archiveReason,
    archived_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase
    .from('archived_listings')
    .insert(archiveRows);

  if (insertError) {
    errors.push(`Insert archived_listings error (${archiveReason}): ${insertError.message}`);
    return 0;
  }

  // Delete from listings
  const { error: deleteError } = await supabase
    .from('listings')
    .delete()
    .in('id', ids);

  if (deleteError) {
    errors.push(`Delete listings error (${archiveReason}): ${deleteError.message}`);
    // Rows are now duplicated — log as error but count partial success
  }

  return rows.length;
}

// ---------------------------------------------------------------------------
// Main job entry point
// ---------------------------------------------------------------------------

export async function runArchiveJob(): Promise<ArchiveJobResult> {
  const result: ArchiveJobResult = { archivedSold: 0, archivedSuspectedRemoved: 0, errors: [] };
  const staleCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  console.log(`[archive] Running archive job. stale cutoff: ${staleCutoff}`);

  // 1. Find confirmed_sold listings
  const { data: soldData, error: soldError } = await supabase
    .from('listings')
    .select('id')
    .eq('listing_status', 'confirmed_sold');

  if (soldError) {
    result.errors.push(`Query confirmed_sold: ${soldError.message}`);
  } else {
    const soldIds = (soldData ?? []).map((r: { id: string }) => r.id);
    console.log(`[archive] Found ${soldIds.length} confirmed_sold listings`);
    result.archivedSold = await archiveBatch(soldIds, 'confirmed_sold', result.errors);
  }

  // 2. Find suspected_removed listings older than 7 days
  const { data: staleData, error: staleError } = await supabase
    .from('listings')
    .select('id')
    .eq('listing_status', 'suspected_removed')
    .lt('removed_from_portal_at', staleCutoff);

  if (staleError) {
    result.errors.push(`Query suspected_removed: ${staleError.message}`);
  } else {
    const staleIds = (staleData ?? []).map((r: { id: string }) => r.id);
    console.log(`[archive] Found ${staleIds.length} stale suspected_removed listings`);
    result.archivedSuspectedRemoved = await archiveBatch(
      staleIds,
      'suspected_removed_stale',
      result.errors,
    );
  }

  console.log(
    `[archive] Done. sold=${result.archivedSold} suspected_removed=${result.archivedSuspectedRemoved} errors=${result.errors.length}`,
  );
  return result;
}

// ---------------------------------------------------------------------------
// Standalone runner
// ---------------------------------------------------------------------------

if (require.main === module) {
  runArchiveJob()
    .then((r) => {
      console.log('[archive] Result:', r);
      if (r.errors.length > 0) process.exit(1);
    })
    .catch((err) => {
      console.error('[archive] Fatal:', err);
      process.exit(1);
    });
}
