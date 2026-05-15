import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { retrieveOmiseCharge } from "~~/server/utils/omise";
import { asPaymentNonEmptyString } from "~~/server/utils/payment-core";
import {
  RENTAL_BOOKING_PAYMENT_ATTEMPT_SELECT,
  applyRentalBookingDepositGatewayResult,
  assertGatewayAmountMatchesBookingDeposit,
  computeBookingDepositLinesFromBooking,
  loadRentalBookingForDepositPayment,
  mapRentalBookingPaymentAttemptResponse,
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

  const body = (await readBody(event)) as Record<string, unknown>;
  const paymentAttemptId = asPaymentNonEmptyString(body.paymentAttemptId);
  if (!paymentAttemptId) {
    throw createError({
      statusCode: 400,
      statusMessage: "paymentAttemptId is required",
    });
  }

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

  const { data: attempt, error } = await adminClient
    .from("rental_booking_payment_attempts")
    .select(RENTAL_BOOKING_PAYMENT_ATTEMPT_SELECT)
    .eq("id", paymentAttemptId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!attempt)
    throw createError({
      statusCode: 404,
      statusMessage: "Payment attempt not found",
    });
  if (String(attempt.user_id) !== String(userId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Payment attempt access denied",
    });
  }

  const gatewayChargeId = asPaymentNonEmptyString(attempt.gateway_charge_id);
  if (!gatewayChargeId)
    return mapRentalBookingPaymentAttemptResponse(
      attempt as Record<string, unknown>,
    );

  const { bookingDeposit } = computeBookingDepositLinesFromBooking({ booking });
  const gatewayResult = await retrieveOmiseCharge(event, gatewayChargeId);
  assertGatewayAmountMatchesBookingDeposit(
    bookingDeposit.grossAmount,
    String(booking.currency_code ?? "THB"),
    gatewayResult.raw,
  );
  const updated = await applyRentalBookingDepositGatewayResult({
    client: adminClient,
    booking,
    attempt: attempt as Record<string, unknown>,
    result: gatewayResult,
  });
  return mapRentalBookingPaymentAttemptResponse(updated);
});
