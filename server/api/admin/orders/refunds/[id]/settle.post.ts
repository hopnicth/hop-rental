/**
 * POST /api/admin/orders/refunds/:id/settle
 *
 * Settles or fails a sale_order_refunds row (ruling-3 state machine:
 * pending → settled/failed). 'settled' requires transfer reference + slip
 * evidence (RPC-enforced + CHECK backstop); 'failed' requires a reason.
 * §F: operation='refund_mark_refunded' logged (allowed fail-closed).
 *
 * Body: { outcome: 'settled'|'failed', manualTransferReference?,
 *         slipStorageBucket?, slipStoragePath?, failedReason? }
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
import { settleSaleOrderRefund } from "~~/server/utils/admin-sale-order-cancel";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } = await requirePlatformAdmin(event);
  const body =
    (await readBody<{
      outcome?: string;
      manualTransferReference?: string;
      slipStorageBucket?: string;
      slipStoragePath?: string;
      failedReason?: string;
    }>(event)) ?? {};
  return settleSaleOrderRefund({
    client: adminClient,
    rawRefundId: getRouterParam(event, "id"),
    actorUserId: userId,
    actorRole: platformRole,
    outcome: body.outcome,
    manualTransferReference: body.manualTransferReference,
    slipStorageBucket: body.slipStorageBucket,
    slipStoragePath: body.slipStoragePath,
    failedReason: body.failedReason,
    ipAddress: getRequestIP(event, { xForwardedFor: true }) ?? null,
    userAgent: getHeader(event, "user-agent") ?? null,
  });
});
