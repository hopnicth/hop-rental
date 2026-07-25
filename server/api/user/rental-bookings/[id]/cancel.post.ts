import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getMixedCheckoutUserId } from "~~/server/utils/mixed-checkout";
import { cancelCustomerRentalBooking } from "~~/server/utils/rental-booking-cancellation";
import {
  cancelRentalBookingLaunch,
  type LaunchCancelClient,
} from "~~/server/utils/rental-booking-launch-cancel";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  const userId = getMixedCheckoutUserId(user);
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({
      statusCode: 400,
      statusMessage: "booking id is required",
    });
  }
  if (!UUID_RE.test(bookingId)) {
    throw createError({
      statusCode: 400,
      statusMessage: "booking id is invalid",
    });
  }

  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  const client = serverSupabaseServiceRole(event);

  // [K-1 / mig 145] REGIME BRANCH, data-driven so it is revival-safe.
  // A booking with a PAID booking deposit belongs to the deposit-era refund
  // flow (still the code below; its RPC is gated by 135 until deposits are
  // revived). Everything else is a LAUNCH booking: free, so cancelling is a
  // pure slot release with no refund, no forfeiture and no document.
  const { data: bookingRow, error: bookingError } = await client
    .from("rental_bookings")
    .select("id, booking_deposit_payment_status")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) {
    throw createError({ statusCode: 500, statusMessage: bookingError.message });
  }
  if (!bookingRow) {
    throw createError({ statusCode: 404, statusMessage: "ไม่พบรายการเช่านี้" });
  }
  const hasPaidDeposit =
    String(
      (bookingRow as Record<string, unknown>).booking_deposit_payment_status ?? "",
    ) === "paid";

  if (!hasPaidDeposit) {
    return cancelRentalBookingLaunch({
      client: client as unknown as LaunchCancelClient,
      rawBookingId: bookingId,
      actorUserId: userId,
      actorRole: "customer",
      initiator: "customer",
      source: "customer_web",
      reason: body.reason ?? "ลูกค้ายกเลิกการจองผ่านเว็บไซต์",
      requireOwnerUserId: userId,
    });
  }

  return cancelCustomerRentalBooking({
    client,
    bookingId,
    userId,
    body,
    preferTransactionalRpc: true,
  });
});
