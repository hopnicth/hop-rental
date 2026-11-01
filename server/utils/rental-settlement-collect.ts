/**
 * Settlement-payment COLLECT wrapper [T-UAT 2c].
 *
 * The money writer authority is `f_confirm_settlement_payment` (migration 134,
 * hardened in 143): it confirms the pending `payment_allocations` lines, flips
 * the payment state to `paid`, and writes its OWN §F success row
 * (`settlement_payment_confirm` / `allowed`) atomically with the state change.
 *
 * WHY THIS FILE EXISTS. The RPC has existed since mig-134 and had NO caller —
 * only its sibling `f_waive_settlement_payment` was ever wired. So the single
 * money item the web collects could not be collected: staff saw exactly one
 * control, ยกเว้นยอดชำระ, and the choice was leave it awaiting_payment forever
 * or write the money off (UAT 2026-09-01, docs/BACKLOG.md T-UAT). Waive was
 * built; confirm was not.
 *
 * THIS WRAPPER OWNS DENIALS ONLY — the same §8.9 split as the waive wrapper.
 * A log written before a RAISE cannot persist, so every refusal (the wrapper's
 * own guards and every RPC RAISE alike) writes a
 * `settlement_payment_confirm_denied` / `denied` row BEFORE the error is
 * returned. On SUCCESS this wrapper logs NOTHING: the in-RPC `allowed` row
 * already covers it and a second row would double-count.
 *
 * WHO MAY COLLECT (CHiP ruling, Q4): staff AND super_admin. Taking payment is
 * the ordinary counter action, unlike waive, which destroys money and stays
 * super_admin-only.
 *
 * BRANCH-SCOPED (CHiP ruling, Q3): staff must hold `can_pos` for the booking's
 * hub, super_admin bypasses. Deliberately NOT mirroring waive here — waive
 * never had to ask, being super_admin-only. Uses the EXPORTED
 * `assertPickupReadinessBranchAccess`; its name is pickup-flavoured because
 * that is where it lives, but it is the generic branch-access check and it is
 * the one that does NOT fail open.
 *
 * REPLAY IS SAFE BY CONSTRUCTION: the RPC refuses unless the state is
 * `awaiting_payment`, so a double-click raises
 * SETTLEMENT_PAYMENT_STATE_NOT_AWAITING and cannot double-collect. That maps
 * to a customer-safe 409 rather than a raw code.
 *
 * NO-PII INVARIANT (mig-132 table comment): denial rows carry a MACHINE CODE.
 * Payment references and slip paths are never copied into
 * money_ops_decision_logs — they live on the domain row, written by the RPC.
 */
import { createError } from "h3";
import { logMoneyOpsDecision } from "~~/server/utils/money-ops-log";
import { assertPickupReadinessBranchAccess } from "~~/server/utils/rental-pickup-readiness";

/**
 * Loose client shape (house pattern — utils receive the client, never import
 * the Supabase server helpers). METHOD syntax so the real SupabaseClient stays
 * assignable.
 */
export type CollectClient = {
  from(table: string): any;
  rpc?(fn: string, args: Record<string, unknown>): Promise<any>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value.trim())
    ? value.trim()
    : null;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The two methods the counter actually takes. */
export type SettlementPaymentMethod = "cash" | "transfer";

/**
 * CASH REFERENCE IS GENERATED HERE, AND CLIENT INPUT IS IGNORED FOR CASH.
 *
 * The RPC refuses an empty `p_payment_reference`, and cash has no external
 * reference to quote — so anything the browser sends for a cash payment is
 * unverifiable text entering an audit field. Staff who need to note a receipt
 * number have the notes field; this one is evidence.
 *
 * The date is derived in Asia/Bangkok, NOT UTC: a cash collection at 00:30
 * Bangkok is still the previous UTC day, which would stamp the wrong business
 * day on late-evening takings.
 */
export function buildCashPaymentReference(
  bookingId: string,
  now: Date = new Date(),
): string {
  const bangkok = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return `CASH-${bookingId.slice(0, 8)}-${bangkok.replace(/-/g, "")}`;
}

/**
 * RPC RAISE code -> { HTTP status, machine denial code, Thai user message }.
 * Keyed on the leading token: Postgres appends a detail suffix (`CODE: %`).
 *
 * Glossary rule (decisions.md 2026-07-07): no bare "มัดจำ" in money copy —
 * this is a settlement-payment operation, so deposit vocabulary never applies.
 */
