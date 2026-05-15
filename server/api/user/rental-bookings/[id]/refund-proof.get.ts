import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getMixedCheckoutUserId } from "~~/server/utils/mixed-checkout";
import { getCustomerRefundProofAccess } from "~~/server/utils/customer-rental-booking-detail";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default defineEventHandler(async (event) => {
  const userId = getMixedCheckoutUserId(await serverSupabaseUser(event));
  if (!userId)
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  const bookingId = getRouterParam(event, "id");
  if (!bookingId || !UUID_RE.test(bookingId)) {
    throw createError({ statusCode: 400, statusMessage: "booking id is invalid" });
  }
  return getCustomerRefundProofAccess({
    client: serverSupabaseServiceRole(event),
    bookingId,
    userId,
  });
});