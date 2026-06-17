/**
 * POST /api/user/manual-payment-requests
 *
 * Create (or reuse) ONE central manual payment request from the checkout targets
 * the cart already created: an unpaid sale order and/or draft rental booking(s).
 * Computes authoritative amounts server-side, creates the request + allocation
 * items, and returns the id so the customer can be routed to
 * `/user/payments/[paymentRequestId]`.
 *
 * Auth:    serverSupabaseUser + ownership on the order and every booking.
 * Body:    { orderId?: string, bookingIds?: string[], customerNote?: string }
 * Returns: { paymentRequestId: string, reused: boolean, redirectTo: string }
 * Errors:  400 | 401 | 403 | 404 | 422 | 500
 *
 * EVIDENCE ONLY. The sale order stays unpaid/awaiting_payment, bookings stay
 * draft (not confirmed). No inventory deduction, no held balance, no Omise/KYC.
 */
import { createError, defineEventHandler, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { createManualPaymentRequestFromTargets } from "~~/server/utils/manual-payment-request";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const orderId = typeof body.orderId === "string" ? body.orderId : null;
  const bookingIds = Array.isArray(body.bookingIds)
    ? body.bookingIds.filter((b): b is string => typeof b === "string")
    : [];
  const customerNote =
    typeof body.customerNote === "string" ? body.customerNote : null;

  const client = serverSupabaseServiceRole(event);
  const { paymentRequestId, reused } =
    await createManualPaymentRequestFromTargets(client, {
      userId: String(userId),
      orderId,
      bookingIds,
      customerNote,
    });

  return {
    paymentRequestId,
    reused,
    redirectTo: `/user/payments/${paymentRequestId}`,
  };
});
