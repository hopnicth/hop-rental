/**
 * GET /api/admin/manual-payment-requests/:id/slips/:slipId/download
 *
 * Staff/admin access to a slip file via a SHORT-LIVED signed URL (server proxy).
 * There is no public URL for these private PII files.
 *
 * Auth:    requirePlatformAdmin.
 * Returns: { signedUrl, expiresIn, mimeType, originalFilename }
 * Errors:  400 | 401 | 403 | 404 | 500
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  createManualPaymentSlipSignedUrl,
  MANUAL_PAYMENT_SLIP_DOWNLOAD_SELECT,
  MANUAL_PAYMENT_SLIP_SIGNED_URL_TTL_SECONDS,
  asUuidOrNull,
  type ManualPaymentSlipClient,
} from "~~/server/utils/manual-payment-request-slip-evidence";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const paymentRequestId = asUuidOrNull(getRouterParam(event, "id"));
  const slipId = asUuidOrNull(getRouterParam(event, "slipId"));
  if (!paymentRequestId || !slipId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_ID" });
  }

  const { data: slip, error } = await adminClient
    .from("manual_payment_request_slips")
    .select(MANUAL_PAYMENT_SLIP_DOWNLOAD_SELECT)
    .eq("id", slipId)
    .maybeSingle();
  if (error) {
    throw createError({ statusCode: 500, statusMessage: "SLIP_READ_FAILED" });
  }
  if (!slip || String(slip.payment_request_id ?? "") !== paymentRequestId) {
    throw createError({ statusCode: 404, statusMessage: "Slip not found" });
  }

  const signedUrl = await createManualPaymentSlipSignedUrl(
    adminClient as unknown as ManualPaymentSlipClient,
    String(slip.storage_path),
  );

  return {
    signedUrl,
    expiresIn: MANUAL_PAYMENT_SLIP_SIGNED_URL_TTL_SECONDS,
    mimeType: String(slip.mime_type ?? ""),
    originalFilename:
      typeof slip.original_filename === "string"
        ? slip.original_filename
        : null,
  };
});
