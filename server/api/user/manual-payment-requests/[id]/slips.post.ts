/**
 * POST /api/user/manual-payment-requests/:id/slips
 *
 * Customer uploads ONE bank-transfer slip as evidence for a manual payment
 * request. Verifies ownership + uploadable state, validates the file
 * (type/size/magic-bytes), stores it in the PRIVATE bucket, inserts one slip
 * row, and advances the request to `pending_review` (submitted_at set).
 *
 * Auth:    serverSupabaseUser + ownership (request.customer_id === session user).
 * Input:   multipart/form-data — one file part.
 * Returns: { status, slip, slips }
 * Errors:  400 | 401 | 403 | 404 | 413 | 415 | 422 | 500
 *
 * EVIDENCE ONLY. NEVER marks an order paid, NEVER confirms a booking, NEVER
 * deducts inventory, NEVER writes a held-balance event, NEVER touches Omise/KYC.
 */
import {
  createError,
  defineEventHandler,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  uploadManualPaymentRequestSlipEvidence,
  toSafeManualPaymentSlip,
  MANUAL_PAYMENT_SLIP_SAFE_SELECT,
  asUuidOrNull,
  type ManualPaymentSlipClient,
} from "~~/server/utils/manual-payment-request-slip-evidence";
import { REQUEST_UPLOADABLE_STATUSES } from "~~/server/utils/manual-payment-request";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const paymentRequestId = asUuidOrNull(getRouterParam(event, "id"));
  if (!paymentRequestId) {
    throw createError({
      statusCode: 400,
      statusMessage: "INVALID_PAYMENT_REQUEST_ID",
    });
  }

  const parts = await readMultipartFormData(event);
  const file = parts?.find((p) => p.filename && p.data);
  if (!file?.data) {
    throw createError({ statusCode: 400, statusMessage: "SLIP_FILE_REQUIRED" });
  }

  const client = serverSupabaseServiceRole(event);

  // ── Ownership + eligibility BEFORE any upload ─────────────────────────────
  const { data: request, error: requestError } = await client
    .from("manual_payment_requests")
    .select("id, customer_id, status")
    .eq("id", paymentRequestId)
    .maybeSingle();
  if (requestError) {
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
  if (
    !(REQUEST_UPLOADABLE_STATUSES as readonly string[]).includes(
      String(request.status ?? ""),
    )
  ) {
    throw createError({
      statusCode: 422,
      statusMessage: "PAYMENT_REQUEST_NOT_UPLOADABLE",
    });
  }

  const slip = await uploadManualPaymentRequestSlipEvidence(
    client as unknown as ManualPaymentSlipClient,
    {
      paymentRequestId,
      uploadedBy: String(userId),
      fileBytes: Buffer.from(file.data),
      originalFilename: file.filename,
    },
  );

  // Advance to pending_review (never paid/confirmed). Idempotent on already-pending.
  await client
    .from("manual_payment_requests")
    .update({ status: "pending_review", submitted_at: new Date().toISOString() })
    .eq("id", paymentRequestId);

  const { data: slipRows } = await client
    .from("manual_payment_request_slips")
    .select(MANUAL_PAYMENT_SLIP_SAFE_SELECT)
    .eq("payment_request_id", paymentRequestId)
    .order("uploaded_at", { ascending: false });

  return {
    status: "pending_review",
    slip,
    slips: ((slipRows ?? []) as Record<string, unknown>[]).map(
      toSafeManualPaymentSlip,
    ),
  };
});
