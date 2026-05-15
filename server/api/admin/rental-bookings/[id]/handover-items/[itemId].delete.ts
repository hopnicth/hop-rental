import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  assertHandoverEditable,
  loadHandoverBooking,
  loadHandoverItems,
} from "~~/server/utils/admin-booking-handover-items";
import type { AdminBookingHandoverItemsResponse } from "~~/app/types/admin-booking-handover-items";

export default defineEventHandler(
  async (event): Promise<AdminBookingHandoverItemsResponse> => {
    const { adminClient, userId } = await requirePlatformAdmin(event);
    const bookingId = getRouterParam(event, "id");
    const itemId = getRouterParam(event, "itemId");
    if (!bookingId || !itemId) {
      throw createError({ statusCode: 400, statusMessage: "Missing route params" });
    }

    const booking = await loadHandoverBooking(adminClient, bookingId);
    assertHandoverEditable(booking);
    const { data, error } = await adminClient
      .from("rental_booking_handover_items")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by_user_id: userId,
      })
      .eq("id", itemId)
      .eq("booking_id", bookingId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw createError({ statusCode: 500, statusMessage: error.message });
    if (!data) throw createError({ statusCode: 404, statusMessage: "Handover item not found" });

    const items = await loadHandoverItems(adminClient, bookingId);
    return { items, bookingStatus: booking.status, editable: true };
  },
);
