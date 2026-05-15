import { createError, defineEventHandler, getHeader, readRawBody } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import {
  asPaymentNonEmptyString,
  extractOmiseCharge,
  verifyOmiseWebhookSignature,
} from "~~/server/utils/payment-core";
import { normalizeOmiseCharge } from "~~/server/utils/omise";
import {
  MIXED_CHECKOUT_SESSION_SELECT,
  MIXED_PAYMENT_ATTEMPT_SELECT,
  applyMixedCheckoutGatewayResult,
} from "~~/server/utils/mixed-checkout-finalization";
import {
  applyGatewayResult,
  assertGatewayAmountMatches,
  PAYMENT_ATTEMPT_SELECT,
  recordPaymentAlert,
} from "~~/server/utils/payments";
import {
  RENTAL_BOOKING_PAYMENT_ATTEMPT_SELECT,
  applyRentalBookingDepositGatewayResult,
  assertGatewayAmountMatchesBookingDeposit,
  computeBookingDepositLinesFromBooking,
  loadRentalBookingForDepositPayment,
} from "~~/server/utils/rental-booking-deposit-payment";

export default defineEventHandler(async (event) => {
  const rawBody = (await readRawBody(event)) || "";
  const signatureHeader = getHeader(event, "omise-signature");
  const timestampHeader = getHeader(event, "omise-signature-timestamp");
  const config = useRuntimeConfig(event);
  const webhookSecret =
    asPaymentNonEmptyString(config.omiseWebhookSecret) ??
    asPaymentNonEmptyString(process.env.OMISE_WEBHOOK_SECRET);
  if (!webhookSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: "OMISE_WEBHOOK_SECRET is not configured",
    });
  }
  if (
    !verifyOmiseWebhookSignature({
      rawBody,
      signatureHeader: signatureHeader ?? null,
      timestampHeader: timestampHeader ?? null,
      webhookSecret,
    })
  ) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid Omise webhook signature",
    });
  }

  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const gatewayEventId = asPaymentNonEmptyString(payload.id);
  const eventType = asPaymentNonEmptyString(payload.key) ?? "unknown";
  const charge = extractOmiseCharge(payload);
  const gatewayChargeId = asPaymentNonEmptyString(charge?.id);
  const adminClient = serverSupabaseServiceRole(event);

  const { data: paymentEvent, error: eventError } = await adminClient
    .from("payment_events")
    .insert({
      gateway: "omise",
      gateway_event_id: gatewayEventId,
      event_type: eventType,
      gateway_charge_id: gatewayChargeId,
      raw_payload: payload,
      signature_header: signatureHeader ?? null,
    })
    .select("id")
    .single();
  if (eventError) {
    if (eventError.code === "23505") return { ok: true, duplicate: true };
    throw createError({ statusCode: 500, statusMessage: eventError.message });
  }

  if (!charge || !gatewayChargeId) {
    await adminClient
      .from("payment_events")
      .update({ status: "ignored", processed_at: new Date().toISOString() })
      .eq("id", paymentEvent.id);
    return { ok: true, ignored: true };
  }

  const { data: attempt } = await adminClient
    .from("payment_attempts")
    .select(PAYMENT_ATTEMPT_SELECT)
    .eq("gateway", "omise")
    .eq("gateway_charge_id", gatewayChargeId)
    .maybeSingle();
  if (!attempt) {
    const { data: rentalAttempt } = await adminClient
      .from("rental_booking_payment_attempts")
      .select(RENTAL_BOOKING_PAYMENT_ATTEMPT_SELECT)
      .eq("gateway", "omise")
      .eq("gateway_charge_id", gatewayChargeId)
      .maybeSingle();

    if (rentalAttempt) {
      try {
        const booking = await loadRentalBookingForDepositPayment(
          adminClient,
          String(rentalAttempt.booking_id),
        );
        const { bookingDeposit } = computeBookingDepositLinesFromBooking({
          booking,
        });
        assertGatewayAmountMatchesBookingDeposit(
          bookingDeposit.grossAmount,
          String(booking.currency_code ?? "THB"),
          charge,
        );
        await applyRentalBookingDepositGatewayResult({
          client: adminClient,
          booking,
          attempt: rentalAttempt as Record<string, unknown>,
          result: normalizeOmiseCharge(charge),
        });
        await adminClient
          .from("payment_events")
          .update({
            rental_booking_payment_attempt_id: rentalAttempt.id,
            booking_id: rentalAttempt.booking_id,
            status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", paymentEvent.id);
        return { ok: true, rentalBookingDeposit: true };
      } catch (err) {
        await recordPaymentAlert(adminClient, {
          bookingId: String(rentalAttempt.booking_id),
          rentalBookingPaymentAttemptId: String(rentalAttempt.id),
          kind: "booking_deposit_webhook_failed",
          audience: "admin",
          severity: "critical",
          message:
            err instanceof Error
              ? err.message
              : "Booking Deposit webhook failed.",
          metadata: { gatewayEventId, gatewayChargeId },
        });
        await adminClient
          .from("payment_events")
          .update({
            rental_booking_payment_attempt_id: rentalAttempt.id,
            booking_id: rentalAttempt.booking_id,
            status: "failed",
            processing_error:
              err instanceof Error ? err.message : "RENTAL_WEBHOOK_FAILED",
          })
          .eq("id", paymentEvent.id);
        return { ok: true, rentalWebhookFailed: true };
      }
    }

    const { data: mixedAttempt } = await adminClient
      .from("mixed_payment_attempts")
      .select(MIXED_PAYMENT_ATTEMPT_SELECT)
      .eq("gateway", "omise")
      .eq("gateway_charge_id", gatewayChargeId)
      .maybeSingle();

    if (mixedAttempt) {
      const { data: mixedSession } = await adminClient
        .from("mixed_checkout_sessions")
        .select(MIXED_CHECKOUT_SESSION_SELECT)
        .eq("id", mixedAttempt.mixed_checkout_session_id)
        .maybeSingle();
      if (!mixedSession) {
        await adminClient
          .from("payment_events")
          .update({
            mixed_payment_attempt_id: mixedAttempt.id,
            status: "failed",
            processing_error: "MIXED_CHECKOUT_SESSION_NOT_FOUND",
          })
          .eq("id", paymentEvent.id);
        return { ok: true, missingMixedSession: true };
      }

      try {
        const result = await applyMixedCheckoutGatewayResult({
          client: adminClient,
          session: mixedSession as Record<string, unknown>,
          attempt: mixedAttempt as Record<string, unknown>,
          result: normalizeOmiseCharge(charge),
        });
        await adminClient
          .from("payment_events")
          .update({
            mixed_checkout_session_id: mixedSession.id,
            mixed_payment_attempt_id: mixedAttempt.id,
            status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", paymentEvent.id);
        return { ok: true, mixedCheckout: true, ...result };
      } catch (err) {
        await recordPaymentAlert(adminClient, {
          kind: "mixed_finalization_failed",
          audience: "admin",
          severity: "critical",
          message:
            err instanceof Error
              ? err.message
              : "Mixed checkout finalization failed.",
          mixedCheckoutSessionId: String(mixedSession.id),
          mixedPaymentAttemptId: String(mixedAttempt.id),
          metadata: { gatewayEventId, gatewayChargeId },
        });
        await adminClient
          .from("mixed_payment_attempts")
          .update({ status: "finalization_failed" })
          .eq("id", mixedAttempt.id);
        await adminClient
          .from("mixed_checkout_sessions")
          .update({ status: "finalization_failed" })
          .eq("id", mixedSession.id);
        await adminClient
          .from("payment_events")
          .update({
            mixed_checkout_session_id: mixedSession.id,
            mixed_payment_attempt_id: mixedAttempt.id,
            status: "failed",
            processing_error:
              err instanceof Error ? err.message : "MIXED_WEBHOOK_FAILED",
          })
          .eq("id", paymentEvent.id);
        return { ok: true, mixedWebhookFailed: true };
      }
    }

    await recordPaymentAlert(adminClient, {
      kind: "webhook_missing_payment_attempt",
      audience: "admin",
      severity: "error",
      message: `Webhook charge ${gatewayChargeId} has no matching payment attempt.`,
      metadata: { gatewayEventId, eventType, gatewayChargeId },
    });
    await adminClient
      .from("payment_events")
      .update({
        status: "failed",
        processing_error: "PAYMENT_ATTEMPT_NOT_FOUND",
      })
      .eq("id", paymentEvent.id);
    return { ok: true, missingAttempt: true };
  }

  const { data: order } = await adminClient
    .from("orders")
    .select("id, user_id, status, payment_status, grand_total, currency_code")
    .eq("id", attempt.order_id)
    .maybeSingle();
  if (!order) {
    await adminClient
      .from("payment_events")
      .update({ status: "failed", processing_error: "ORDER_NOT_FOUND" })
      .eq("id", paymentEvent.id);
    return { ok: true, missingOrder: true };
  }

  try {
    assertGatewayAmountMatches(order as Record<string, unknown>, charge);
  } catch (err) {
    await recordPaymentAlert(adminClient, {
      orderId: String(order.id),
      paymentAttemptId: String(attempt.id),
      kind: "amount_mismatch",
      audience: "admin",
      severity: "critical",
      message: "Gateway amount or currency did not match the order.",
      metadata: { gatewayEventId, gatewayChargeId },
    });
    await adminClient
      .from("payment_events")
      .update({
        status: "failed",
        processing_error:
          err instanceof Error ? err.message : "AMOUNT_MISMATCH",
      })
      .eq("id", paymentEvent.id);
    return { ok: true, amountMismatch: true };
  }

  const result = normalizeOmiseCharge(charge);
  if (order.payment_status === "paid" && attempt.status !== "paid") {
    await recordPaymentAlert(adminClient, {
      orderId: String(order.id),
      paymentAttemptId: String(attempt.id),
      kind: "duplicate_payment_success",
      audience: "admin",
      severity: "critical",
      message: "Another payment succeeded after the order was already paid.",
      metadata: { gatewayEventId, gatewayChargeId },
    });
  } else {
    await applyGatewayResult(adminClient, {
      order: order as Record<string, unknown>,
      attempt: attempt as Record<string, unknown>,
      result,
    });
  }

  await adminClient
    .from("payment_events")
    .update({
      payment_attempt_id: attempt.id,
      order_id: order.id,
      status: "processed",
      processed_at: new Date().toISOString(),
    })
    .eq("id", paymentEvent.id);

  return { ok: true };
});
