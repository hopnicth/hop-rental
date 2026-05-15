import { readBody, setResponseStatus } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  createMixedCheckout,
  getMixedCheckoutUserId,
  isMixedCheckoutEnabled,
  mixedCheckoutDisabledError,
} from "~~/server/utils/mixed-checkout";

export default defineEventHandler(async (event) => {
  if (!isMixedCheckoutEnabled(useRuntimeConfig(event))) {
    mixedCheckoutDisabledError();
  }

  const user = await serverSupabaseUser(event);
  const userId = getMixedCheckoutUserId(user);
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const body = await readBody(event);
  const result = await createMixedCheckout({
    client: serverSupabaseServiceRole(event),
    event,
    userId,
    body: typeof body === "object" && body !== null ? body : {},
  });

  if (!result.ok) {
    setResponseStatus(event, 422);
  }

  return result;
});
