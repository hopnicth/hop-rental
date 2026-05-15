import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  getMixedCheckoutUserId,
  isMixedCheckoutEnabled,
  mixedCheckoutDisabledError,
} from "~~/server/utils/mixed-checkout";
import { MIXED_CHECKOUT_SESSION_SELECT } from "~~/server/utils/mixed-checkout-finalization";
import { cancelMixedCheckoutSession } from "~~/server/utils/mixed-checkout-cancellation";

export default defineEventHandler(async (event) => {
  if (!isMixedCheckoutEnabled(useRuntimeConfig(event))) {
    mixedCheckoutDisabledError();
  }

  const user = await serverSupabaseUser(event);
  const userId = getMixedCheckoutUserId(user);
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const sessionId = getRouterParam(event, "sessionId");
  if (!sessionId) {
    throw createError({ statusCode: 400, statusMessage: "sessionId is required" });
  }

  const client = serverSupabaseServiceRole(event);
  const { data: session, error } = await client
    .from("mixed_checkout_sessions")
    .select(MIXED_CHECKOUT_SESSION_SELECT)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  if (!session) {
    throw createError({ statusCode: 404, statusMessage: "Mixed checkout session not found" });
  }
  if (String(session.user_id ?? "") !== userId) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }

  return cancelMixedCheckoutSession({
    client,
    session: session as Record<string, unknown>,
  });
});