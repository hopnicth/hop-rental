import { readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getCartCheckoutState } from "~~/server/utils/cart-checkout-state";
import { getMixedCheckoutUserId } from "~~/server/utils/mixed-checkout";

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  const userId = getMixedCheckoutUserId(user);
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const body = (await readBody(event)) as Record<string, unknown> | null;
  return getCartCheckoutState({
    client: serverSupabaseServiceRole(event),
    userId,
    cartId: typeof body?.cartId === "string" ? body.cartId : null,
    saleCartLineIds: stringArray(body?.saleCartLineIds),
    bookingIds: stringArray(body?.bookingIds),
  });
});