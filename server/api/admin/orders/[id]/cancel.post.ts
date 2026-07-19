/**
 * POST /api/admin/orders/:id/cancel
 *
 * The ONLY sale-order cancel path (T3 walk 4 — the raw status flip in
 * [id].patch.ts is retired). §F inversion: requirePlatformAdmin here, the
 * explicit super_admin check in the util so staff denials are LOGGED to
 * money_ops_decision_logs before the 403. Paid orders require the
 * customer's bank details (refund record, RPC-derived amount).
 *
 * Body: { reason, refundBankName?, refundBankAccountNumber?,
 *         refundBankAccountName?, refundContactPhone? }
 * Errors: 403 | 404 | 409 | 422 | 500
 */
import {
  defineEventHandler,
  getHeader,
  getRequestIP,
  getRouterParam,
  readBody,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { cancelSaleOrder } from "~~/server/utils/admin-sale-order-cancel";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } = await requirePlatformAdmin(event);
  const body =
    (await readBody<{
      reason?: string;
      refundBankName?: string;
      refundBankAccountNumber?: string;
      refundBankAccountName?: string;
      refundContactPhone?: string;
    }>(event)) ?? {};
  return cancelSaleOrder({
    client: adminClient,
    rawOrderId: getRouterParam(event, "id"),
    actorUserId: userId,
    actorRole: platformRole,
    reason: body.reason,
    refundBankName: body.refundBankName,
    refundBankAccountNumber: body.refundBankAccountNumber,
    refundBankAccountName: body.refundBankAccountName,
    refundContactPhone: body.refundContactPhone,
    ipAddress: getRequestIP(event, { xForwardedFor: true }) ?? null,
    userAgent: getHeader(event, "user-agent") ?? null,
  });
});
