/**
 * Settlement-payment WAIVE wrapper (§8.9 half 2, merge-blocker release).
 *
 * The money writer authority is `f_waive_settlement_payment` (migration 141):
 * it flips the payment state to `waived`, cancels the pending charge lines,
 * and writes its OWN §F success row (`settlement_payment_waive` / `allowed`,
 * 141:86-89) atomically with the state change.
 *
 * THIS WRAPPER OWNS DENIALS ONLY. Migration 141 removed the in-RPC denial
 * INSERT because a log written before a RAISE can never persist — the RAISE
 * rolls it back. Standing rule (§8.9): no plpgsql function may log a denial
 * and then RAISE in the same transaction; the refusal is the RPC's job and
 * the audit trail is the caller's.
 *
 * Therefore, on EVERY refusal — the wrapper's own fast-fail guards and every
 * RPC RAISE alike — a `settlement_payment_waive_denied` / `denied` row is
 * written to money_ops_decision_logs (its own transaction, via PostgREST)
 * BEFORE the error is returned. On SUCCESS the wrapper logs NOTHING: the
 * in-RPC row already covers it, and a second row would double-count.
 *
 * §F INVERSION (why the route uses requirePlatformAdmin, not
 * requireSuperAdmin): the super-admin-only guard helper would throw before
 * the denial log, leaving the exact staff-attempt case §8.9 exists to audit
 * silently unrecorded. Same reasoning as company-cancel.post.ts.
 *
 * AUTHORITY NOTE: `f_waive_settlement_payment` takes `p_actor_role` as a
 * PARAMETER (141:34,46) — unlike the settle RPC it does NOT look the role up
 * in-transaction. The role passed here comes from `requirePlatformAdmin`,
 * which reads platform_role from public.users server-side (admin.ts:22-25),
 * never from the request body. The RPC's check is defense-in-depth.
 *
 * NO-PII INVARIANT (mig 132 table comment): denial rows carry a MACHINE CODE
 * in denial_reason. The staff-entered free-text waive reason is NEVER copied
 * into money_ops_decision_logs — it lives on the domain row
 * (rental_settlement_payment_states.waive_reason, written by the RPC 141:79).
 */
import { createError } from "h3";
import { logMoneyOpsDecision } from "~~/server/utils/money-ops-log";

/**
 * Loose client shape (house pattern — utils receive the client, never import
 * the Supabase server helpers). Declared with METHOD syntax so the real
 * SupabaseClient stays assignable: property-syntax function types are checked
 * strictly and would reject it (see company-cancel.post.ts:27 for that shape).
 */
export type WaiveClient = {
  from(table: string): any;
  rpc?(fn: string, args: Record<string, unknown>): Promise<any>;
};
type AnyClient = WaiveClient;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value.trim())
    ? value.trim()
    : null;
}

/**
 * RPC RAISE code -> { HTTP status, machine denial code, Thai user message }.
 * Keyed on the leading token: Postgres appends a detail suffix (`CODE: %`),
 * e.g. SETTLEMENT_WAIVE_STATE_NOT_AWAITING at 141:67.
 *
 * Glossary rule (decisions.md 2026-07-07): no bare "มัดจำ" in money copy —
 * this is a settlement-payment operation, so deposit vocabulary never applies.
 */
