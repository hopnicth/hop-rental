/**
 * POST /api/admin/manual-payment-requests/:id/reject
 *
 * Reject the payment EVIDENCE (request.status = rejected + reason, latest pending
 * slip → rejected). Does NOT cancel the underlying sale order / booking; the
 * customer can upload a new slip (rejected is an uploadable state).
 *
 * Auth:    requirePlatformAdmin.
 * Body:    { reason: string }  (required)
 * Returns: { paymentRequest }
 * Errors:  400 | 401 | 403 | 404 | 500
 */
import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { rejectManualPaymentRequest } from "~~/server/utils/manual-payment-request";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const id = getRouterParam(event, "id");
  const body = (await readBody(event).catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!reason.trim()) {
    throw createError({ statusCode: 400, statusMessage: "REJECT_REASON_REQUIRED" });
  }

  const paymentRequest = await rejectManualPaymentRequest(
    adminClient,
    String(id ?? ""),
    String(userId),
    reason,
  );
  return { paymentRequest };
});
