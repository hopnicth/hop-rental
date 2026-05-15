import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  completeRentalBookingFulfillment,
  type RentalFulfillmentEventType,
  type RentalFulfillmentPayload,
} from "~~/server/utils/rental-fulfillment";

type CompatibilityPayload = RentalFulfillmentPayload & {
  eventType?: RentalFulfillmentEventType;
};

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } =
    await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Booking id is required",
    });
  }
  const body = (await readBody<CompatibilityPayload>(event)) ?? {};
  if (body.eventType !== "pickup" && body.eventType !== "return") {
    throw createError({
      statusCode: 400,
      statusMessage: "eventType must be pickup or return",
    });
  }
  return await completeRentalBookingFulfillment({
    adminClient,
    userId,
    platformRole,
    bookingId,
    eventType: body.eventType,
    payload: body,
  });
});
