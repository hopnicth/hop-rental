/**
 * Manual bank-transfer SALE ORDER payment confirmation.
 *
 * An admin who has reviewed an offline bank-transfer slip marks the order paid.
 * This mirrors the canonical paid behavior of the Omise success path
 * (server/utils/payments.ts applyGatewayResult) WITHOUT inventing any new
 * accounting: there is no VAT/revenue recognition for sale orders, so none is
 * added. The same existing, idempotent infrastructure is reused:
 *
 *  - order.payment_status -> 'paid', status -> 'confirmed' (the existing
 *    paid-write convention; guarded for idempotency).
 *  - inventory deducted via the existing idempotent RPC f_apply_order_inventory
 *    (no-op if already applied).
 *  - the buyer's cart is cleared (same best-effort pattern as the Omise path).
 *
 * It NEVER touches rental ledgers (rental_held_balance_events), the rental
 * confirm path, Omise/payment_attempts, or VAT/revenue. Idempotent: an
 * already-paid order returns alreadyPaid without re-applying anything.
 */
import { createError } from "h3";
import { recordPaymentAlert } from "~~/server/utils/payments";

type AnyRecord = Record<string, unknown>;
type AnyClient = {
  from(table: string): any;
  rpc?: (fn: string, params: AnyRecord) => Promise<{ error: AnyRecord | null }>;
};

/** Payment statuses from which an admin may mark a sale order paid. */
const PAYABLE_STATUSES = new Set(["awaiting_payment", "pending_review"]);

export interface RecordManualSalePaymentInput {
  adminClient: AnyClient;
  orderId: string;
  adminUserId: string;
  paymentSlipId?: string | null;
  adminNote?: string | null;
}

export interface RecordManualSalePaymentResult {
  order: AnyRecord;
  alreadyPaid: boolean;
  paymentSlipReviewed: boolean;
}

/** Best-effort cart clear — mirrors payments.ts clearUserCartAfterPayment. */
async function clearUserCart(
  client: AnyClient,
  userId: string | null,
): Promise<void> {
  if (!userId) return;
  try {
    const { data: cartRow } = await client
      .from("carts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const cartId = cartRow?.id ? String(cartRow.id) : null;
    if (!cartId) return;
    await client.from("cart_items").delete().eq("cart_id", cartId);
    await client
      .from("carts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", cartId);
  } catch {
    // best-effort
  }
}

/** Idempotent inventory deduction via the existing RPC (no-op if applied). */
async function applyInventory(
  client: AnyClient,
  orderId: string,
): Promise<void> {
  try {
    if (typeof client.rpc !== "function") return;
    const { error } = await client.rpc("f_apply_order_inventory", {
      p_order_id: orderId,
    });
    if (error) {
      await recordPaymentAlert(client as never, {
        orderId,
        kind: "inventory_apply_failed",
        audience: "admin",
        severity: "critical",
        message: `Manual payment inventory hook failed: ${
          error.message ?? "unknown error"
        }`,
      });
    }
  } catch (err) {
    await recordPaymentAlert(client as never, {
      orderId,
      kind: "inventory_apply_failed",
      audience: "admin",
      severity: "critical",
      message: `Manual payment inventory hook threw: ${
        err instanceof Error ? err.message : String(err)
      }`,
    }).catch(() => {});
  }
}

async function markSlipReviewed(
  client: AnyClient,
  orderId: string,
  paymentSlipId: string,
  adminUserId: string,
  adminNote: string | null,
): Promise<boolean> {
  const { data: slip, error } = await client
    .from("sale_order_payment_slips")
    .select("id, order_id")
    .eq("id", paymentSlipId)
    .maybeSingle();
  if (error) {
    console.error("[orders] manual payment slip read failed", error.message);
    throw createError({ statusCode: 500, statusMessage: "SLIP_READ_FAILED" });
  }
  if (!slip || String((slip as AnyRecord).order_id ?? "") !== String(orderId)) {
    throw createError({ statusCode: 404, statusMessage: "Slip not found" });
  }
  const { error: reviewError } = await client
    .from("sale_order_payment_slips")
    .update({
      status: "reviewed",
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
      review_note: adminNote,
    })
    .eq("id", paymentSlipId)
    .eq("order_id", orderId);
  if (reviewError) {
    // Non-fatal: payment is the source of truth; slip status is metadata.
    console.error(
      "[orders] manual payment slip review update failed",
      reviewError.message,
    );
    return false;
  }
  return true;
}

/**
 * Mark a sale order paid after manual slip review, applying inventory and
 * clearing the cart through the existing safe infrastructure. Idempotent.
 */
export async function recordManualSalePayment(
  input: RecordManualSalePaymentInput,
): Promise<RecordManualSalePaymentResult> {
  const { adminClient, orderId, adminUserId } = input;
  const adminNote =
    typeof input.adminNote === "string" && input.adminNote.trim()
      ? input.adminNote.trim()
      : null;
  const paymentSlipId =
    typeof input.paymentSlipId === "string" && input.paymentSlipId.trim()
      ? input.paymentSlipId.trim()
      : null;

  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id, user_id, payment_status, status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) {
    console.error("[orders] manual payment order read failed", orderError.message);
    throw createError({ statusCode: 500, statusMessage: "ORDER_READ_FAILED" });
  }
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  const paymentStatus = String((order as AnyRecord).payment_status ?? "");

  // Idempotent: already paid -> review slip if provided, return.
  if (paymentStatus === "paid") {
    let reviewed = false;
    if (paymentSlipId) {
      reviewed = await markSlipReviewed(
        adminClient,
        orderId,
        paymentSlipId,
        adminUserId,
        adminNote,
      );
    }
    return { order: order as AnyRecord, alreadyPaid: true, paymentSlipReviewed: reviewed };
  }

  if (!PAYABLE_STATUSES.has(paymentStatus)) {
    // cancelled / refunded / not_applicable — never markable as paid here.
    throw createError({
      statusCode: 422,
      statusMessage: "ORDER_NOT_PAYABLE",
    });
  }

  // Optional slip ownership + review (before money transition).
  let paymentSlipReviewed = false;
  if (paymentSlipId) {
    paymentSlipReviewed = await markSlipReviewed(
      adminClient,
      orderId,
      paymentSlipId,
      adminUserId,
      adminNote,
    );
  }

  // Mark paid + confirmed (existing convention; guarded -> idempotent).
  const { data: updated, error: updateError } = await adminClient
    .from("orders")
    .update({ payment_status: "paid", status: "confirmed" })
    .eq("id", orderId)
    .neq("payment_status", "paid")
    .select("id, user_id, payment_status, status")
    .maybeSingle();
  if (updateError) {
    console.error("[orders] manual payment order update failed", updateError.message);
    throw createError({ statusCode: 500, statusMessage: "ORDER_UPDATE_FAILED" });
  }

  // Apply inventory (idempotent RPC) + clear cart (best-effort) + success alert.
  await applyInventory(adminClient, orderId);
  await clearUserCart(adminClient, (order as AnyRecord).user_id ? String((order as AnyRecord).user_id) : null);
  await recordPaymentAlert(adminClient as never, {
    orderId,
    kind: "payment_success",
    audience: "user",
    severity: "info",
    message: "Manual bank-transfer payment verified.",
  }).catch(() => {});

  return {
    order: (updated as AnyRecord) ?? (order as AnyRecord),
    alreadyPaid: false,
    paymentSlipReviewed,
  };
}
