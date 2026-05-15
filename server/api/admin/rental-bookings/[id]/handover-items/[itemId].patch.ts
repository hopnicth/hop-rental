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
  UpdateBookingHandoverItemPayload,
} from "~~/app/types/admin-booking-handover-items";

type UpdateResponse = AdminBookingHandoverItemsResponse & {
  item: ReturnType<typeof mapHandoverItem>;
};

export default defineEventHandler(async (event): Promise<UpdateResponse> => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  const itemId = getRouterParam(event, "itemId");
  if (!bookingId || !itemId) {
    throw createError({ statusCode: 400, statusMessage: "Missing route params" });
  }

  const booking = await loadHandoverBooking(adminClient, bookingId);
  assertHandoverEditable(booking);
  const body = (await readBody<UpdateBookingHandoverItemPayload>(event)) ?? {};
  const payload = buildHandoverWritePayload(body, {
    requireNameAndQty: false,
    userId,
  });

  const { data, error } = await adminClient
    .from("rental_booking_handover_items")
    .update(payload)
    .eq("id", itemId)
    .eq("booking_id", bookingId)
    .is("deleted_at", null)
    .select(HANDOVER_ITEM_SELECT)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data) throw createError({ statusCode: 404, statusMessage: "Handover item not found" });

  const item = mapHandoverItem(data);
  const items = await loadHandoverItems(adminClient, bookingId);
  return { item, items, bookingStatus: booking.status, editable: true };
});
