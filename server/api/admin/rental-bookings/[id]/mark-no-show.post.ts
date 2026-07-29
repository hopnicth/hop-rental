/**
 * POST /api/admin/rental-bookings/:id/mark-no-show
 *
 * DEPOSIT-ERA ONLY (CHiP ruling 2026-07-27). Launch is AUTO-CANCEL ONLY: an
 * overdue booking is swept to `cancelled` by the mig-145 nightly job, which
 * releases the slot and writes an `auto_no_show_cancel` §F row. The manual
 * no-show path belongs to the deposit machinery — it forfeits a deposit,
 * recognises the forfeiture as income, and issues two numbered, CUSTOMER-VISIBLE
 * forfeiture documents. On a launch booking every one of those is fiction in the
 * §8.8 sense: a record asserting money machinery that did not happen.
 *
 * So the whole path is GATED here rather than restructured downstream — nothing
 * can reach the writer while deposits are off, and the deposit-era code stays
 * intact for revival (hide-not-delete).
 *
 * FAIL-CLOSED: any rpc error, or any non-`true` value, refuses.
 *
 * Auth: requirePlatformAdmin.
 * Errors: 400 | 401 | 403 | 409 (deposits off) | 422 | 500
 */
import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { markRentalBookingNoShow } from "~~/server/utils/rental-booking-no-show";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "Booking id is required" });
  }

  const { data: depositsEnabled } = await adminClient.rpc("f_deposits_enabled");
  if (depositsEnabled !== true) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "No-show marking is disabled while deposits are off. Overdue bookings are auto-cancelled nightly and the slot is released.",
      data: { code: "NO_SHOW_DISABLED_DEPOSITS_OFF" },
    });
  }
  const body = (await readBody<{ reason?: unknown }>(event)) ?? {};
  return markRentalBookingNoShow({
    adminClient,
    bookingId,
    adminUserId: userId,
    reason: body.reason,
  });
});