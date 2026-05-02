/**
 * status-api.ts
 *
 * Logic for the scraper-facing status-update endpoint and the admin restore endpoint.
 *
 * PATCH /listings/{id}/status  → updateListingStatus()
 * POST  /listings/{id}/restore → restoreListing()
 *
 * These functions are framework-agnostic; wire them into Next.js API routes or
 * Supabase Edge Functions as needed.
 */

import { supabase } from './supabase';
import type { Listing, ListingStatus, StatusUpdatePayload, RestoreResult } from '../types';

// ---------------------------------------------------------------------------
// PATCH /listings/{id}/status
// Called by the scraper to report 404s, last-seen timestamps, and status changes.
// ---------------------------------------------------------------------------

export async function updateListingStatus(
  id: string,
  payload: StatusUpdatePayload,
): Promise<Listing> {
  if (Object.keys(payload).length === 0) {
    throw new Error('updateListingStatus: payload must contain at least one field');
  }

  const update: Record<string, unknown> = {};

  if (payload.listing_status !== undefined) update.listing_status = payload.listing_status;
  if (payload.consecutive_404_count !== undefined) update.consecutive_404_count = payload.consecutive_404_count;
  if (payload.last_seen_at !== undefined) update.last_seen_at = payload.last_seen_at;
  if (payload.removed_from_portal_at !== undefined) update.removed_from_portal_at = payload.removed_from_portal_at;

  // Auto-populate removed_from_portal_at when transitioning to suspected_removed
  if (
    payload.listing_status === 'suspected_removed' &&
    payload.removed_from_portal_at === undefined
  ) {
    update.removed_from_portal_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('listings')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Listing;
}

// ---------------------------------------------------------------------------
// POST /listings/{id}/restore
// Admin: moves a listing from archived_listings back to active status.
// ---------------------------------------------------------------------------

export async function restoreListing(
  id: string,
  performedBy?: string,
): Promise<RestoreResult> {
  // 1. Fetch from archived_listings
  const { data: archived, error: fetchError } = await supabase
    .from('archived_listings')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!archived) throw new Error(`No archived listing found with id ${id}`);

  const oldStatus = archived.listing_status as ListingStatus;

  // 2. Re-insert into listings with status reset to 'active'
  const restored = {
    ...archived,
    listing_status: 'active' as ListingStatus,
    removed_from_portal_at: null,
    sold_detected_at: null,
    consecutive_404_count: 0,
    // archive_reason and archived_at are not columns on listings — strip them
    archive_reason: undefined,
    archived_at: undefined,
  };
  // Remove archive-only fields before inserting into listings
  delete restored.archive_reason;
  delete restored.archived_at;

  const { data: insertedData, error: insertError } = await supabase
    .from('listings')
    .upsert(restored, { onConflict: 'id' })
    .select()
    .single();

  if (insertError) throw insertError;
  const listing = insertedData as Listing;

  // 3. Remove from archived_listings
  const { error: deleteError } = await supabase
    .from('archived_listings')
    .delete()
    .eq('id', id);

  if (deleteError) throw deleteError;

  // 4. Write audit log entry
  const { data: auditData, error: auditError } = await supabase
    .from('listing_audit_log')
    .insert({
      listing_id: id,
      action: 'restore',
      old_status: oldStatus,
      new_status: 'active',
      performed_by: performedBy ?? null,
      metadata: {
        archive_reason: archived.archive_reason ?? null,
        archived_at: archived.archived_at ?? null,
      },
    })
    .select('id')
    .single();

  if (auditError) throw auditError;

  return { listing, auditLogId: auditData.id as string };
}
