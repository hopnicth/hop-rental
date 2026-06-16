/**
 * GET /api/admin/orders/:id/payment-slips/:slipId/signed-url
 *
 * Mint a SHORT-LIVED signed URL for one stored sale payment slip so an admin
 * can view the bank-transfer evidence. The only sanctioned way to view a slip —
 * the bucket is private and there is no permanent public URL.
 *
 * Auth:    requirePlatformAdmin (staff + super_admin).
 * Guard:   the slip must belong to the order in the path (else 404).
 * Returns: { url: string, ttlSeconds: number }
 * Errors:  400 | 401 | 403 | 404 | 500
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  SALE_ORDER_PAYMENT_SLIP_DOWNLOAD_SELECT,
  SALE_ORDER_PAYMENT_SLIP_SIGNED_URL_TTL_SECONDS,
  asUuidOrNull,
  createSaleOrderPaymentSlipSignedUrl,
  type SaleOrderPaymentSlipClient,
} from "~~/server/utils/sale-order-payment-slip-evidence";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);

  const orderId = asUuidOrNull(getRouterParam(event, "id"));
  const slipId = asUuidOrNull(getRouterParam(event, "slipId"));
  if (!orderId || !slipId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_ID" });
  }

  const { data: slip, error } = await adminClient
    .from("sale_order_payment_slips")
    .select(SALE_ORDER_PAYMENT_SLIP_DOWNLOAD_SELECT)
    .eq("id", slipId)
    .maybeSingle();
  if (error) {
    console.error("[orders] payment slip read failed", error.message);
    throw createError({
      statusCode: 500,
      statusMessage: "PAYMENT_SLIP_READ_FAILED",
    });
  }
  if (!slip || String(slip.order_id ?? "") !== orderId) {
    throw createError({ statusCode: 404, statusMessage: "Slip not found" });
  }

  const storagePath = String(slip.storage_path ?? "");
  if (!storagePath) {
    throw createError({
      statusCode: 500,
      statusMessage: "PAYMENT_SLIP_PATH_MISSING",
    });
  }

  const url = await createSaleOrderPaymentSlipSignedUrl(
    adminClient as unknown as SaleOrderPaymentSlipClient,
    storagePath,
  );

  return { url, ttlSeconds: SALE_ORDER_PAYMENT_SLIP_SIGNED_URL_TTL_SECONDS };
});
