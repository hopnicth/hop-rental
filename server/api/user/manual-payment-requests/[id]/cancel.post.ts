/**
 * POST /api/user/manual-payment-requests/:id/cancel
 *
 * Customer cancels a payment request that is still awaiting payment (no slip
 * uploaded yet). Once a slip is uploaded (pending_review) it can no longer be
 * cancelled by the customer — staff handle it. Cancelling the request does NOT
 * cancel the underlying sale order or booking.
 *
 * Auth:    serverSupabaseUser + ownership.
 * Returns: { status: 'cancelled' }
 * Errors:  400 | 401 | 403 | 404 | 422 | 500
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { asUuidOrNull } from "~~/server/utils/manual-payment-request-slip-evidence";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const id = asUuidOrNull(getRouterParam(event, "id"));
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "INVALID_PAYMENT_REQUEST_ID",
    });
  }

  const client = serverSupabaseServiceRole(event);
  const { data: request, error } = await client
    .from("manual_payment_requests")
    .select("id, customer_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "PAYMENT_REQUEST_READ_FAILED",
    });
  }
  if (!request) {
    throw createError({
      statusCode: 404,
      statusMessage: "Payment request not found",
    });
  }
  if (String(request.customer_id ?? "") !== String(userId)) {
    throw createError({ statusCode: 403, statusMessage: "Access denied" });
  }
  if (String(request.status ?? "") !== "awaiting_payment") {
    throw createError({
      statusCode: 422,
      statusMessage: "PAYMENT_REQUEST_NOT_CANCELLABLE",
    });
  }

  const { error: updateError } = await client
    .from("manual_payment_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "awaiting_payment");
  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message });
  }

  return { status: "cancelled" };
});
