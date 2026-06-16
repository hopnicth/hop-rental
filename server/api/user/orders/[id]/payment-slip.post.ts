/**
 * POST /api/user/orders/:id/payment-slip
 *
 * Customer uploads a bank-transfer payment slip for THEIR OWN sale order
 * (manual bank-transfer flow at launch). Evidence only — this NEVER marks the
 * order paid and NEVER deducts inventory. It moves the order's payment state to
 * 'pending_review' (awaiting staff verification); admin marks it paid later.
 *
 * Auth:    serverSupabaseUser + ownership (order.user_id === session user).
 * Input:   multipart/form-data with one file part (image/jpeg|png or pdf).
 * Returns: { slip, paymentStatus } — never a URL / storage path.
 * Errors:  400 | 401 | 403 | 404 | 413 | 415 | 422 | 500
 *
 * Eligible payment_status: 'awaiting_payment' or 'pending_review' (a pending
 * order). paid / cancelled / refunded / not_applicable are rejected (422).
 * Storage: private sale-order-payment-slips bucket. Never catalog-media.
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
  asUuidOrNull,
  uploadSaleOrderPaymentSlipEvidence,
  type SaleOrderPaymentSlipClient,
} from "~~/server/utils/sale-order-payment-slip-evidence";

/** Payment statuses from which a customer may still upload a slip. */
const SLIP_UPLOAD_ELIGIBLE_PAYMENT_STATUSES = new Set([
  "awaiting_payment",
  "pending_review",
]);

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const orderId = asUuidOrNull(getRouterParam(event, "id"));
  if (!orderId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_ORDER_ID" });
  }

  const client = serverSupabaseServiceRole(event);

  const { data: order, error: orderError } = await client
    .from("orders")
    .select("id, user_id, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) {
    console.error("[orders] slip upload order read failed", orderError.message);
    throw createError({ statusCode: 500, statusMessage: "ORDER_READ_FAILED" });
  }
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }
  if (String(order.user_id ?? "") !== String(userId)) {
    throw createError({ statusCode: 403, statusMessage: "Access denied" });
  }
  if (
    !SLIP_UPLOAD_ELIGIBLE_PAYMENT_STATUSES.has(String(order.payment_status ?? ""))
  ) {
    throw createError({
      statusCode: 422,
      statusMessage: "ORDER_NOT_ELIGIBLE_FOR_SLIP_UPLOAD",
    });
  }

  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.filename && part.data);
  if (!file?.data) {
    throw createError({ statusCode: 400, statusMessage: "SLIP_FILE_REQUIRED" });
  }

  // Validation + private upload + metadata insert (status pending_review).
  // Never marks the order paid; never deducts inventory.
  const slip = await uploadSaleOrderPaymentSlipEvidence(
    client as unknown as SaleOrderPaymentSlipClient,
    {
      orderId,
      uploadedBy: String(userId),
      fileBytes: Buffer.from(file.data),
      originalFilename: file.filename,
    },
  );

  // Move payment state to pending_review (awaiting staff verification). Guarded
  // so it only advances from awaiting_payment — idempotent on re-upload.
  await client
    .from("orders")
    .update({ payment_status: "pending_review" })
    .eq("id", orderId)
    .eq("payment_status", "awaiting_payment");

  return { slip, paymentStatus: "pending_review" };
});