export function collectRpcError(rawCode: string): {
  statusCode: number;
  denialReason: string;
  statusMessage: string;
} {
  const code = (rawCode.split(":")[0] ?? rawCode).trim();
  const map: Record<
    string,
    { statusCode: number; denialReason: string; statusMessage: string }
  > = {
    SETTLEMENT_PAYMENT_ACTOR_REQUIRED: {
      statusCode: 422,
      denialReason: "actor_required",
      statusMessage: "ไม่พบรหัสเจ้าหน้าที่ผู้ทำรายการ",
    },
    SETTLEMENT_PAYMENT_ACTOR_ROLE_INVALID: {
      statusCode: 403,
      denialReason: "actor_role_invalid",
      statusMessage: "บัญชีนี้ไม่มีสิทธิ์รับชำระเงิน",
    },
    SETTLEMENT_PAYMENT_EVIDENCE_REQUIRED: {
      statusCode: 422,
      denialReason: "evidence_required",
      statusMessage: "กรุณาระบุวิธีชำระเงินและเลขอ้างอิง",
    },
    SETTLEMENT_PAYMENT_SLIP_REQUIRED: {
      statusCode: 422,
      denialReason: "slip_required",
      statusMessage: "การโอนเงินต้องแนบหลักฐานการโอน",
    },
    SETTLEMENT_PAYMENT_BOOKING_NOT_FOUND: {
      statusCode: 404,
      denialReason: "booking_not_found",
      statusMessage: "ไม่พบรายการเช่านี้",
    },
    SETTLEMENT_PAYMENT_STATE_NOT_FOUND: {
      statusCode: 404,
      denialReason: "state_not_found",
      statusMessage: "ไม่พบสถานะการชำระเงินของการปิดยอดนี้",
    },
    SETTLEMENT_PAYMENT_STATE_NOT_AWAITING: {
      statusCode: 409,
      denialReason: "state_not_awaiting",
      statusMessage: "รายการนี้รับชำระเงินไปแล้ว หรือไม่ได้อยู่ระหว่างรอชำระเงิน",
    },
    SETTLEMENT_PAYMENT_INSUFFICIENT: {
      statusCode: 422,
      denialReason: "amount_insufficient",
      statusMessage: "จำนวนเงินที่รับน้อยกว่ายอดที่ต้องชำระ",
    },
    SETTLEMENT_PAYMENT_STATE_CONFLICT: {
      statusCode: 409,
      denialReason: "state_conflict",
      statusMessage: "สถานะการชำระเงินถูกเปลี่ยนโดยผู้อื่น กรุณาลองใหม่",
    },
    SETTLEMENT_HAS_PENDING_REVIEW_CHARGES: {
      statusCode: 409,
      denialReason: "pending_review_charges",
      statusMessage: "รายการนี้มีรายการค้างตรวจสอบ กรุณาติดต่อผู้ดูแลระบบ",
    },
  };
  return (
    map[code] ?? {
      statusCode: 500,
      denialReason: "rpc_failed",
      statusMessage: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง",
    }
  );
}

export interface CollectSettlementPaymentInput {
  client: CollectClient;
  rawBookingId: unknown;
  actorUserId: string;
  /** Session/DB-derived platform_role — NEVER a client-supplied value. */
  actorRole: string;
  rawAmountPaid: unknown;
  rawPaymentMethod: unknown;
  /** Honoured for transfer; IGNORED for cash (generated server-side). */
  rawPaymentReference: unknown;
  /** Storage path in the mig-113 PRIVATE chain. Required for transfer. */
  rawSlipEvidenceRef: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CollectSettlementPaymentResult {
  ok: true;
  state: string;
  amountDue: number;
  amountPaid: number;
}

export async function collectSettlementPayment(
  input: CollectSettlementPaymentInput,
): Promise<CollectSettlementPaymentResult> {
  const actor = {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  } as const;

  /**
   * Log the §F denial row, THEN return the error. Best-effort by contract: a
   * failed audit write must never block the refusal itself (money-ops-log
   * default mode; mig-132 table comment).
   */
  async function deny(
    denialReason: string,
    statusCode: number,
    statusMessage: string,
    extra: { entityId?: string | null; amount?: number | null } = {},
  ): Promise<never> {
    await logMoneyOpsDecision(input.client, {
      operation: "settlement_payment_confirm_denied",
      decision: "denied",
      denialReason,
      entityType: extra.entityId === null ? null : "rental_booking",
      entityId: extra.entityId ?? null,
      amount: extra.amount ?? null,
      ...actor,
    });
    throw createError({
      statusCode,
      statusMessage,
      data: { collectDenialReason: denialReason },
    });
  }

  const bookingId = asUuidOrNull(input.rawBookingId);
  if (!bookingId) {
    await deny("booking_id_invalid", 400, "ไม่พบรายการเช่านี้", {
      entityId: null,
    });
  }

  // Taking payment is the ordinary counter action; waive is not. Both roles
  // may collect, and the role comes from the session guard, never the body.
  if (input.actorRole !== "staff" && input.actorRole !== "super_admin") {
    await deny("actor_role_invalid", 403, "บัญชีนี้ไม่มีสิทธิ์รับชำระเงิน", {
      entityId: bookingId,
    });
  }

  const method = cleanText(input.rawPaymentMethod).toLowerCase();
  if (method !== "cash" && method !== "transfer") {
    await deny("payment_method_invalid", 422, "กรุณาเลือกวิธีชำระเงิน", {
      entityId: bookingId,
    });
  }

  const amountPaid = Number(input.rawAmountPaid);
  if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
    await deny("amount_invalid", 422, "กรุณาระบุจำนวนเงินที่รับ", {
      entityId: bookingId,
    });
  }

