import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { loadBookingOpsPayload } from "~~/server/utils/admin-bookings-ops";
import type { AdminBookingOpsPayload } from "~~/app/types/admin-booking-ops";

export default defineEventHandler(
  async (event): Promise<AdminBookingOpsPayload> => {
    const { adminClient } = await requirePlatformAdmin(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Booking id is required",
      });
    }

    const { data: row, error } = await adminClient
      .from("rental_bookings")
      .select("id, asset_id")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }
    if (!row) {
      throw createError({
        statusCode: 404,
        statusMessage: "Rental booking not found",
      });
    }

    try {
      return await loadBookingOpsPayload(
        adminClient,
        id,
        (row as { asset_id: string | null }).asset_id ?? null,
      );
    } catch (e) {
      throw createError({
        statusCode: 500,
        statusMessage:
          e instanceof Error ? e.message : "Failed to load booking ops",
      });
    }
  },
);
