import { readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  createOmiseCardCharge,
  retrieveOmiseCharge,
} from "~~/server/utils/omise";
import { asPaymentNonEmptyString } from "~~/server/utils/payment-core";
import {
  buildMixedPaymentReturnUri,
  getMixedCheckoutUserId,
  isMixedCheckoutEnabled,
  mapMixedPaymentAttemptResponse,
  mixedCheckoutDisabledError,
} from "~~/server/utils/mixed-checkout";
import {
  MIXED_CHECKOUT_SESSION_SELECT,
  MIXED_PAYMENT_ATTEMPT_SELECT,
  applyMixedCheckoutGatewayResult,
} from "~~/server/utils/mixed-checkout-finalization";

const PAYABLE_MIXED_SESSION_STATUSES = new Set([
  "validated",
  "payment_created",
]);

async function refreshMixedCardAttempt(input: {
  event: Parameters<typeof retrieveOmiseCharge>[0];
  client: ReturnType<typeof serverSupabaseServiceRole>;
  session: Record<string, unknown>;
  attempt: Record<string, unknown>;
}) {
  const gatewayChargeId = asPaymentNonEmptyString(
    input.attempt.gateway_charge_id,
  );
  if (!gatewayChargeId) return input.attempt;

  const gatewayResult = await retrieveOmiseCharge(input.event, gatewayChargeId);
  await applyMixedCheckoutGatewayResult({
    client: input.client,
    session: input.session,
    attempt: input.attempt,
    result: gatewayResult,
  });

  const { data: refreshedAttempt, error } = await input.client
    .from("mixed_payment_attempts")
    .select(MIXED_PAYMENT_ATTEMPT_SELECT)
    .eq("id", input.attempt.id)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return (refreshedAttempt ?? input.attempt) as Record<string, unknown>;
}

export default defineEventHandler(async (event) => {
  if (!isMixedCheckoutEnabled(useRuntimeConfig(event))) {
    mixedCheckoutDisabledError();
  }

  const user = await serverSupabaseUser(event);
  const userId = getMixedCheckoutUserId(user);
  if (!userId)
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });

  const sessionId = getRouterParam(event, "sessionId");
  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: "sessionId is required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const cardToken = asPaymentNonEmptyString(body.cardToken);
  if (!cardToken) {
    throw createError({
      statusCode: 400,
      statusMessage: "cardToken is required",
    });
  }

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
  if (!PAYABLE_MIXED_SESSION_STATUSES.has(String(session.status ?? ""))) {
    throw createError({
      statusCode: 409,
      statusMessage: "MIXED_CHECKOUT_SESSION_NOT_PAYABLE",
    });
  }

  const { data: attempt, error: attemptError } = await client
    .from("mixed_payment_attempts")
    .select(MIXED_PAYMENT_ATTEMPT_SELECT)
    .eq("mixed_checkout_session_id", sessionId)
    .eq("method", "credit_card")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (attemptError)
    throw createError({ statusCode: 500, statusMessage: attemptError.message });
  if (!attempt)
    throw createError({
      statusCode: 404,
      statusMessage: "Mixed card attempt not found",
    });

  if (attempt.gateway_charge_id) {
    const refreshedAttempt = await refreshMixedCardAttempt({
      event,
      client,
      session: session as Record<string, unknown>,
      attempt: attempt as Record<string, unknown>,
    });
    return mapMixedPaymentAttemptResponse(refreshedAttempt);
  }

  const charge = await createOmiseCardCharge(event, {
    orderId: String(session.id),
    paymentAttemptId: String(attempt.id),
    amount: Number(attempt.amount),
    currency: String(attempt.currency_code ?? "THB"),
    cardToken,
    returnUri: buildMixedPaymentReturnUri(event, String(session.id)),
    metadata: {
      payment_context: "mixed_checkout",
      mixed_checkout_session_id: String(session.id),
      mixed_payment_attempt_id: String(attempt.id),
    },
  });

  const { data: updatedAttempt, error: updateError } = await client
    .from("mixed_payment_attempts")
    .update({
      status: charge.status,
      gateway_charge_id: charge.gatewayChargeId,
      gateway_source_id: charge.gatewaySourceId,
      gateway_authorize_uri: charge.authorizeUri,
      qr_image_url: charge.qrImageUrl,
      expires_at: charge.expiresAt,
      failure_code: charge.failureCode,
      failure_message: charge.failureMessage,
      raw_gateway_response: charge.raw,
    })
    .eq("id", attempt.id)
    .select(MIXED_PAYMENT_ATTEMPT_SELECT)
    .single();
  if (updateError)
    throw createError({ statusCode: 500, statusMessage: updateError.message });

  if (charge.status === "paid") {
    await applyMixedCheckoutGatewayResult({
      client,
      session: session as Record<string, unknown>,
      attempt: updatedAttempt as Record<string, unknown>,
      result: charge,
    });
  }

  const { data: refreshedAttempt, error: refreshError } = await client
    .from("mixed_payment_attempts")
    .select(MIXED_PAYMENT_ATTEMPT_SELECT)
    .eq("id", attempt.id)
    .maybeSingle();
  if (refreshError)
    throw createError({ statusCode: 500, statusMessage: refreshError.message });

  return mapMixedPaymentAttemptResponse(refreshedAttempt ?? updatedAttempt);
});
