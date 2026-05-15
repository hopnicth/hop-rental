import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  RENTAL_BOOKING_PAYMENT_ATTEMPT_SELECT,
  canRetryBookingDepositPayment,
  computeBookingDepositLinesFromBooking,
  loadRentalBookingForDepositPayment,
  normalizeRentalBookingAttempts,
} from "~~/server/utils/rental-booking-deposit-payment";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId)
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });

  const bookingId = getRouterParam(event, "id");
  if (!bookingId)
    throw createError({
      statusCode: 400,
      statusMessage: "Booking id is required",
    });

  const adminClient = serverSupabaseServiceRole(event);
  const booking = await loadRentalBookingForDepositPayment(
    adminClient,
    bookingId,
  );
  if (String(booking.user_id ?? "") !== String(userId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Booking access denied",
    });
  }

  const { summary, bookingDeposit } = computeBookingDepositLinesFromBooking({
    booking,
  });
  const { data: attempts, error } = await adminClient
    .from("rental_booking_payment_attempts")
    .select(RENTAL_BOOKING_PAYMENT_ATTEMPT_SELECT)
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });

  const normalizedAttempts = await normalizeRentalBookingAttempts({
    client: adminClient,
    bookingId,
    attempts: (attempts ?? []) as Record<string, unknown>[],
  });
  const latestAttempt = normalizedAttempts[0] ?? null;

  return {
    bookingId,
    bookingStatus: booking.status,
    bookingDepositPaymentStatus:
      booking.booking_deposit_payment_status ?? "unpaid",
    confirmFailureReason:
      booking.booking_deposit_confirm_failure_reason ?? null,
    amount: bookingDeposit.grossAmount,
    currency: String(booking.currency_code ?? "THB"),
    summary,
    attempts: normalizedAttempts,
    latestAttempt,
    canRetryBookingDepositPayment: canRetryBookingDepositPayment({
      booking,
      latestAttempt: latestAttempt as Record<string, unknown> | null,
    }),
    bookingQrValue: `booking:${bookingId}`,
  };
});
