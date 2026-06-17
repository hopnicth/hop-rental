/**
 * GET /api/user/manual-payment-requests/:id
 *
 * Owner-scoped detail for one manual payment request: header, allocation items,
 * slip history, related sale order / rental booking summaries, and the bank
 * account config (with a placeholder warning flag). Read-only.
 *
 * Auth:    serverSupabaseUser + ownership (request.customer_id === session user).
 * Returns: { paymentRequest, items, slips, saleOrders, bookings, bankAccount }
 * Errors:  400 | 401 | 403 | 404 | 500
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { assembleManualPaymentRequestDetail } from "~~/server/utils/manual-payment-request";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const id = getRouterParam(event, "id");
  const client = serverSupabaseServiceRole(event);
  return assembleManualPaymentRequestDetail(client, String(id ?? ""), {
    ownerUserId: String(userId),
  });
});
