import { createError, defineEventHandler, getQuery, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { loadAdminRentalPrintFormData } from "~~/server/utils/admin-rental-print-form-loader";
import type {
  AdminRentalPrintFormPayload,
  AdminRentalPrintFormType,
} from "~~/app/types/admin-rental-print-form";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export default defineEventHandler(
  async (event): Promise<AdminRentalPrintFormPayload> => {
    const { adminClient } = await requirePlatformAdmin(event);
    const bookingId = getRouterParam(event, "id");
    const type = asString(
      getQuery(event).type,
    ) as AdminRentalPrintFormType | null;

    if (!bookingId)
      throw createError({
        statusCode: 400,
        statusMessage: "Booking id is required",
      });
    if (type !== "pickup" && type !== "return") {
      throw createError({
        statusCode: 400,
        statusMessage: "type must be pickup or return",
      });
    }

    return (
      await loadAdminRentalPrintFormData({ adminClient, bookingId, type })
    ).payload;
  },
);
