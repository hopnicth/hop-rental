import { createError, defineEventHandler, getRouterParam } from "h3";
import { serverSupabaseServiceRole, serverSupabaseUser } from "#supabase/server";
import {
  mapAttemptResponse,
  PAYMENT_ATTEMPT_SELECT,
  recordPaymentAlert,
  shouldExpireAttempt,
} from "~~/server/utils/payments";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });
  }

  const orderId = getRouterParam(event, "orderId");
  if (!orderId) {
    throw createError({ statusCode: 400, statusMessage: "orderId is required" });
  }

  const adminClient = serverSupabaseServiceRole(event);
  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id, user_id, status, payment_status, payment_method, grand_total, currency_code")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw createError({ statusCode: 500, statusMessage: orderError.message });
  if (!order) throw createError({ statusCode: 404, statusMessage: "Order not found" });
  if (String(order.user_id) !== String(userId)) {
    throw createError({ statusCode: 403, statusMessage: "Order access denied" });
  }

  const { data: attempts, error: attemptsError } = await adminClient
    .from("payment_attempts")
    .select(PAYMENT_ATTEMPT_SELECT)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (attemptsError) {
    throw createError({ statusCode: 500, statusMessage: attemptsError.message });
  }

  const normalizedAttempts = [];
  for (const attempt of attempts ?? []) {
    if (shouldExpireAttempt(attempt as Record<string, unknown>)) {
      const { data: expired } = await adminClient
        .from("payment_attempts")
        .update({ status: "expired" })
        .eq("id", attempt.id)
        .neq("status", "paid")
        .select(PAYMENT_ATTEMPT_SELECT)
        .single();
      await recordPaymentAlert(adminClient, {
        orderId,
        paymentAttemptId: String(attempt.id),
        kind: "promptpay_expired",
        audience: "user",
        severity: "warning",
        message: "PromptPay QR expired.",
      });
      normalizedAttempts.push(mapAttemptResponse(expired ?? attempt));
    } else {
      normalizedAttempts.push(mapAttemptResponse(attempt as Record<string, unknown>));
    }
  }

  return {
    orderId,
    orderStatus: order.status,
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    amount: Number(order.grand_total) || 0,
    currency: order.currency_code ?? "THB",
    attempts: normalizedAttempts,
    latestAttempt: normalizedAttempts[0] ?? null,
  };
});