  // BRANCH SCOPE — staff must hold can_pos for the booking's hub; super_admin
  // bypasses inside the helper. Read the hub from the booking, never the body.
  const { data: booking, error: bookingError } = await input.client
    .from("rental_bookings")
    .select("id, hub_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) {
    await deny("booking_read_failed", 500, "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง", {
      entityId: bookingId,
    });
  }
  if (!booking) {
    await deny("booking_not_found", 404, "ไม่พบรายการเช่านี้", {
      entityId: bookingId,
    });
  }
  try {
    await assertPickupReadinessBranchAccess({
      adminClient: input.client,
      userId: input.actorUserId,
      platformRole: input.actorRole,
      branchId: (booking as { hub_id?: string | null }).hub_id ?? null,
    });
  } catch {
    await deny("branch_access_denied", 403, "คุณไม่มีสิทธิ์ใช้ POS ของสาขานี้ กรุณาติดต่อผู้ดูแลระบบ", {
      entityId: bookingId,
      amount: amountPaid,
    });
  }

  // CASH: reference generated here, client value ignored, no slip required.
  // TRANSFER: the staff-supplied reference and the private-bucket slip path
  // are both mandatory — the RPC re-checks the slip, this is the friendly 422.
  let paymentReference: string;
  let slipEvidenceRef: string | null;
  if (method === "cash") {
    paymentReference = buildCashPaymentReference(bookingId as string);
    slipEvidenceRef = null;
  } else {
    paymentReference = cleanText(input.rawPaymentReference);
    slipEvidenceRef = cleanText(input.rawSlipEvidenceRef) || null;
    if (!paymentReference) {
      await deny("reference_required", 422, "กรุณาระบุเลขอ้างอิงการโอนเงิน", {
        entityId: bookingId,
        amount: amountPaid,
      });
    }
    if (!slipEvidenceRef) {
      await deny("slip_required", 422, "การโอนเงินต้องแนบหลักฐานการโอน", {
        entityId: bookingId,
        amount: amountPaid,
      });
    }
  }

  if (typeof input.client.rpc !== "function") {
    await deny("rpc_unavailable", 500, "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง", {
      entityId: bookingId,
      amount: amountPaid,
    });
  }

  const { data, error } = await input.client.rpc!(
    "f_confirm_settlement_payment",
    {
      p_booking_id: bookingId,
      p_amount_paid: amountPaid,
      p_payment_method: method,
      p_payment_reference: paymentReference,
      p_slip_evidence_ref: slipEvidenceRef,
      p_actor_user_id: input.actorUserId,
      p_actor_role: input.actorRole,
    },
  );

  if (error) {
    const mapped = collectRpcError(String(error.message ?? ""));
    await deny(mapped.denialReason, mapped.statusCode, mapped.statusMessage, {
      entityId: bookingId,
      amount: amountPaid,
    });
  }

  // SUCCESS: log NOTHING. The RPC already wrote the 'allowed' row in the same
  // transaction as the state change; a second row here would double-count.
  const result = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    state: String(result.state ?? "paid"),
    amountDue: Number(result.amount_due ?? 0),
    amountPaid: Number(result.amount_paid ?? amountPaid),
  };
}
