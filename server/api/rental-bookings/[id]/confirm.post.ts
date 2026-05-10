import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  assertRentalBookingAvailability,
  isRentalBookingConflictError,
  throwRentalBookingConflict,
} from "~~/server/utils/rental-booking-availability";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Booking id is required",
    });
  }

  const adminClient = serverSupabaseServiceRole(event);
  const { data: current, error: currentError } = await adminClient
    .from("rental_bookings")
    .select(
      "id, user_id, status, asset_id, sku_id, start_date, end_date, hub_id",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (currentError) {
    throw createError({ statusCode: 500, statusMessage: currentError.message });
  }
  if (!current) {
    throw createError({
      statusCode: 404,
      statusMessage: "Rental booking not found",
    });
  }
  if (String(current.user_id ?? "") !== String(userId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Booking access denied",
    });
  }
  if (current.status !== "draft") {
    throw createError({
      statusCode: 422,
      statusMessage: "Only draft bookings can be confirmed",
    });
  }
  if (!current.hub_id) {
    throw createError({
      statusCode: 422,
      statusMessage: "Pickup hub is required",
    });
  }

  await assertRentalBookingAvailability(adminClient, {
    assetId: current.asset_id as string | null,
    skuId: current.sku_id as string | null,
    startDate: current.start_date,
    endDate: current.end_date,
    excludeBookingId: bookingId,
  });

  const { data: updated, error: updateError } = await adminClient
    .from("rental_bookings")
    .update({ status: "confirmed" })
    .eq("id", bookingId)
    .eq("status", "draft")
    .select("*")
    .maybeSingle();

  if (updateError) {
    if (isRentalBookingConflictError(updateError)) {
      throwRentalBookingConflict();
    }
    throw createError({ statusCode: 500, statusMessage: updateError.message });
  }
  if (!updated) {
    throw createError({
      statusCode: 409,
      statusMessage: "Booking is no longer available for confirmation",
    });
  }

  return { booking: updated };
});
