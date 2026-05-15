import { readBody, setResponseStatus } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  getMixedCheckoutUserId,
  isMixedCheckoutEnabled,
  mixedCheckoutDisabledError,
  prevalidateMixedCheckout,
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
  const result = await prevalidateMixedCheckout({
    client: serverSupabaseServiceRole(event),
    userId,
    body: typeof body === "object" && body !== null ? body : {},
  });

  if (!result.ok) {
    setResponseStatus(event, 422);
  }

  return result;
});
