import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_RENTAL_BOOKING_DETAIL_SELECT,
  RENTAL_BOOKING_STATUS_TRANSITIONS,
  fetchAdminCustomerProfile,
  mapAdminRentalBookingDetail,
} from "~~/server/utils/admin-orders";
import {
  assertRentalBookingAvailability,
  isRentalBookingConflictError,
  throwRentalBookingConflict,
} from "~~/server/utils/rental-booking-availability";
import type {
  AdminRentalBookingDetail,
  AdminRentalBookingPatchPayload,
} from "~~/app/types/admin-order-detail";
import type { RentalBookingStatus } from "~~/app/types/rental-booking";

export default defineEventHandler(
  async (event): Promise<AdminRentalBookingDetail> => {
    const { adminClient } = await requirePlatformAdmin(event);
    const id = getRouterParam(event, "id");

    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Booking id is required",
      });
    }

    const body = (await readBody<AdminRentalBookingPatchPayload>(event)) ?? {};

    if (body.status === undefined) {
      throw createError({
        statusCode: 400,
        statusMessage: "No updatable fields supplied",
      });
    }

    const { data: current, error: currentError } = await adminClient
      .from("rental_bookings")
      .select("status, asset_id, sku_id, start_date, end_date")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      throw createError({
        statusCode: 500,
        statusMessage: currentError.message,
      });
    }
    if (!current) {
      throw createError({
        statusCode: 404,
        statusMessage: "Rental booking not found",
      });
    }

    const from = current.status as RentalBookingStatus;
    const to = body.status;
    if (from !== to) {
      const allowed = RENTAL_BOOKING_STATUS_TRANSITIONS[from] ?? [];
      if (!allowed.includes(to)) {
        throw createError({
          statusCode: 422,
          statusMessage: `Invalid rental status transition: ${from} → ${to}`,
        });
      }
    }

    if (to === "confirmed") {
      await assertRentalBookingAvailability(adminClient, {
        assetId: current.asset_id as string | null,
        skuId: current.sku_id as string | null,
        startDate: current.start_date,
        endDate: current.end_date,
        excludeBookingId: id,
      });
    }

    const { data: updated, error: updateError } = await adminClient
      .from("rental_bookings")
      .update({ status: to })
      .eq("id", id)
      .select(ADMIN_RENTAL_BOOKING_DETAIL_SELECT)
      .single();

    if (updateError) {
      if (isRentalBookingConflictError(updateError)) {
        throwRentalBookingConflict();
      }
      throw createError({
        statusCode: 500,
        statusMessage: updateError.message,
      });
    }

    const customer = await fetchAdminCustomerProfile(
      adminClient,
      String((updated as Record<string, unknown>).user_id ?? ""),
    );

    return mapAdminRentalBookingDetail(updated, customer);
  },
);
