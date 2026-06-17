/**
 * GET /api/user/manual-payment-requests/active-booking-ids
 *
 * Return the rental booking IDs covered by this customer's active
 * (awaiting_payment | pending_review) manual payment requests. The cart uses
 * this list to hide draft bookings that have already been handed off to a
 * payment request, preventing the customer from re-submitting them.
 *
 * Auth:    serverSupabaseUser (owner-scoped).
 * Returns: { bookingIds: string[] }
 * Errors:  401 | 500
 */
import { createError, defineEventHandler } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";

// Statuses where a booking is "claimed" by a payment request and must be hidden
// from the cart. This differs from REQUEST_ACTIVE_STATUSES in manual-payment-request.ts
// (which only covers statuses where the customer can still interact). We include
// "reviewed" because the admin has verified the payment but not yet confirmed the
// booking — the booking stays draft during that window and must remain hidden.
const CART_BLOCKING_STATUSES = [
  "awaiting_payment",
  "pending_review",
  "reviewed",
] as const;

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const client = serverSupabaseServiceRole(event);

  const { data: requests, error: reqError } = await client
    .from("manual_payment_requests")
    .select("id")
    .eq("customer_id", String(userId))
    .in("status", [...CART_BLOCKING_STATUSES]);

  if (reqError) {
    throw createError({
      statusCode: 500,
      statusMessage: "PAYMENT_REQUEST_QUERY_FAILED",
    });
  }

  const requestIds = ((requests ?? []) as Record<string, unknown>[])
    .map((r) => String(r.id ?? ""))
    .filter(Boolean);

  if (requestIds.length === 0) {
    return { bookingIds: [] };
  }

  const { data: items, error: itemsError } = await client
    .from("manual_payment_request_items")
    .select("target_id")
    .in("payment_request_id", requestIds)
    .eq("target_type", "rental_booking_deposit");

  if (itemsError) {
    throw createError({
      statusCode: 500,
      statusMessage: "PAYMENT_REQUEST_ITEMS_QUERY_FAILED",
    });
  }

  const bookingIds = ((items ?? []) as Record<string, unknown>[])
    .map((r) => String(r.target_id ?? ""))
    .filter(Boolean);

  return { bookingIds };
});
