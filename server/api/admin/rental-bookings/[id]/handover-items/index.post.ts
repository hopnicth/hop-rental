import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  HANDOVER_ITEM_SELECT,
  assertHandoverEditable,
  buildHandoverWritePayload,
  loadHandoverBooking,
  loadHandoverItems,
  mapHandoverItem,
} from "~~/server/utils/admin-booking-handover-items";
import type {
  AdminBookingHandoverItemsResponse,
  CreateBookingHandoverItemPayload,
} from "~~/app/types/admin-booking-handover-items";

type CreateResponse = AdminBookingHandoverItemsResponse & {
  item: ReturnType<typeof mapHandoverItem>;
};

export default defineEventHandler(async (event): Promise<CreateResponse> => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "Booking id is required" });
  }

  const booking = await loadHandoverBooking(adminClient, bookingId);
  assertHandoverEditable(booking);
  const body = (await readBody<CreateBookingHandoverItemPayload>(event)) ?? {};
  const payload = buildHandoverWritePayload(body, {
    requireNameAndQty: true,
    userId,
  });

  const { data, error } = await adminClient
    .from("rental_booking_handover_items")
    .insert({
      ...payload,
      booking_id: bookingId,
      created_by_user_id: userId,
    })
    .select(HANDOVER_ITEM_SELECT)
    .single();
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });

  const item = mapHandoverItem(data);
  const items = await loadHandoverItems(adminClient, bookingId);
  return { item, items, bookingStatus: booking.status, editable: true };
});
