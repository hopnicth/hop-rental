import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { markRentalBookingNoShow } from "~~/server/utils/rental-booking-no-show";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "Booking id is required" });
  }
  const body = (await readBody<{ reason?: unknown }>(event)) ?? {};
  return markRentalBookingNoShow({
    adminClient,
    bookingId,
    adminUserId: userId,
    reason: body.reason,
  });
});