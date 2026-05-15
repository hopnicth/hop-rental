import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getMixedCheckoutUserId } from "~~/server/utils/mixed-checkout";
import { issueCustomerRentalDocument } from "~~/server/utils/customer-rental-booking-detail";

export default defineEventHandler(async (event) => {
  const userId = getMixedCheckoutUserId(await serverSupabaseUser(event));
  if (!userId)
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  const bookingId = getRouterParam(event, "id");
  const documentType = getRouterParam(event, "documentType");
  if (!bookingId)
    throw createError({ statusCode: 400, statusMessage: "booking id is required" });
  return issueCustomerRentalDocument({
    client: serverSupabaseServiceRole(event),
    bookingId,
    userId,
    documentType,
  });
});