import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { retrieveOmiseCharge } from "~~/server/utils/omise";
import {
  applyGatewayResult,
  assertGatewayAmountMatches,
  mapAttemptResponse,
  PAYMENT_ATTEMPT_SELECT,
} from "~~/server/utils/payments";
import { asPaymentNonEmptyString } from "~~/server/utils/payment-core";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const paymentAttemptId = getRouterParam(event, "paymentAttemptId");
  if (!paymentAttemptId) {
    throw createError({
      statusCode: 400,
      statusMessage: "paymentAttemptId is required",
    });
  }

  const adminClient = serverSupabaseServiceRole(event);
  const { data: attempt, error: attemptError } = await adminClient
    .from("payment_attempts")
    .select(PAYMENT_ATTEMPT_SELECT)
    .eq("id", paymentAttemptId)
    .maybeSingle();
  if (attemptError)
    throw createError({ statusCode: 500, statusMessage: attemptError.message });
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

  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id, user_id, status, payment_status, grand_total, currency_code")
    .eq("id", attempt.order_id)
    .maybeSingle();
  if (orderError)
    throw createError({ statusCode: 500, statusMessage: orderError.message });
  if (!order)
    throw createError({ statusCode: 404, statusMessage: "Order not found" });

  const gatewayChargeId = asPaymentNonEmptyString(attempt.gateway_charge_id);
  if (!gatewayChargeId)
    return mapAttemptResponse(attempt as Record<string, unknown>);

  const gatewayResult = await retrieveOmiseCharge(event, gatewayChargeId);
  assertGatewayAmountMatches(
    order as Record<string, unknown>,
    gatewayResult.raw,
  );
  const updated = await applyGatewayResult(adminClient, {
    order: order as Record<string, unknown>,
    attempt: attempt as Record<string, unknown>,
    result: gatewayResult,
  });

  return mapAttemptResponse(updated);
});