export function waiveRpcError(rawCode: string): {
  statusCode: number;
  denialReason: string;
  statusMessage: string;
} {
  const code = (rawCode.split(":")[0] ?? rawCode).trim();
  const map: Record<
    string,
    { statusCode: number; denialReason: string; statusMessage: string }
  > = {
    SETTLEMENT_WAIVE_SUPER_ADMIN_ONLY: {
      statusCode: 403,
      denialReason: "not_super_admin",
      statusMessage: "ยกเว้นยอดชำระได้เฉพาะผู้ดูแลระบบระดับสูงเท่านั้น",
    },
    SETTLEMENT_WAIVE_REASON_REQUIRED: {
      statusCode: 422,
      denialReason: "reason_required",
      statusMessage: "กรุณาระบุเหตุผลในการยกเว้นยอดชำระ",
    },
    SETTLEMENT_WAIVE_BOOKING_NOT_FOUND: {
      statusCode: 404,
      denialReason: "booking_not_found",
      statusMessage: "ไม่พบรายการเช่านี้",
    },
    SETTLEMENT_WAIVE_STATE_NOT_FOUND: {
      statusCode: 404,
      denialReason: "state_not_found",
      statusMessage: "ไม่พบสถานะการชำระเงินของการปิดยอดนี้",
    },
    SETTLEMENT_WAIVE_STATE_NOT_AWAITING: {
      statusCode: 409,
      denialReason: "state_not_awaiting",
      statusMessage: "รายการนี้ไม่ได้อยู่ระหว่างรอชำระเงิน จึงยกเว้นไม่ได้",
    },
    SETTLEMENT_WAIVE_STATE_CONFLICT: {
      statusCode: 409,
      denialReason: "state_conflict",
      statusMessage: "สถานะการชำระเงินถูกเปลี่ยนโดยผู้อื่น กรุณาลองใหม่",
    },
    SETTLEMENT_WAIVE_ACTOR_REQUIRED: {
      statusCode: 422,
      denialReason: "actor_required",
      statusMessage: "ไม่พบรหัสเจ้าหน้าที่ผู้ทำรายการ",
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

export interface WaiveSettlementPaymentInput {
  client: AnyClient;
  rawBookingId: unknown;
  actorUserId: string;
  /** Session/DB-derived platform_role — NEVER a client-supplied value. */
  actorRole: string;
  /** Staff free-text justification. Stored on the domain row, never in modl. */
  reason: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface WaiveSettlementPaymentResult {
  ok: true;
  state: string;
}

export async function waiveSettlementPayment(
  input: WaiveSettlementPaymentInput,
): Promise<WaiveSettlementPaymentResult> {
  const actor = {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  } as const;

  /**
   * Log the §F denial row, THEN return the error. Best-effort by contract:
   * a failed audit write must never block the refusal itself (money-ops-log
   * default mode; mig-132 table comment).
   */
  async function deny(
    denialReason: string,
    statusCode: number,
    statusMessage: string,
    extra: { entityId?: string | null; amount?: number | null } = {},
  ): Promise<never> {
    await logMoneyOpsDecision(input.client, {
      operation: "settlement_payment_waive_denied",
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
      data: { waiveDenialReason: denialReason },
    });
  }

  // Decision-G purity: a malformed raw id is never echoed into the log.
  const bookingId = asUuidOrNull(input.rawBookingId);
  if (!bookingId) {
    await deny("malformed_booking_id", 404, "ไม่พบรายการเช่านี้", {
      entityId: null,
    });
  }

  // FAST-FAIL super_admin check — the §F inversion. Runs BEFORE any read so a
  // denied actor costs one log write and nothing else. The RPC repeats this
  // check (141:46) as defense-in-depth.
  if (input.actorRole !== "super_admin") {
    const mapped = waiveRpcError("SETTLEMENT_WAIVE_SUPER_ADMIN_ONLY");
    await deny(mapped.denialReason, mapped.statusCode, mapped.statusMessage, {
      entityId: bookingId,
    });
  }

  const reason =
    typeof input.reason === "string" && input.reason.trim().length > 0
      ? input.reason.trim()
      : null;
  if (!reason) {
    const mapped = waiveRpcError("SETTLEMENT_WAIVE_REASON_REQUIRED");
    await deny(mapped.denialReason, mapped.statusCode, mapped.statusMessage, {
      entityId: bookingId,
    });
  }

  // Best-effort enrichment: the money at stake, for the audit row. A read
  // failure must not block the operation — amount stays null.
  let amountDue: number | null = null;
  try {
    const { data: stateRow } = await input.client
      .from("rental_settlement_payment_states")
      .select("amount_due")
      .eq("booking_id", bookingId)
      .maybeSingle();
    const parsed = Number(
      (stateRow as Record<string, unknown> | null)?.amount_due,
    );
    amountDue = Number.isFinite(parsed) ? parsed : null;
  } catch {
    amountDue = null;
  }

  if (typeof input.client.rpc !== "function") {
    throw createError({ statusCode: 500, statusMessage: "RPC unavailable" });
  }
  const { data, error } = await input.client.rpc("f_waive_settlement_payment", {
    p_booking_id: bookingId,
    p_reason: reason,
    p_actor_user_id: input.actorUserId,
    p_actor_role: input.actorRole,
  });

  if (error) {
    const rawCode = String(error.message ?? "SETTLEMENT_WAIVE_FAILED");
    const mapped = waiveRpcError(rawCode);
    // Every RAISE is audited — this is the half-2 release condition.
    await deny(mapped.denialReason, mapped.statusCode, mapped.statusMessage, {
      entityId: bookingId,
      amount: amountDue,
    });
  }

  // SUCCESS: log NOTHING. The RPC already wrote the 'allowed' row in the same
  // transaction as the state flip (141:86-89); a wrapper row would double-log.
  const result = (data ?? {}) as Record<string, unknown>;
  return { ok: true, state: String(result.state ?? "waived") };
}
