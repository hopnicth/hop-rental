import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { loadBookingOpsPayload } from "~~/server/utils/admin-bookings-ops";
import type {
  AdminBookingOpsPayload,
  RentalChecklistItemResult,
  UpdateChecklistItemPayload,
} from "~~/app/types/admin-booking-ops";

const VALID_RESULTS: RentalChecklistItemResult[] = [
  "pending",
  "passed",
  "failed",
  "not_applicable",
];

export default defineEventHandler(
  async (event): Promise<AdminBookingOpsPayload> => {
    const { adminClient, userId } = await requirePlatformAdmin(event);
    const bookingId = getRouterParam(event, "id");
    const checklistId = getRouterParam(event, "checklistId");
    const itemId = getRouterParam(event, "itemId");
    if (!bookingId || !checklistId || !itemId) {
      throw createError({ statusCode: 400, statusMessage: "Missing route params" });
    }

    const body = (await readBody<UpdateChecklistItemPayload>(event)) ?? {};
    const update: Record<string, unknown> = {};

    if (body.checked !== undefined) {
      update.checked = body.checked;
    }
    if (body.responseText !== undefined) {
      update.response_text =
        typeof body.responseText === "string"
          ? body.responseText.trim() || null
          : null;
    }
    if (body.responseNumber !== undefined) {
      update.response_number =
        typeof body.responseNumber === "number" &&
        Number.isFinite(body.responseNumber)
          ? body.responseNumber
          : null;
    }
    if (body.resultStatus !== undefined) {
      if (!VALID_RESULTS.includes(body.resultStatus)) {
        throw createError({
          statusCode: 400,
          statusMessage: `Invalid resultStatus: ${body.resultStatus}`,
        });
      }
      update.result_status = body.resultStatus;
    }
    if (body.remark !== undefined) {
      update.remark =
        typeof body.remark === "string" ? body.remark.trim() || null : null;
    }

    if (
      body.checked !== undefined ||
      body.resultStatus !== undefined ||
      body.responseText !== undefined ||
      body.responseNumber !== undefined
    ) {
      update.checked_at = new Date().toISOString();
      update.checked_by_user_id = userId;
    }

    if (body.removePhotoUrl) {
      const { data: existing, error: getErr } = await adminClient
        .from("rental_booking_checklist_items")
        .select("photo_urls")
        .eq("id", itemId)
        .maybeSingle();
      if (getErr) {
        throw createError({ statusCode: 500, statusMessage: getErr.message });
      }
      const current = Array.isArray((existing as { photo_urls?: unknown })?.photo_urls)
        ? ((existing as { photo_urls: string[] }).photo_urls)
        : [];
      update.photo_urls = current.filter((u) => u !== body.removePhotoUrl);
    }

    if (Object.keys(update).length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: "No updatable fields supplied",
      });
    }

    const { error } = await adminClient
      .from("rental_booking_checklist_items")
      .update(update)
      .eq("id", itemId)
      .eq("booking_checklist_id", checklistId);
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
