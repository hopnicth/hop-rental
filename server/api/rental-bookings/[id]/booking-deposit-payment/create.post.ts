import {
  createError,
  defineEventHandler,
  getHeader,
  getRequestIP,
  getRouterParam,
  readBody,
} from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  asPaymentMethod,
  asPaymentNonEmptyString,
} from "~~/server/utils/payment-core";
import {
  createOmiseCardCharge,
  createOmisePromptPayCharge,
} from "~~/server/utils/omise";
import { recordPaymentAlert } from "~~/server/utils/payments";
import {
  BOOKING_DEPOSIT_POLICY_VERSION,
  RENTAL_BOOKING_PAYMENT_ATTEMPT_SELECT,
  applyRentalBookingDepositGatewayResult,
  assertBookingDepositAgreementAccepted,
  assertBookingDepositPaymentEligible,
  buildRentalBookingPaymentReturnUri,
  computeAndStoreBookingDepositLines,
  loadRentalBookingForDepositPayment,
  mapRentalBookingPaymentAttemptResponse,
  recordBookingDepositAgreementAcceptance,
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
  const method = asPaymentMethod(body.method) ?? "promptpay";
  const idempotencyKey = asPaymentNonEmptyString(body.idempotencyKey);
  const cardToken = asPaymentNonEmptyString(body.cardToken);
  if (!idempotencyKey) {
    throw createError({
      statusCode: 400,
      statusMessage: "idempotencyKey is required",
    });
  }
  if (method === "credit_card" && !cardToken) {
    throw createError({
      statusCode: 400,
      statusMessage: "cardToken is required",
    });
  }
  assertBookingDepositAgreementAccepted(body.agreementAccepted);

  const adminClient = serverSupabaseServiceRole(event);
  const { data: existing } = await adminClient
    .from("rental_booking_payment_attempts")
    .select(RENTAL_BOOKING_PAYMENT_ATTEMPT_SELECT)
    .eq("booking_id", bookingId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing)
    return mapRentalBookingPaymentAttemptResponse(
      existing as Record<string, unknown>,
    );

  const booking = await loadRentalBookingForDepositPayment(
    adminClient,
    bookingId,
  );
  await assertBookingDepositPaymentEligible({
    client: adminClient,
    booking,
    userId,
  });
  const { bookingDeposit } = await computeAndStoreBookingDepositLines({
    client: adminClient,
    booking,
  });
  const amount = bookingDeposit.grossAmount;
  const currencyCode = String(booking.currency_code ?? "THB").toUpperCase();
  if (currencyCode === "THB" && amount < 20) {
    throw createError({
      statusCode: 422,
      statusMessage: "AMOUNT_BELOW_MINIMUM",
    });
  }

  const { data: paidAttempt } = await adminClient
    .from("rental_booking_payment_attempts")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("status", "paid")
    .maybeSingle();
  if (paidAttempt)
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_DEPOSIT_ALREADY_PAID",
    });

  const expiresAt =
    method === "promptpay"
      ? new Date(Date.now() + 3 * 60 * 1000).toISOString()
      : null;
  const { data: attempt, error: attemptError } = await adminClient
    .from("rental_booking_payment_attempts")
    .insert({
      booking_id: bookingId,
      user_id: userId,
      method,
      status: "created",
      amount,
      currency_code: currencyCode,
      idempotency_key: idempotencyKey,
      expires_at: expiresAt,
      metadata: {
        lineType: "booking_deposit",
        policyVersion: BOOKING_DEPOSIT_POLICY_VERSION,
      },
    })
    .select(RENTAL_BOOKING_PAYMENT_ATTEMPT_SELECT)
    .single();
  if (attemptError) {
    throw createError({
      statusCode: attemptError.code === "23505" ? 409 : 500,
      statusMessage: attemptError.message,
    });
  }

  const acceptedAt = new Date().toISOString();
  const ip =
    getRequestIP(event, { xForwardedFor: true }) ??
    getHeader(event, "x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const userAgent = getHeader(event, "user-agent") ?? null;
  const acceptedTerms = await recordBookingDepositAgreementAcceptance({
    client: adminClient,
    bookingId,
    userId,
    paymentAttemptId: String(attempt.id),
    acceptedAt,
    ipAddress: ip,
    userAgent,
  });

  await adminClient
    .from("rental_bookings")
    .update({
      booking_deposit_payment_status: "pending",
      booking_deposit_payment_attempt_id: attempt.id,
      booking_deposit_policy_version: BOOKING_DEPOSIT_POLICY_VERSION,
      booking_deposit_terms_accepted_at: acceptedAt,
      booking_deposit_terms_version: acceptedTerms.acceptedTermsVersion,
    })
    .eq("id", bookingId);

  try {
    const returnUri = buildRentalBookingPaymentReturnUri(event, bookingId);
    const gatewayResult =
      method === "credit_card"
        ? await createOmiseCardCharge(event, {
            orderId: bookingId,
            paymentAttemptId: String(attempt.id),
            amount,
            currency: currencyCode,
            cardToken: cardToken ?? "",
            returnUri,
            metadata: {
              booking_id: bookingId,
              payment_context: "booking_deposit",
            },
          })
        : await createOmisePromptPayCharge(event, {
            orderId: bookingId,
            paymentAttemptId: String(attempt.id),
            amount,
            currency: currencyCode,
            returnUri,
            expiresAt,
            metadata: {
              booking_id: bookingId,
              payment_context: "booking_deposit",
            },
          });
    const updated = await applyRentalBookingDepositGatewayResult({
      client: adminClient,
      booking,
      attempt: attempt as Record<string, unknown>,
      result: {
        ...gatewayResult,
        expiresAt: expiresAt ?? gatewayResult.expiresAt,
      },
    });
    return mapRentalBookingPaymentAttemptResponse(updated);
  } catch (err) {
    await adminClient
      .from("rental_booking_payment_attempts")
      .update({
        status: "failed",
        failure_message: err instanceof Error ? err.message : "Gateway error",
      })
      .eq("id", attempt.id);
    await adminClient
      .from("rental_bookings")
      .update({ booking_deposit_payment_status: "failed" })
      .eq("id", bookingId)
      .neq("booking_deposit_payment_status", "paid");
    await recordPaymentAlert(adminClient, {
      bookingId,
      rentalBookingPaymentAttemptId: String(attempt.id),
      kind: "booking_deposit_payment_failure",
      audience: "admin",
      severity: "error",
      message: err instanceof Error ? err.message : "Gateway error",
    });
    throw err;
  }
});
