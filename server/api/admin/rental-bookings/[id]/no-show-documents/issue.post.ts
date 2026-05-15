import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { ensureNoShowForfeitureDocuments } from "~~/server/utils/rental-booking-no-show-documents";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "Booking id is required" });
  }
  return ensureNoShowForfeitureDocuments({
    client: adminClient,
    bookingId,
    adminUserId: userId,
  });
});
