/**
 * POST /api/admin/partners/:id/verify-cancel
 *
 * Cancel an active partner verification.
 * Clears is_verified, verified_at, and verified_until.
 * Keeps verified_by_user_id as audit reference.
 * Sets verification_cancelled_at and verification_cancelled_by_user_id.
 *
 * Auth:    requireSuperAdmin only
 * Returns: { item: AdminPartnerRow }
 *
 * Errors:
 *   400  id missing
 *   404  partner not found
 *   409  partner is not currently verified
 *   500  DB error
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PARTNER_DETAIL_SELECT,
  mapAdminPartnerDetail,
} from "~~/server/utils/admin-partners";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requireSuperAdmin(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  // ── Fetch current state ─────────────────────────────────────────────────
  const { data: existing, error: fetchError } = await adminClient
    .from("partner_profiles")
    .select("id, is_verified")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: fetchError.message });
  }
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: "Partner profile not found",
    });
  }

  // ── Guard: must be currently verified ──────────────────────────────────
  if (!existing.is_verified) {
    throw createError({
      statusCode: 409,
      statusMessage: "Partner is not currently verified",
    });
  }

  // ── Cancel verification ─────────────────────────────────────────────────
  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await adminClient
    .from("partner_profiles")
    .update({
      is_verified: false,
      verified_at: null,
      verified_until: null,
      // verified_by_user_id intentionally kept for audit
      verification_cancelled_at: now,
      verification_cancelled_by_user_id: userId,
    })
    .eq("id", id)
    .select(ADMIN_PARTNER_DETAIL_SELECT)
    .single();

  if (updateError || !updated) {
    throw createError({
      statusCode: 500,
      statusMessage: updateError?.message ?? "Failed to cancel verification",
    });
  }

  return {
    item: mapAdminPartnerDetail(updated as Record<string, unknown>),
  };
});
