/**
 * GET /api/user/manual-payment-requests/by-target
 *
 * Look up the customer's related payment request for a given target (sale order
 * or rental booking deposit) so the order/rental detail pages can show a small
 * "related payment request" card/link without duplicating the central upload UX.
 *
 * Auth:    serverSupabaseUser (owner-scoped).
 * Query:   target_type = sale_order | rental_booking_deposit ; target_id = uuid
 * Returns: { request: { id, status, sourceType, totalAmountDue, currency, link } | null }
 * Errors:  400 | 401 | 500
 */
import { createError, defineEventHandler, getQuery } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { findCustomerRequestByTarget } from "~~/server/utils/manual-payment-request";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const q = getQuery(event);
  const targetType = q.target_type === "rental_booking_deposit"
    ? "rental_booking_deposit"
    : q.target_type === "sale_order"
      ? "sale_order"
      : null;
  const targetId = typeof q.target_id === "string" ? q.target_id : "";
  if (!targetType || !targetId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_TARGET" });
  }

  const client = serverSupabaseServiceRole(event);
  const request = await findCustomerRequestByTarget(
    client,
    String(userId),
    targetType,
    targetId,
  );
  return { request };
});
