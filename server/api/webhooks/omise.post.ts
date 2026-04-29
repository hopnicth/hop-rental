import { createError, defineEventHandler, getHeader, readRawBody } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import {
  asPaymentNonEmptyString,
  extractOmiseCharge,
  verifyOmiseWebhookSignature,
} from "~~/server/utils/payment-core";
import { normalizeOmiseCharge } from "~~/server/utils/omise";
import {
  applyGatewayResult,
  assertGatewayAmountMatches,
  PAYMENT_ATTEMPT_SELECT,
  recordPaymentAlert,
} from "~~/server/utils/payments";

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
