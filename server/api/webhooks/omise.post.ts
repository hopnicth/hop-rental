import { createError, defineEventHandler, getHeader, readRawBody } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import {
  asPaymentNonEmptyString,
  extractOmiseCharge,
  verifyOmiseWebhookSignature,
} from "~~/server/utils/payment-core";
import {
  normalizeOmiseCharge,
  retrieveOmiseCharge,
} from "~~/server/utils/omise";
import {
  MIXED_CHECKOUT_SESSION_SELECT,
  MIXED_PAYMENT_ATTEMPT_SELECT,
  applyMixedCheckoutGatewayResult,
} from "~~/server/utils/mixed-checkout-finalization";
import {
  POS_QR_ATTEMPT_SELECT,
  applyPosRentalQrGatewayResult,
} from "~~/server/utils/pos-rental-qr-booking-deposit";
import { applyPosRentalQrRemainingDepositGatewayResult } from "~~/server/utils/pos-rental-qr-remaining-deposit";
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

    // ── POS V3 QR fan-out — dispatches by payment_purpose ───────────────────
    const { data: posRentalAttempt } = await adminClient
      .from("pos_rental_payment_attempts")
      .select(POS_QR_ATTEMPT_SELECT)
      .eq("gateway", "omise")
      .eq("gateway_charge_id", gatewayChargeId)
      .maybeSingle();

    if (posRentalAttempt) {
      const posBookingId = String(posRentalAttempt.rental_booking_id);
      const paymentPurpose = String(posRentalAttempt.payment_purpose ?? "");

      // Unknown purpose: log alert and skip without processing
      if (
        paymentPurpose !== "booking_deposit" &&
        paymentPurpose !== "remaining_security_deposit"
      ) {
        await recordPaymentAlert(adminClient, {
          bookingId: posBookingId,
          kind: "booking_deposit_webhook_failed",
          audience: "admin",
          severity: "error",
          message: `POS V3 QR webhook: unknown payment_purpose '${paymentPurpose}'. Skipping.`,
          metadata: { gatewayEventId, gatewayChargeId, paymentPurpose },
        });
        await adminClient
          .from("payment_events")
          .update({
            pos_rental_payment_attempt_id: posRentalAttempt.id,
            status: "failed",
            processing_error: "UNKNOWN_POS_PAYMENT_PURPOSE",
          })
          .eq("id", paymentEvent.id);
        return { ok: true, unknownPosPaymentPurpose: true };
      }

      // Booking select shared between both dispatch paths
      const bookingSelect =
        paymentPurpose === "booking_deposit"
          ? "id, user_id, walk_in_phone, status, asset_id, asset_name, booker_name, sku_id, start_date, end_date, rental_days, hub_id, deposit_amount, currency_code, booking_deposit_payment_status, booking_deposit_paid_amount, pos_branch_id, pos_staff_user_id"
          : "id, deposit_amount, deposit_paid_amount, deposit_payment_status, booking_deposit_payment_status, booking_deposit_paid_amount, currency_code, pos_branch_id, pos_staff_user_id";

      try {
        const { data: posBooking } = await adminClient
          .from("rental_bookings")
          .select(bookingSelect)
          .eq("id", posBookingId)
          .maybeSingle();
        if (!posBooking) {
          await adminClient
            .from("payment_events")
            .update({
              pos_rental_payment_attempt_id: posRentalAttempt.id,
              status: "failed",
              processing_error: "POS_RENTAL_BOOKING_NOT_FOUND",
            })
            .eq("id", paymentEvent.id);
          return { ok: true, missingPosRentalBooking: true };
        }
        const liveCharge = await retrieveOmiseCharge(event, gatewayChargeId);
        if (paymentPurpose === "booking_deposit") {
          // booking_deposit → existing booking deposit QR finalizer (issues BDC, confirms booking)
          await applyPosRentalQrGatewayResult({
            client: adminClient,
            posAttempt: posRentalAttempt as Record<string, unknown>,
            booking: posBooking as Record<string, unknown>,
            result: liveCharge,
          });
        } else {
          // remaining_security_deposit → new remaining deposit finalizer (no BDC, no confirmation)
          await applyPosRentalQrRemainingDepositGatewayResult({
            client: adminClient,
            posAttempt: posRentalAttempt as Record<string, unknown>,
            booking: posBooking as Record<string, unknown>,
            result: liveCharge,
          });
        }
        await adminClient
          .from("payment_events")
          .update({
            pos_rental_payment_attempt_id: posRentalAttempt.id,
            status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", paymentEvent.id);
        return { ok: true, posRentalQr: true, paymentPurpose };
      } catch (err) {
        await recordPaymentAlert(adminClient, {
          bookingId: posBookingId,
          kind: "booking_deposit_webhook_failed",
          audience: "admin",
          severity: "critical",
          message:
            err instanceof Error
              ? err.message
              : `POS V3 QR webhook failed (purpose: ${paymentPurpose}).`,
          metadata: { gatewayEventId, gatewayChargeId, paymentPurpose },
        });
        await adminClient
          .from("payment_events")
          .update({
            pos_rental_payment_attempt_id: posRentalAttempt.id,
            status: "failed",
            processing_error:
              err instanceof Error
                ? err.message
                : "POS_RENTAL_QR_WEBHOOK_FAILED",
          })
          .eq("id", paymentEvent.id);
        return { ok: true, posRentalQrWebhookFailed: true };
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
