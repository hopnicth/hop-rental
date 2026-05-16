import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  completePosV2RentalPickup,
  type PosV2PickupCompletePayload,
} from "~~/server/utils/pos-v2-rental-pickup-completion";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "Booking id is required" });
  }

  const payload = (await readBody<PosV2PickupCompletePayload>(event)) ?? {};
  return await completePosV2RentalPickup({
    adminClient,
    userId,
    platformRole,
    bookingId,
    payload,
  });
});