import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getMixedCheckoutUserId } from "~~/server/utils/mixed-checkout";
import { cancelCustomerRentalBooking } from "~~/server/utils/rental-booking-cancellation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  const userId = getMixedCheckoutUserId(user);
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({
      statusCode: 400,
      statusMessage: "booking id is required",
    });
  }
  if (!UUID_RE.test(bookingId)) {
    throw createError({
      statusCode: 400,
      statusMessage: "booking id is invalid",
    });
  }

  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  return cancelCustomerRentalBooking({
    client: serverSupabaseServiceRole(event),
    bookingId,
    userId,
    body,
    preferTransactionalRpc: true,
  });
});
