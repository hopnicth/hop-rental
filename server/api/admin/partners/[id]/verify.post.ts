/**
 * POST /api/admin/partners/:id/verify
 *
 * Verify a partner for a 1-year cycle.
 * Rejected if partner is currently active (is_verified=true AND verified_until > now).
 *
 * Auth:    requireSuperAdmin only
 * Returns: { item: AdminPartnerRow }
 *
 * Errors:
 *   400  id missing
 *   404  partner not found
 *   409  partner is already actively verified
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
    .select("id, is_verified, verified_until")
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

  // ── Guard: reject if already actively verified ──────────────────────────
  if (existing.is_verified && existing.verified_until) {
    const untilMs = new Date(existing.verified_until).getTime();
    if (!isNaN(untilMs) && untilMs > Date.now()) {
      throw createError({
        statusCode: 409,
        statusMessage: "Partner is already actively verified",
      });
    }
  }

  // ── Build 1-year window ─────────────────────────────────────────────────
  const now = new Date();
  const verifiedUntil = new Date(now);
  verifiedUntil.setFullYear(verifiedUntil.getFullYear() + 1);

  // ── Apply verification ──────────────────────────────────────────────────
  const { data: updated, error: updateError } = await adminClient
    .from("partner_profiles")
    .update({
      is_verified: true,
      verified_at: now.toISOString(),
      verified_until: verifiedUntil.toISOString(),
      verified_by_user_id: userId,
      verification_cancelled_at: null,
      verification_cancelled_by_user_id: null,
    })
    .eq("id", id)
    .select(ADMIN_PARTNER_DETAIL_SELECT)
    .single();

  if (updateError || !updated) {
    throw createError({
      statusCode: 500,
      statusMessage: updateError?.message ?? "Failed to verify partner",
    });
  }

  return {
    item: mapAdminPartnerDetail(updated as Record<string, unknown>),
  };
});
