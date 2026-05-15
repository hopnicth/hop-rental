import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { confirmRentalBooking } from "~~/server/utils/rental-booking-confirmation";

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

  const booking = await confirmRentalBooking({
    adminClient: serverSupabaseServiceRole(event),
    bookingId,
    userId,
    requireBookingDepositPaid: true,
  });

  return { booking };
});
