/**
 * Sale-order cancel + refund-settle wrappers (design §A case 4, T3 walk 4).
 *
 * §F inversion on money: endpoints use requirePlatformAdmin; the EXPLICIT
 * super_admin check lives here (inherited contract: order cancel was
 * super_admin-gated at admin/orders/[id].patch.ts:78 before retirement) so
 * staff denials are LOGGED before the 403. Allowed rows fail-closed before
 * the money RPCs (mig 128). Bank details flow to the RPC only — never into
 * the decision log (NO-PII invariant).
 *
 * Money authority: f_cancel_sale_order derives the refund amount
 * (pos_paid_amount > 0 else grand_total); f_settle_sale_order_refund
 * requires transfer reference + slip evidence before 'settled'.
 */
import { createError } from "h3";
import { asUuidOrNull } from "~~/server/utils/kyc-documents";
import { logMoneyOpsDecision } from "~~/server/utils/money-ops-log";

type Row = Record<string, unknown>;
type AnyClient = {
  from(table: string): any;
  rpc?: (
    name: string,
    params: Row,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const ORDER_SELECT =
  "id, user_id, status, payment_status, fulfillment_status, grand_total, pos_paid_amount, currency_code, inventory_applied_at, inventory_restored_at";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function cancelSaleOrder(input: {
  client: AnyClient;
  rawOrderId: unknown;
  actorUserId: string;
  actorRole: string;
  reason: unknown;
  refundBankName?: unknown;
  refundBankAccountNumber?: unknown;
  refundBankAccountName?: unknown;
  refundContactPhone?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const actor = {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  } as const;

  async function deny(
    denialReason: string,
    statusCode: number,
    statusMessage: string,
    extra: { entityId?: string | null; amount?: number | null } = {},
  ): Promise<never> {
    await logMoneyOpsDecision(input.client, {
      operation: "sale_cancel_paid",
      decision: "denied",
      denialReason,
      entityType: extra.entityId === null ? null : "sale_order",
      entityId: extra.entityId ?? null,
      amount: extra.amount ?? null,
      ...actor,
    });
    throw createError({ statusCode, statusMessage });
  }

  const orderId = asUuidOrNull(input.rawOrderId);
  if (!orderId)
    await deny("malformed_order_id", 404, "Order not found", { entityId: null });

  // Inherited contract (patch.ts:78 pre-retirement): order cancel is
  // SUPER ADMIN only — inversion: denial logged, then 403.
  if (input.actorRole !== "super_admin")
    await deny("not_super_admin", 403, "Forbidden", { entityId: orderId });

  const reason = text(input.reason);
  if (!reason)
    await deny("reason_required", 422, "Cancellation reason is required", {
      entityId: orderId,
    });

  const { data: order, error: loadError } = await input.client
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .maybeSingle();
  if (loadError)
    throw createError({ statusCode: 500, statusMessage: loadError.message });
  if (!order)
    await deny("order_not_found", 404, "Order not found", { entityId: orderId });

  const row = order as Row;
  if (row.status === "cancelled") {
    // Idempotent replay (mirrors the RPC's alreadyCancelled branch): no
    // money action occurs, so no decision row is written.
    return { ok: true, alreadyCancelled: true, orderId } as Row;
  }
  if (row.status !== "submitted" && row.status !== "confirmed")
    await deny("order_not_cancellable", 409, "ORDER_NOT_CANCELLABLE", {
      entityId: orderId,
    });

  const paid = row.payment_status === "paid";
  const paidAmount = paid
    ? Number(row.pos_paid_amount ?? 0) > 0
      ? Number(row.pos_paid_amount)
      : Number(row.grand_total ?? 0)
    : null;
  const bank = {
    name: text(input.refundBankName),
    accountNumber: text(input.refundBankAccountNumber),
    accountName: text(input.refundBankAccountName),
    contactPhone: text(input.refundContactPhone),
  };
  if (
    paid &&
    (!bank.name || !bank.accountNumber || !bank.accountName || !bank.contactPhone)
  )
    await deny("bank_details_required", 422, "SALE_REFUND_BANK_DETAILS_REQUIRED", {
      entityId: orderId,
      amount: paidAmount,
    });

  await logMoneyOpsDecision(
    input.client,
    {
      operation: "sale_cancel_paid",
      decision: "allowed",
      entityType: "sale_order",
      entityId: orderId,
      amount: paidAmount,
      currencyCode: paid ? text(row.currency_code) || "THB" : null,
      ...actor,
    },
    { failClosed: true },
  );

  if (typeof input.client.rpc !== "function")
    throw createError({ statusCode: 500, statusMessage: "RPC unavailable" });
  const { data: rpcData, error: rpcError } = await input.client.rpc(
    "f_cancel_sale_order",
    {
      p_order_id: orderId,
      p_actor_user_id: input.actorUserId,
      p_actor_role: input.actorRole,
      p_reason: reason,
      p_refund_bank_name: bank.name || null,
      p_refund_bank_account_number: bank.accountNumber || null,
      p_refund_bank_account_name: bank.accountName || null,
      p_refund_contact_phone: bank.contactPhone || null,
    },
  );
  if (rpcError) {
    const message = String(rpcError.message ?? "");
    await logMoneyOpsDecision(input.client, {
      operation: "sale_cancel_paid",
      decision: "denied",
      denialReason: "rpc_failed_after_allow",
      entityType: "sale_order",
      entityId: orderId,
      amount: paidAmount,
      ...actor,
    });
    if (
      message.startsWith("ORDER_NOT_") ||
      message.startsWith("ORDER_CANCELLATION_CONFLICT") ||
      message.startsWith("SALE_REFUND_BANK_DETAILS_REQUIRED") ||
      message.startsWith("REFUND_AMOUNT_NOT_RESOLVED")
    ) {
      throw createError({ statusCode: 409, statusMessage: message });
    }
    console.error("sale cancel RPC failed:", message);
    throw createError({
      statusCode: 500,
      statusMessage: "Sale order cancellation failed",
    });
  }
  return rpcData as Row;
}

export async function settleSaleOrderRefund(input: {
  client: AnyClient;
  rawRefundId: unknown;
  actorUserId: string;
  actorRole: string;
  outcome: unknown; // 'settled' | 'failed'
  manualTransferReference?: unknown;
  slipStorageBucket?: unknown;
  slipStoragePath?: unknown;
  failedReason?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const actor = {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  } as const;

  async function deny(
    denialReason: string,
    statusCode: number,
    statusMessage: string,
    extra: { entityId?: string | null } = {},
  ): Promise<never> {
    await logMoneyOpsDecision(input.client, {
      operation: "refund_mark_refunded",
      decision: "denied",
      denialReason,
      entityType: extra.entityId === null ? null : "payment_refund",
      entityId: extra.entityId ?? null,
      ...actor,
    });
    throw createError({ statusCode, statusMessage });
  }

  const refundId = asUuidOrNull(input.rawRefundId);
  if (!refundId)
    await deny("malformed_refund_id", 404, "Refund not found", { entityId: null });
  if (input.actorRole !== "staff" && input.actorRole !== "super_admin")
    await deny("actor_role_invalid", 403, "Forbidden", { entityId: refundId });
  const outcome = text(input.outcome);
  if (outcome !== "settled" && outcome !== "failed")
    await deny("outcome_invalid", 422, "REFUND_OUTCOME_INVALID", {
      entityId: refundId,
    });

  await logMoneyOpsDecision(
    input.client,
    {
      operation: "refund_mark_refunded",
      decision: "allowed",
      entityType: "payment_refund",
      entityId: refundId,
      ...actor,
    },
    { failClosed: true },
  );

  if (typeof input.client.rpc !== "function")
    throw createError({ statusCode: 500, statusMessage: "RPC unavailable" });
  const { data: rpcData, error: rpcError } = await input.client.rpc(
    "f_settle_sale_order_refund",
    {
      p_refund_id: refundId,
      p_actor_user_id: input.actorUserId,
      p_actor_role: input.actorRole,
      p_outcome: outcome,
      p_manual_transfer_reference: text(input.manualTransferReference) || null,
      p_slip_storage_bucket: text(input.slipStorageBucket) || null,
      p_slip_storage_path: text(input.slipStoragePath) || null,
      p_failed_reason: text(input.failedReason) || null,
    },
  );
  if (rpcError) {
    const message = String(rpcError.message ?? "");
    await logMoneyOpsDecision(input.client, {
      operation: "refund_mark_refunded",
      decision: "denied",
      denialReason: "rpc_failed_after_allow",
      entityType: "payment_refund",
      entityId: refundId,
      ...actor,
    });
    if (
      message.startsWith("REFUND_SETTLE_EVIDENCE_REQUIRED") ||
      message.startsWith("REFUND_FAILED_REASON_REQUIRED")
    ) {
      throw createError({ statusCode: 422, statusMessage: message });
    }
    if (message.startsWith("REFUND_STATE_TERMINAL")) {
      throw createError({ statusCode: 409, statusMessage: message });
    }
    if (message.startsWith("REFUND_NOT_FOUND")) {
      throw createError({ statusCode: 404, statusMessage: message });
    }
    console.error("sale refund settle RPC failed:", message);
    throw createError({
      statusCode: 500,
      statusMessage: "Refund settlement failed",
    });
  }
  return rpcData as Row;
}
