import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  BOOKING_DOCS_BUCKET,
  loadBookingOpsPayload,
} from "~~/server/utils/admin-bookings-ops";
import type { AdminBookingOpsPayload } from "~~/app/types/admin-booking-ops";

export default defineEventHandler(
  async (event): Promise<AdminBookingOpsPayload> => {
    const { adminClient } = await requirePlatformAdmin(event);
    const bookingId = getRouterParam(event, "id");
    const checklistId = getRouterParam(event, "checklistId");
    if (!bookingId || !checklistId) {
      throw createError({ statusCode: 400, statusMessage: "Missing route params" });
    }

    // Collect any photo paths for cleanup based on storage prefix.
    const prefix = `bookings/${bookingId}/checklists/${checklistId}/`;
    const { data: listed } = await adminClient.storage
      .from(BOOKING_DOCS_BUCKET)
      .list(prefix, { limit: 1000 });
    if (Array.isArray(listed) && listed.length > 0) {
      const paths = listed
        .map((entry) => `${prefix}${entry.name}`)
        .filter((p) => !p.endsWith("/"));
      if (paths.length > 0) {
        await adminClient.storage.from(BOOKING_DOCS_BUCKET).remove(paths);
      }
    }

    const { error } = await adminClient
      .from("rental_booking_checklists")
      .delete()
      .eq("id", checklistId)
      .eq("booking_id", bookingId);
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }

    const { data: bookingRow } = await adminClient
      .from("rental_bookings")
      .select("asset_id")
      .eq("id", bookingId)
      .maybeSingle();
    const assetId = (bookingRow as { asset_id: string | null } | null)?.asset_id ?? null;

    return await loadBookingOpsPayload(adminClient, bookingId, assetId);
  },
);
