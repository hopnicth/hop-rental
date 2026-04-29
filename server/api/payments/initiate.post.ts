import { createError, defineEventHandler, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  asNonEmptyString,
  asPaymentMethod,
} from "~~/server/utils/payment-core";
import {
  applyGatewayResult,
  assertOrderPayable,
  buildPaymentReturnUri,
  mapAttemptResponse,
  PAYMENT_ATTEMPT_SELECT,
  recordPaymentAlert,
} from "~~/server/utils/payments";
import {
  createOmiseCardCharge,
  createOmisePromptPayCharge,
} from "~~/server/utils/omise";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const orderId = asNonEmptyString(body.orderId);
  const method = asPaymentMethod(body.method);
  const idempotencyKey = asNonEmptyString(body.idempotencyKey);
  if (!orderId || !method || !idempotencyKey) {
    throw createError({
      statusCode: 400,
      statusMessage: "orderId, method and idempotencyKey are required",
    });
  }

  const adminClient = serverSupabaseServiceRole(event);
  const { data: existing } = await adminClient
    .from("payment_attempts")
    .select(PAYMENT_ATTEMPT_SELECT)
    .eq("order_id", orderId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) return mapAttemptResponse(existing as Record<string, unknown>);

  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select(
      "id, user_id, checkout_mode, payment_method, status, payment_status, grand_total, currency_code",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (orderError)
    throw createError({ statusCode: 500, statusMessage: orderError.message });
  if (!order)
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  if (String(order.user_id) !== String(userId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Order access denied",
    });
  }
  if (order.checkout_mode !== "payment") {
    throw createError({
      statusCode: 422,
      statusMessage: "Order is not an online payment order",
    });
  }
  const cardToken = asNonEmptyString(body.cardToken);
  if (method === "credit_card" && !cardToken) {
    throw createError({
      statusCode: 400,
      statusMessage: "cardToken is required",
    });
  }
  assertOrderPayable(order as Record<string, unknown>);

  const { data: paidAttempt } = await adminClient
    .from("payment_attempts")
    .select("id")
    .eq("order_id", orderId)
    .eq("status", "paid")
    .maybeSingle();
  if (paidAttempt) {
    await recordPaymentAlert(adminClient, {
      orderId,
      kind: "duplicate_payment_attempt",
      audience: "admin",
      severity: "warning",
      message: "Duplicate payment attempt blocked for an already paid order.",
    });
    throw createError({ statusCode: 409, statusMessage: "ORDER_ALREADY_PAID" });
  }

  const expiresAt =
    method === "promptpay"
      ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
      : null;
  const { data: attempt, error: attemptError } = await adminClient
    .from("payment_attempts")
    .insert({
      order_id: orderId,
      user_id: userId,
      method,
      status: "created",
      amount: Number(order.grand_total),
      currency_code: String(order.currency_code ?? "THB").toUpperCase(),
      idempotency_key: idempotencyKey,
      expires_at: expiresAt,
    })
    .select(PAYMENT_ATTEMPT_SELECT)
    .single();
  if (attemptError) {
    throw createError({
      statusCode: attemptError.code === "23505" ? 409 : 500,
      statusMessage: attemptError.message,
    });
  }

  try {
    const returnUri = buildPaymentReturnUri(event, orderId);
    const gatewayResult =
      method === "credit_card"
        ? await createOmiseCardCharge(event, {
            orderId,
            paymentAttemptId: String(attempt.id),
            amount: Number(order.grand_total),
            currency: String(order.currency_code ?? "THB"),
            cardToken: cardToken ?? "",
            returnUri,
          })
        : await createOmisePromptPayCharge(event, {
            orderId,
            paymentAttemptId: String(attempt.id),
            amount: Number(order.grand_total),
            currency: String(order.currency_code ?? "THB"),
            returnUri,
          });
    const updated = await applyGatewayResult(adminClient, {
      order: order as Record<string, unknown>,
      attempt: attempt as Record<string, unknown>,
      result: {
        ...gatewayResult,
        expiresAt: gatewayResult.expiresAt ?? expiresAt,
      },
    });
    await adminClient
      .from("orders")
      .update({ payment_method: method })
      .eq("id", orderId);
    return mapAttemptResponse(updated);
  } catch (err) {
    await adminClient
      .from("payment_attempts")
      .update({
        status: "failed",
        failure_message: err instanceof Error ? err.message : "Gateway error",
      })
      .eq("id", attempt.id);
    await recordPaymentAlert(adminClient, {
      orderId,
      paymentAttemptId: String(attempt.id),
      kind: "payment_failure",
      audience: "admin",
      severity: "error",
      message: err instanceof Error ? err.message : "Gateway error",
    });
    throw err;
  }
});
