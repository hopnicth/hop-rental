import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  completeRentalBookingFulfillment,
  type RentalFulfillmentPayload,
} from "~~/server/utils/rental-fulfillment";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "Booking id is required" });
  }
  const payload = (await readBody<RentalFulfillmentPayload>(event)) ?? {};
  return await completeRentalBookingFulfillment({
    adminClient,
    userId,
    platformRole,
    bookingId,
    eventType: "pickup",
    payload,
  });
});
