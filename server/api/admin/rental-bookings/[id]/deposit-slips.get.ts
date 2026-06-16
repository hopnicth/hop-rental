/**
 * GET /api/admin/rental-bookings/:id/deposit-slips
 *
 * Admin list of customer-uploaded bank-transfer deposit-slip evidence for one
 * booking. Returns safe metadata only (filename, status, uploaded_at, mime,
 * size) — never a storage path/bucket or URL. Viewing a file requires the
 * separate short-lived signed-url route.
 *
 * Auth:    requirePlatformAdmin (staff + super_admin).
 * Returns: { slips: SafeRentalDepositSlip[] } — newest first.
 * Errors:  400 | 401 | 403 | 500
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  RENTAL_DEPOSIT_SLIP_SAFE_SELECT,
  asUuidOrNull,
  toSafeRentalDepositSlip,
} from "~~/server/utils/rental-deposit-slip-evidence";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);

  const bookingId = asUuidOrNull(getRouterParam(event, "id"));
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_BOOKING_ID" });
  }

  const { data, error } = await adminClient
    .from("rental_booking_deposit_slips")
    .select(RENTAL_DEPOSIT_SLIP_SAFE_SELECT)
    .eq("rental_booking_id", bookingId)
    .order("uploaded_at", { ascending: false });
  if (error) {
    console.error("[rental] deposit slips list read failed", error.message);
    throw createError({
      statusCode: 500,
      statusMessage: "DEPOSIT_SLIPS_READ_FAILED",
    });
  }

  return {
    slips: ((data ?? []) as Record<string, unknown>[]).map(
      toSafeRentalDepositSlip,
    ),
  };
});
