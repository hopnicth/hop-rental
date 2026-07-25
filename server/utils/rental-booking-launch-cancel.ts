/**
 * Launch-era cancellation wrapper (K-1, migration 145).
 *
 * The writer authority is `f_cancel_rental_booking_launch` (mig 145): it locks
 * the booking, validates the status, flips it to `cancelled` — which IS the
 * slot release, because availability blocks only ('confirmed','picked_up') at
 * both the app layer (rental-booking-availability.ts:22,91) and the mig-058
 * trigger — and writes its own §F row atomically.
 *
 * ZERO MONEY BRANCHES. Launch bookings are free (decisions.md 2026-07-22), so
 * cancellation moves no money: no refund, no forfeiture, no document. The
 * deposit-era cancel RPCs stay gated by 135 and are NOT reachable from here —
 * this is a parallel lean path, not an un-gate.
 *
 * OWNERSHIP: the RPC cannot tell "customer cancelling their own booking" from
 * "staff cancelling any", so the customer path MUST pass `requireOwnerUserId`
 * and the check happens here, before the RPC.
 *
 * NO-PII: the free-text reason goes to rental_bookings.cancellation_reason and
 * never into money_ops_decision_logs (the RPC logs machine fields only).
 */
import { createError } from "h3";

export type LaunchCancelClient = {
  from(table: string): any;
  rpc?(fn: string, args: Record<string, unknown>): Promise<any>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RPC RAISE code -> HTTP + Thai user message. Keyed on the leading token:
 * Postgres appends a detail suffix (`CODE: %`) on several of these.
 *
 * Glossary rule (decisions.md 2026-07-07): no bare "มัดจำ" in money copy.
 * A launch cancel moves no money, so deposit vocabulary never appears.
 */
export function launchCancelError(rawCode: string): {
  statusCode: number;
  statusMessage: string;
} {
  const code = (rawCode.split(":")[0] ?? rawCode).trim();
  const map: Record<string, { statusCode: number; statusMessage: string }> = {
    LAUNCH_CANCEL_BOOKING_NOT_FOUND: {
      statusCode: 404,
      statusMessage: "ไม่พบรายการเช่านี้",
    },
    LAUNCH_CANCEL_BOOKING_ID_REQUIRED: {
      statusCode: 400,
      statusMessage: "ไม่พบรหัสรายการเช่า",
    },
    LAUNCH_CANCEL_BOOKING_NOT_CONFIRMED: {
      statusCode: 409,
      statusMessage: "รายการนี้ยังไม่ได้ยืนยัน จึงยกเลิกด้วยวิธีนี้ไม่ได้",
    },
    LAUNCH_CANCEL_BOOKING_ALREADY_PICKED_UP: {
      statusCode: 409,
      statusMessage: "รับอุปกรณ์ไปแล้ว ไม่สามารถยกเลิกได้ กรุณาใช้ขั้นตอนคืนอุปกรณ์",
    },
    LAUNCH_CANCEL_BOOKING_ALREADY_RETURNED: {
      statusCode: 409,
      statusMessage: "รายการนี้คืนอุปกรณ์เรียบร้อยแล้ว",
    },
    LAUNCH_CANCEL_BOOKING_NO_SHOW: {
      statusCode: 409,
      statusMessage: "รายการนี้ถูกบันทึกว่าไม่มารับอุปกรณ์แล้ว",
    },
    LAUNCH_CANCEL_BOOKING_NOT_CANCELLABLE: {
      statusCode: 409,
      statusMessage: "สถานะปัจจุบันไม่สามารถยกเลิกได้",
    },
    LAUNCH_CANCEL_SETTLEMENT_EXISTS: {
      statusCode: 409,
      statusMessage: "รายการนี้มีการปิดยอดแล้ว ไม่สามารถยกเลิกได้",
    },
    LAUNCH_CANCEL_STATE_CONFLICT: {
      statusCode: 409,
      statusMessage: "สถานะถูกเปลี่ยนโดยผู้อื่น กรุณาลองใหม่",
    },
    LAUNCH_CANCEL_REASON_REQUIRED: {
      statusCode: 422,
      statusMessage: "กรุณาระบุเหตุผลในการยกเลิก",
    },
    LAUNCH_CANCEL_ACTOR_REQUIRED: {
      statusCode: 422,
      statusMessage: "ไม่พบผู้ทำรายการ",
    },
    LAUNCH_CANCEL_INITIATOR_INVALID: {
      statusCode: 422,
      statusMessage: "ประเภทผู้ยกเลิกไม่ถูกต้อง",
    },
    LAUNCH_CANCEL_SOURCE_INVALID: {
      statusCode: 422,
      statusMessage: "ช่องทางการยกเลิกไม่ถูกต้อง",
    },
  };
  return (
    map[code] ?? {
      statusCode: 500,
      statusMessage: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง",
    }
  );
}

export interface LaunchCancelInput {
  client: LaunchCancelClient;
  rawBookingId: unknown;
  /** NULL only for the system/cron actor (which does not call this wrapper). */
  actorUserId: string | null;
  actorRole: string;
  initiator: "customer" | "staff" | "admin" | "pos";
  source:
    | "customer_web"
    | "admin_rental_detail"
    | "admin_pos"
    | "pos_history"
    | "support";
  reason: unknown;
  /** Customer path only: the booking must belong to this user. */
  requireOwnerUserId?: string | null;
}

export interface LaunchCancelResult {
  ok: true;
  bookingId: string;
  state: string;
  wasAlreadyCancelled: boolean;
}

export async function cancelRentalBookingLaunch(
  input: LaunchCancelInput,
): Promise<LaunchCancelResult> {
  const bookingId =
    typeof input.rawBookingId === "string" && UUID_RE.test(input.rawBookingId.trim())
      ? input.rawBookingId.trim()
      : null;
  if (!bookingId) {
    throw createError({ statusCode: 404, statusMessage: "ไม่พบรายการเช่านี้" });
  }

  const reason =
    typeof input.reason === "string" && input.reason.trim().length > 0
      ? input.reason.trim()
      : null;
  if (!reason) {
    const mapped = launchCancelError("LAUNCH_CANCEL_REASON_REQUIRED");
    throw createError(mapped);
  }

  // Ownership (customer path). The RPC cannot make this distinction.
  if (input.requireOwnerUserId) {
    const { data: row, error } = await input.client
      .from("rental_bookings")
      .select("id, user_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }
    if (!row) {
      throw createError({ statusCode: 404, statusMessage: "ไม่พบรายการเช่านี้" });
    }
    if (String((row as Record<string, unknown>).user_id ?? "") !== input.requireOwnerUserId) {
      throw createError({ statusCode: 403, statusMessage: "ไม่มีสิทธิ์เข้าถึงรายการนี้" });
    }
  }

  if (typeof input.client.rpc !== "function") {
    throw createError({ statusCode: 500, statusMessage: "RPC unavailable" });
  }
  const { data, error } = await input.client.rpc(
    "f_cancel_rental_booking_launch",
    {
      p_booking_id: bookingId,
      p_actor_user_id: input.actorUserId,
      p_actor_role: input.actorRole,
      p_initiator: input.initiator,
      p_source: input.source,
      p_reason: reason,
    },
  );
  if (error) {
    const rawCode = String(error.message ?? "LAUNCH_CANCEL_FAILED");
    const mapped = launchCancelError(rawCode);
    throw createError({
      statusCode: mapped.statusCode,
      statusMessage: mapped.statusMessage,
      data: { launchCancelCode: rawCode },
    });
  }

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    bookingId,
    state: String(result.state ?? "cancelled"),
    wasAlreadyCancelled: result.was_already_cancelled === true,
  };
}
