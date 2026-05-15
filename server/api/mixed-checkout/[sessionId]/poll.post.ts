import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { asPaymentNonEmptyString } from "~~/server/utils/payment-core";
import { retrieveOmiseCharge } from "~~/server/utils/omise";
import { getMixedCheckoutUserId } from "~~/server/utils/mixed-checkout";
import {
  MIXED_CHECKOUT_SESSION_SELECT,
  MIXED_PAYMENT_ATTEMPT_SELECT,
  applyMixedCheckoutGatewayResult,
} from "~~/server/utils/mixed-checkout-finalization";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  const userId = getMixedCheckoutUserId(user);
  if (!userId)
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  const sessionId = getRouterParam(event, "sessionId");
  if (!sessionId)
    throw createError({
      statusCode: 400,
      statusMessage: "sessionId is required",
    });

  const client = serverSupabaseServiceRole(event);
  const { data: session, error: sessionError } = await client
    .from("mixed_checkout_sessions")
    .select(MIXED_CHECKOUT_SESSION_SELECT)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (sessionError)
    throw createError({ statusCode: 500, statusMessage: sessionError.message });
  if (!session)
    throw createError({
      statusCode: 404,
      statusMessage: "Mixed checkout session not found",
    });

  const { data: attempt, error: attemptError } = await client
    .from("mixed_payment_attempts")
    .select(MIXED_PAYMENT_ATTEMPT_SELECT)
    .eq("mixed_checkout_session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (attemptError)
    throw createError({ statusCode: 500, statusMessage: attemptError.message });
  if (!attempt)
    throw createError({
      statusCode: 404,
      statusMessage: "Mixed payment attempt not found",
    });

  const gatewayChargeId = asPaymentNonEmptyString(attempt.gateway_charge_id);
  if (!gatewayChargeId) return { ok: true, polled: false, session, attempt };

  const gatewayResult = await retrieveOmiseCharge(event, gatewayChargeId);
  const result = await applyMixedCheckoutGatewayResult({
    client,
    session: session as Record<string, unknown>,
    attempt: attempt as Record<string, unknown>,
    result: gatewayResult,
  });
  return { ok: true, polled: true, result };
});
