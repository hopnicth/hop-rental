import { createError, defineEventHandler, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getMixedCheckoutUserId } from "~~/server/utils/mixed-checkout";
import { listCustomerRefundTrackingStatuses } from "~~/server/utils/customer-rental-booking-detail";

export default defineEventHandler(async (event) => {
  const userId = getMixedCheckoutUserId(await serverSupabaseUser(event));
  if (!userId)
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  const body = (await readBody<{ bookingIds?: unknown }>(event)) ?? {};
  const bookingIds = Array.isArray(body.bookingIds)
    ? body.bookingIds.filter((id): id is string => typeof id === "string")
    : [];
  return listCustomerRefundTrackingStatuses({
    client: serverSupabaseServiceRole(event),
    bookingIds,
    userId,
  });
});