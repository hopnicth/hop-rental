import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_RENTAL_BOOKING_DETAIL_SELECT,
  fetchAdminCustomerProfile,
  mapAdminRentalBookingDetail,
} from "~~/server/utils/admin-orders";
import type { AdminRentalBookingDetail } from "~~/app/types/admin-order-detail";

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

    const { data: row, error } = await adminClient
      .from("rental_bookings")
      .select(ADMIN_RENTAL_BOOKING_DETAIL_SELECT)
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

    const customer = await fetchAdminCustomerProfile(
      adminClient,
      String((row as Record<string, unknown>).user_id ?? ""),
    );

    return mapAdminRentalBookingDetail(row, customer);
  },
);
