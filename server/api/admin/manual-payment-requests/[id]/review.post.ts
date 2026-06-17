/**
 * POST /api/admin/manual-payment-requests/:id/review
 *
 * Mark the payment EVIDENCE reviewed (request.status = reviewed, latest pending
 * slip → reviewed). This does NOT mark the sale order paid and does NOT confirm
 * the rental booking — admin still uses the existing sale/rental admin actions
 * (Mark Payment Received / Mark Deposit Received) for business confirmation.
 *
 * Auth:    requirePlatformAdmin.
 * Body:    { adminNote?: string }
 * Returns: { paymentRequest }
 * Errors:  400 | 401 | 403 | 404 | 500
 */
import { defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { reviewManualPaymentRequest } from "~~/server/utils/manual-payment-request";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const id = getRouterParam(event, "id");
  const body = (await readBody(event).catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const adminNote = typeof body.adminNote === "string" ? body.adminNote : null;

  const paymentRequest = await reviewManualPaymentRequest(
    adminClient,
    String(id ?? ""),
    String(userId),
    adminNote,
  );
  return { paymentRequest };
});
