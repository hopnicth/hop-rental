import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  HANDOVER_ITEM_SELECT,
  assertHandoverEditable,
  generatedItemName,
  loadHandoverBooking,
  loadHandoverItems,
  mapHandoverItem,
} from "~~/server/utils/admin-booking-handover-items";
import type { GenerateBookingHandoverItemsResponse } from "~~/app/types/admin-booking-handover-items";

export default defineEventHandler(
  async (event): Promise<GenerateBookingHandoverItemsResponse> => {
    const { adminClient, userId } = await requirePlatformAdmin(event);
    const bookingId = getRouterParam(event, "id");
    if (!bookingId) {
      throw createError({ statusCode: 400, statusMessage: "Booking id is required" });
    }

    const booking = await loadHandoverBooking(adminClient, bookingId);
    assertHandoverEditable(booking);
    const existing = await loadHandoverItems(adminClient, bookingId);
    if (existing.length > 0) {
      return {
        status: "already_exists",
        item: null,
        items: existing,
        bookingStatus: booking.status,
        editable: true,
      };
    }

    const { data, error } = await adminClient
      .from("rental_booking_handover_items")
      .insert({
        booking_id: bookingId,
        asset_id: booking.asset_id,
        item_name: generatedItemName(booking),
        quantity_prepared: 1,
        sort_order: 0,
        created_by_user_id: userId,
        updated_by_user_id: userId,
      })
      .select(HANDOVER_ITEM_SELECT)
      .single();
    if (error) throw createError({ statusCode: 500, statusMessage: error.message });

    const item = mapHandoverItem(data);
    const items = await loadHandoverItems(adminClient, bookingId);
    return {
      status: "created",
      item,
      items,
      bookingStatus: booking.status,
      editable: true,
    };
  },
);
