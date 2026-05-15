import { createError } from "h3";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

const CANCELLABLE_SESSION_STATUSES = new Set(["validated", "payment_created"]);
const CANCELLABLE_ATTEMPT_STATUSES = new Set([
  "created",
  "pending",
  "requires_action",
]);
const CANCELLABLE_ALLOCATION_STATUSES = new Set(["planned", "payment_pending"]);
const PAID_OR_REVIEW_STATUSES = new Set([
  "paid",
  "finalizing",
  "finalized",
  "partial_finalized",
  "finalization_failed",
  "paid_confirm_failed",
  "admin_review_required",
]);

function status(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function conflict(statusMessage: string): never {
  throw createError({ statusCode: 409, statusMessage });
}

export async function cancelMixedCheckoutSession(input: {
  client: AnyClient;
  session: AnyRecord;
}) {
  const { client, session } = input;
  const sessionStatus = status(session.status);
  const sessionId = String(session.id ?? "");

  if (sessionStatus === "cancelled") {
    return {
      ok: true,
      sessionId,
      status: "cancelled",
      checkoutKind: session.checkout_kind ?? null,
      alreadyCancelled: true,
    };
  }
  if (!CANCELLABLE_SESSION_STATUSES.has(sessionStatus)) {
    conflict("MIXED_CHECKOUT_CANCEL_NOT_ALLOWED");
  }

  const { data: attempts, error: attemptError } = await client
    .from("mixed_payment_attempts")
    .select("id,status")
    .eq("mixed_checkout_session_id", sessionId);
  if (attemptError)
    throw createError({ statusCode: 500, statusMessage: attemptError.message });

  const { data: allocations, error: allocationError } = await client
    .from("mixed_payment_allocations")
    .select("id,status")
    .eq("mixed_checkout_session_id", sessionId);
  if (allocationError)
    throw createError({ statusCode: 500, statusMessage: allocationError.message });

  if ((attempts ?? []).some((row: AnyRecord) => PAID_OR_REVIEW_STATUSES.has(status(row.status)))) {
    conflict("MIXED_CHECKOUT_ATTEMPT_NOT_CANCELLABLE");
  }
  if ((allocations ?? []).some((row: AnyRecord) => PAID_OR_REVIEW_STATUSES.has(status(row.status)))) {
    conflict("MIXED_CHECKOUT_ALLOCATION_NOT_CANCELLABLE");
  }

  const now = new Date().toISOString();
  const { data: updatedSession, error: sessionError } = await client
    .from("mixed_checkout_sessions")
    .update({ status: "cancelled", updated_at: now })
    .eq("id", sessionId)
    .in("status", [...CANCELLABLE_SESSION_STATUSES])
    .select("id,status,checkout_kind")
    .maybeSingle();
  if (sessionError)
    throw createError({ statusCode: 500, statusMessage: sessionError.message });
  if (!updatedSession) conflict("MIXED_CHECKOUT_CANCEL_RACE");

  await client
    .from("mixed_payment_attempts")
    .update({ status: "cancelled", failure_code: "USER_CANCELLED_CHECKOUT" })
    .eq("mixed_checkout_session_id", sessionId)
    .in("status", [...CANCELLABLE_ATTEMPT_STATUSES]);
  await client
    .from("mixed_payment_allocations")
    .update({ status: "voided", failure_code: "USER_CANCELLED_CHECKOUT" })
    .eq("mixed_checkout_session_id", sessionId)
    .in("status", [...CANCELLABLE_ALLOCATION_STATUSES]);

  if (session.sale_order_id) {
    await client
      .from("orders")
      .update({
        status: "cancelled",
        payment_status: "cancelled",
        fulfillment_status: "cancelled",
      })
      .eq("id", session.sale_order_id)
      .neq("payment_status", "paid");
  }
  if (session.cart_id) {
    await client.from("carts").update({ updated_at: now }).eq("id", session.cart_id);
  }

  return {
    ok: true,
    sessionId,
    status: "cancelled",
    checkoutKind: updatedSession.checkout_kind ?? session.checkout_kind ?? null,
  };
}