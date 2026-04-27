import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { loadBookingOpsPayload } from "~~/server/utils/admin-bookings-ops";
import type {
  AdminBookingOpsPayload,
  RentalChecklistStatus,
  UpdateChecklistPayload,
} from "~~/app/types/admin-booking-ops";

const VALID_STATUSES: RentalChecklistStatus[] = [
  "draft",
  "in_progress",
  "completed",
  "cancelled",
];

export default defineEventHandler(
  async (event): Promise<AdminBookingOpsPayload> => {
    const { adminClient, userId } = await requirePlatformAdmin(event);
    const bookingId = getRouterParam(event, "id");
    const checklistId = getRouterParam(event, "checklistId");
    if (!bookingId || !checklistId) {
      throw createError({ statusCode: 400, statusMessage: "Missing route params" });
    }

    const body = (await readBody<UpdateChecklistPayload>(event)) ?? {};
    const update: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        throw createError({
          statusCode: 400,
          statusMessage: `Invalid status: ${body.status}`,
        });
      }
      update.status = body.status;
      const now = new Date().toISOString();
      if (body.status === "in_progress") {
        update.started_at = now;
      }
      if (body.status === "completed") {
        update.completed_at = now;
        update.completed_by_user_id = userId;
      }
    }

    if (body.notes !== undefined) {
      update.notes =
        typeof body.notes === "string" ? body.notes.trim() || null : null;
    }

    if (Object.keys(update).length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: "No updatable fields supplied",
      });
    }

    const { error } = await adminClient
      .from("rental_booking_checklists")
      .update(update)
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
