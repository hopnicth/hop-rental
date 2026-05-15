import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  isHandoverEditableStatus,
  loadHandoverBooking,
  loadHandoverItems,
} from "~~/server/utils/admin-booking-handover-items";
import type { AdminBookingHandoverItemsResponse } from "~~/app/types/admin-booking-handover-items";

export default defineEventHandler(
  async (event): Promise<AdminBookingHandoverItemsResponse> => {
    const { adminClient } = await requirePlatformAdmin(event);
    const bookingId = getRouterParam(event, "id");
    if (!bookingId) {
      throw createError({ statusCode: 400, statusMessage: "Booking id is required" });
    }

    const booking = await loadHandoverBooking(adminClient, bookingId);
    const items = await loadHandoverItems(adminClient, bookingId);
    return {
      items,
      bookingStatus: booking.status,
      editable: isHandoverEditableStatus(booking.status),
    };
  },
);
