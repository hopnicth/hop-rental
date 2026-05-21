import { createError, defineEventHandler, getRouterParam, setHeader } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getMixedCheckoutUserId } from "~~/server/utils/mixed-checkout";

/**
 * GET /api/assets/:assetId/booking-blocks
 *
 * Returns blocking booking date ranges for an asset so the Online booking
 * calendar can shade unavailable dates before the customer reaches checkout.
 *
 * Auth: any authenticated user (customer session is sufficient).
 * Privacy: only date/status fields are returned — no booking IDs, user IDs,
 * customer data, prices, payment info, or internal notes are exposed.
 *
 * Statuses returned: confirmed, picked_up (same as checkout availability guard).
 */

const BLOCKING_ONLINE_STATUSES = ["confirmed", "picked_up"] as const;

type BookingBlockRow = {
  asset_id: string;
  start_date: string;
  end_date: string;
  status: string;
};

export default defineEventHandler(async (event) => {
  // Require an authenticated user — no admin role needed.
  const user = await serverSupabaseUser(event);
  const userId = getMixedCheckoutUserId(user);
  if (!userId)
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });

  setHeader(event, "cache-control", "no-store");

  const assetId = getRouterParam(event, "assetId") ?? "";
  if (!assetId)
    throw createError({
      statusCode: 400,
      statusMessage: "assetId is required",
    });

  const client = serverSupabaseServiceRole(event);
  const { data, error } = await client
    .from("rental_bookings")
    .select("asset_id, start_date, end_date, status")
    .eq("asset_id", assetId)
    .in("status", [...BLOCKING_ONLINE_STATUSES])
    .order("start_date", { ascending: true })
    .limit(500);

  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });

  return {
    items: ((data ?? []) as BookingBlockRow[]).map((row) => ({
      // assetId is included so RentalBookingCalendar.relevantBookings can
      // match bookings against the calendar's assetKey. The value is the same
      // public identifier the customer already knows from the URL/page.
      assetId: row.asset_id,
      startDate: row.start_date,
      // returnDate maps to end_date (the exclusive end boundary used by the DB
      // half-open interval). This matches the POS booking-blocks shape and the
      // RentalCalendarBlockingBooking.returnDate field.
      returnDate: row.end_date,
      status: row.status,
      // NOT included: booking id, customer identity, sku, hub, pricing,
      // deposit, payment method, notes, or any customer-identifying fields.
    })),
  };
});
