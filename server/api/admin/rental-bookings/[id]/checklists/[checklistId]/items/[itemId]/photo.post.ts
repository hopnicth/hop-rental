import {
  createError,
  defineEventHandler,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  BOOKING_DOCS_BUCKET,
  buildBookingChecklistPhotoPath,
  loadBookingOpsPayload,
} from "~~/server/utils/admin-bookings-ops";
import type { AdminBookingOpsPayload } from "~~/app/types/admin-booking-ops";

const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 15 * 1024 * 1024;

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

export default defineEventHandler(
  async (event): Promise<AdminBookingOpsPayload> => {
    const { adminClient } = await requirePlatformAdmin(event);
    const bookingId = getRouterParam(event, "id");
    const checklistId = getRouterParam(event, "checklistId");
    const itemId = getRouterParam(event, "itemId");
    if (!bookingId || !checklistId || !itemId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing route params",
      });
    }

    const parts = await readMultipartFormData(event);
    const file = parts?.find((part) => part.filename && part.data);
    if (!file?.data) {
      throw createError({
        statusCode: 400,
        statusMessage: "Photo file is required",
      });
    }
    if (!ALLOWED_PHOTO_TYPES.has(file.type || "")) {
      throw createError({
        statusCode: 415,
        statusMessage: "Only JPEG, PNG, or WebP images are accepted",
      });
    }
    const buffer = Buffer.from(file.data);
    if (buffer.byteLength > MAX_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: "Photo must be 15MB or smaller",
      });
    }

    const photoId = crypto.randomUUID();
    const ext = extFromMime(file.type || "");
    const path = buildBookingChecklistPhotoPath(
      bookingId,
      checklistId,
      itemId,
      photoId,
      ext,
    );

    const { error: uploadError } = await adminClient.storage
      .from(BOOKING_DOCS_BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });
    if (uploadError) {
      throw createError({
        statusCode: 500,
        statusMessage: uploadError.message,
      });
    }
    const url = adminClient.storage.from(BOOKING_DOCS_BUCKET).getPublicUrl(path)
      .data.publicUrl;

    const { data: existing, error: getErr } = await adminClient
      .from("rental_booking_checklist_items")
      .select("photo_urls")
      .eq("id", itemId)
      .eq("booking_checklist_id", checklistId)
      .maybeSingle();
    if (getErr) {
      throw createError({ statusCode: 500, statusMessage: getErr.message });
    }
    const existingRow = (existing ?? null) as unknown as {
      photo_urls?: string[] | null;
    } | null;
    const current = Array.isArray(existingRow?.photo_urls)
      ? (existingRow!.photo_urls as string[])
      : [];

    const updatePayload: Record<string, unknown> = {};
    updatePayload.photo_urls = [...current, url];
    const { error: updateErr } = await adminClient
      .from("rental_booking_checklist_items")
      .update(updatePayload as never)
      .eq("id", itemId);
    if (updateErr) {
      throw createError({ statusCode: 500, statusMessage: updateErr.message });
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
