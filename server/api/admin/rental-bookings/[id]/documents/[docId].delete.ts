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
    const docId = getRouterParam(event, "docId");
    if (!bookingId || !docId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing route params",
      });
    }

    const { data: existing, error: fetchErr } = await adminClient
      .from("rental_booking_documents")
      .select("id, storage_bucket, storage_path")
      .eq("id", docId)
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (fetchErr) {
      throw createError({ statusCode: 500, statusMessage: fetchErr.message });
    }
    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: "Document not found",
      });
    }

    const bucket =
      (existing as { storage_bucket: string | null }).storage_bucket ||
      BOOKING_DOCS_BUCKET;
    const path = (existing as { storage_path: string | null }).storage_path;
    if (path) {
      await adminClient.storage.from(bucket).remove([path]);
    }

    const { error: delErr } = await adminClient
      .from("rental_booking_documents")
      .delete()
      .eq("id", docId)
      .eq("booking_id", bookingId);
    if (delErr) {
      throw createError({ statusCode: 500, statusMessage: delErr.message });
    }

    const { data: bookingRow } = await adminClient
      .from("rental_bookings")
      .select("asset_id")
      .eq("id", bookingId)
      .maybeSingle();
    const assetId =
      (bookingRow as { asset_id: string | null } | null)?.asset_id ?? null;

    return await loadBookingOpsPayload(adminClient, bookingId, assetId);
  },
);
