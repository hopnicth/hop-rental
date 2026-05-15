import { readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getMixedCheckoutUserId } from "~~/server/utils/mixed-checkout";
import { getDraftRentalBookingCheckoutStates } from "~~/server/utils/rental-booking-checkout-state";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  const userId = getMixedCheckoutUserId(user);
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const body = await readBody(event);
  const bookingIds = Array.isArray((body as Record<string, unknown>)?.bookingIds)
    ? ((body as Record<string, unknown>).bookingIds as unknown[]).filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : [];

  return getDraftRentalBookingCheckoutStates({
    client: serverSupabaseServiceRole(event),
    userId,
    bookingIds,
  });
});