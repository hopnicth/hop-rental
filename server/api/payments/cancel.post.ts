import { createError, defineEventHandler, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { asPaymentNonEmptyString } from "~~/server/utils/payment-core";
import { recordPaymentAlert } from "~~/server/utils/payments";
import { expireOmiseCharge } from "~~/server/utils/omise";

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
  const orderId = asPaymentNonEmptyString(body.orderId);
  if (!orderId) {
    throw createError({
      statusCode: 400,
      statusMessage: "orderId is required",
    });
  }

  const adminClient = serverSupabaseServiceRole(event);
  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id, user_id, status, payment_status")
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
  if (order.payment_status === "paid") {
    throw createError({ statusCode: 409, statusMessage: "ORDER_ALREADY_PAID" });
  }
  if (order.status === "cancelled") {
    return { success: true, alreadyCancelled: true };
  }

  // Mark all non-terminal attempts as cancelled, collecting gateway charge ids
  // so we can best-effort expire them at the gateway.
  const { data: activeAttempts } = await adminClient
    .from("payment_attempts")
    .select("id, gateway_charge_id, status")
    .eq("order_id", orderId)
    .not("status", "in", "(paid,refunded,cancelled,expired,failed)");

  await adminClient
    .from("payment_attempts")
    .update({ status: "cancelled" })
    .eq("order_id", orderId)
    .not("status", "in", "(paid,refunded,cancelled,expired,failed)");

  await adminClient
    .from("orders")
    .update({ status: "cancelled", payment_status: "cancelled" })
    .eq("id", orderId);

  await recordPaymentAlert(adminClient, {
    orderId,
    kind: "user_cancelled",
    audience: "user",
    severity: "info",
    message: "Payment cancelled by user.",
  });

  // Best-effort expire on Omise — never fail the cancel call because of it.
  for (const attempt of activeAttempts ?? []) {
    const chargeId = asPaymentNonEmptyString(attempt.gateway_charge_id);
    if (!chargeId) continue;
    try {
      await expireOmiseCharge(event, chargeId);
    } catch {
      // Swallow gateway errors; local state is already cancelled.
    }
  }

  return { success: true };
});
