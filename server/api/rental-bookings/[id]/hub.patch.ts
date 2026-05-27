import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getMixedCheckoutUserId } from "~~/server/utils/mixed-checkout";

/**
 * PATCH /api/rental-bookings/:id/hub
 *
 * Body: { branchId: string }
 *
 * Updates hub_id / hub_name on a draft rental booking only after confirming
 * that the requested branch is both active AND publicly visible to customers.
 * Rejects archived, non-public, or non-existent branch ids with 422.
 * Rejects bookings that do not belong to the authenticated user with 404.
 */
export default defineEventHandler(async (event) => {
  // ── 1. Authentication ────────────────────────────────────────────────────────
  const authUser = await serverSupabaseUser(event);
  const userId = getMixedCheckoutUserId(authUser);
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });
  }

  // ── 2. Route parameter ───────────────────────────────────────────────────────
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "Booking id is required" });
  }

  // ── 3. Request body ──────────────────────────────────────────────────────────
  const body = await readBody(event);
  const branchId =
    typeof body?.branchId === "string" ? body.branchId.trim() : "";
  if (!branchId) {
    throw createError({ statusCode: 400, statusMessage: "branchId is required" });
  }

  const adminClient = serverSupabaseServiceRole(event);

  // ── 4. Validate branch: must be active AND public ────────────────────────────
  const { data: branch, error: branchError } = await adminClient
    .from("store_branches")
    .select("id, name_th, name_en, is_active, is_public")
    .eq("id", branchId)
    .eq("is_active", true)
    .eq("is_public", true)
    .maybeSingle();

  if (branchError || !branch) {
    throw createError({
      statusCode: 422,
      statusMessage: "branchId must reference an active public branch",
    });
  }

  // ── 5. Verify booking ownership and draft status ─────────────────────────────
  const { data: existingBooking, error: bookingFetchError } =
    await adminClient
      .from("rental_bookings")
      .select("id, user_id, status")
      .eq("id", bookingId)
      .eq("user_id", userId)
      .eq("status", "draft")
      .maybeSingle();

  if (bookingFetchError || !existingBooking) {
    throw createError({
      statusCode: 404,
      statusMessage: "Draft booking not found or not owned by this user",
    });
  }

  // ── 6. Apply update ──────────────────────────────────────────────────────────
  const hubName =
    (branch as Record<string, unknown>).name_th as string ||
    (branch as Record<string, unknown>).name_en as string ||
    "";

  const { error: updateError } = await adminClient
    .from("rental_bookings")
    .update({ hub_id: branchId, hub_name: hubName })
    .eq("id", bookingId);

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message });
  }

  return {
    booking: {
      id: bookingId,
      hub_id: branchId,
      hub_name: hubName,
    },
  };
});
