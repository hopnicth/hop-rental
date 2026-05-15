import { getRouterParam } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getMixedCheckoutUserId } from "~~/server/utils/mixed-checkout";
import { deleteDraftRentalBooking } from "~~/server/utils/rental-booking-draft-delete";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  const userId = getMixedCheckoutUserId(user);
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "booking id is required" });
  }

  return deleteDraftRentalBooking({
    client: serverSupabaseServiceRole(event),
    bookingId,
    userId,
  });
});