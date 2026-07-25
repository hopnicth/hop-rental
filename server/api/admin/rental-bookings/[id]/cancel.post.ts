/**
 * POST /api/admin/rental-bookings/:id/cancel
 *
 * Launch-era STAFF cancellation (K-1). Releases the slot by flipping the
 * booking to `cancelled` through f_cancel_rental_booking_launch (mig 145),
 * which is the writer authority and logs the §F row atomically.
 *
 * ZERO MONEY: launch bookings are free, so this moves no money and issues no
 * document. Bookings that carry a paid deposit belong to the deposit-era
 * cancel paths (company-cancel / late-cancel-forfeit), which remain gated by
 * migration 135 — this endpoint deliberately does not touch them.
 *
 * Auth:  requirePlatformAdmin (staff + super_admin). No approval tier: nothing
 *        is at stake financially, and the decision log records who acted.
 * Input: JSON { reason } — MANDATORY, stored on the booking row.
 * Returns: { ok, bookingId, state, wasAlreadyCancelled }
 * Errors:  400 | 401 | 403 | 404 | 409 | 422 | 500
 */
import { defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  cancelRentalBookingLaunch,
  type LaunchCancelClient,
} from "~~/server/utils/rental-booking-launch-cancel";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } =
    await requirePlatformAdmin(event);
  const body = (await readBody<{ reason?: string }>(event)) ?? {};

  return await cancelRentalBookingLaunch({
    client: adminClient as unknown as LaunchCancelClient,
    rawBookingId: getRouterParam(event, "id"),
    actorUserId: userId,
    actorRole: platformRole,
    initiator: platformRole === "super_admin" ? "admin" : "staff",
    source: "admin_rental_detail",
    reason: body.reason,
  });
});
