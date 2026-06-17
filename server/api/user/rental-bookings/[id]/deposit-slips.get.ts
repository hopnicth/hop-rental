/**
 * GET /api/user/rental-bookings/:id/deposit-slips
 *
 * Ownership-checked list of the customer's own uploaded deposit-slip evidence
 * for one rental booking (for the payment-history section on the booking detail
 * page). Safe metadata only — never a storage path/bucket or URL.
 *
 * Auth:    serverSupabaseUser + ownership (booking.user_id === session user).
 * Returns: { slips: SafeRentalDepositSlip[] } — newest first.
 * Errors:  400 | 401 | 403 | 404 | 500
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  RENTAL_DEPOSIT_SLIP_SAFE_SELECT,
  asUuidOrNull,
  toSafeRentalDepositSlip,
} from "~~/server/utils/rental-deposit-slip-evidence";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const bookingId = asUuidOrNull(getRouterParam(event, "id"));
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_BOOKING_ID" });
  }

  const client = serverSupabaseServiceRole(event);

  const { data: booking, error: bookingError } = await client
    .from("rental_bookings")
    .select("id, user_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) {
    console.error(
      "[rental] deposit slips list booking read failed",
      bookingError.message,
    );
    throw createError({ statusCode: 500, statusMessage: "BOOKING_READ_FAILED" });
  }
  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: "Booking not found" });
  }
  if (String(booking.user_id ?? "") !== String(userId)) {
    throw createError({ statusCode: 403, statusMessage: "Access denied" });
  }

  const { data: slips, error } = await client
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
    slips: ((slips ?? []) as Record<string, unknown>[]).map(
      toSafeRentalDepositSlip,
    ),
  };
});
