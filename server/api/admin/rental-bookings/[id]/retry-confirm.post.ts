/**
 * POST /api/admin/rental-bookings/:id/retry-confirm
 *
 * B-M1 exit 1: re-runs the stranded confirm half for a paid_confirm_failed
 * booking (T2 resume shape — stored money state verified first; only the
 * non-money half re-executes; idempotent; a persisting conflict surfaces as
 * 409, never force-confirmed). Not money-destructive → platform admin, no
 * §F row. Exit 2 (refund) is POST /api/admin/rental-bookings/:id/company-cancel.
 *
 * Errors: 401 | 403 | 404 | 409 | 500
 */
import { defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { retryConfirmStuckBooking } from "~~/server/utils/admin-stuck-deposits";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  return retryConfirmStuckBooking({
    client: adminClient,
    rawBookingId: getRouterParam(event, "id"),
    actorUserId: userId,
  });
});
