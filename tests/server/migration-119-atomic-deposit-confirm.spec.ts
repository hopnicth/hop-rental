/**
 * Tests: supabase/migrations/119_atomic_rental_booking_deposit_confirm.sql
 *
 * Migration 119 introduces the SECURITY DEFINER RPC
 * f_confirm_rental_booking_deposit — the single atomic booking-deposit money
 * core (held-balance event + deposit-paid fields + POS attempt→paid) plus the
 * savepoint-isolated draft→confirmed transition, for BOTH the POS V3 path
 * (cash + QR) and the manual slip-confirm path.
 *
 * This spec has two parts (no live DB — vitest cannot reach Postgres):
 *
 *  A. Schema/source anchors — assert the migration keeps the contract the
 *     TypeScript callers depend on (signature, grants, fail-closed RAISEs, the
 *     savepoint conflict handling, and W5-document-outside boundary).
 *
 *  B. A JavaScript parity re-implementation of the RPC's decision state machine,
 *     exercised over the same branches the DB-level PART-1 verification covered:
 *     happy path, idempotent replay + amount guard, mid-core re-entry (crash
 *     recovery), fail-closed states, and the paid_confirm_failed conflict path.
 *     This is a executable contract for the callers' return-mapping — it is NOT
 *     a substitute for the live SQL verification already performed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SQL = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/119_atomic_rental_booking_deposit_confirm.sql",
  ),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// PART A — schema / source anchors
// ─────────────────────────────────────────────────────────────────────────────
describe("migration 119 — RPC signature + grants", () => {
  it("creates f_confirm_rental_booking_deposit with the locked argument order", () => {
    expect(SQL).toContain(
      "CREATE OR REPLACE FUNCTION public.f_confirm_rental_booking_deposit",
    );
    for (const arg of [
      "p_booking_id      uuid",
      "p_source_type     text",
      "p_source_id       text",
      "p_attempt_id      uuid",
      "p_amount          numeric",
      "p_currency_code   text",
      "p_payment_method  text",
      "p_branch_id       text",
      "p_staff_user_id   uuid",
      "p_idempotency_key text",
      "p_event_metadata  jsonb DEFAULT '{}'::jsonb",
    ]) {
      expect(SQL).toContain(arg);
    }
    expect(SQL).toContain("RETURNS jsonb");
  });

  it("is SECURITY DEFINER with a pinned search_path (mig-112 convention)", () => {
    expect(SQL).toContain("SECURITY DEFINER");
    expect(SQL).toContain("SET search_path = public");
  });

  it("is service_role-only — revoked from PUBLIC/anon/authenticated", () => {
    expect(SQL).toContain("FROM PUBLIC, anon, authenticated");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION");
    expect(SQL).toContain("TO service_role");
  });

  it("asserts its own signature exists via to_regprocedure", () => {
    expect(SQL).toContain("to_regprocedure(");
    expect(SQL).toContain(
      "public.f_confirm_rental_booking_deposit(uuid,text,text,uuid,numeric,text,text,text,uuid,text,jsonb)",
    );
  });
});

describe("migration 119 — fail-closed guards + boundaries", () => {
  it("validates amount and source_type up front", () => {
    expect(SQL).toContain("RAISE EXCEPTION 'BOOKING_DEPOSIT_AMOUNT_INVALID'");
    expect(SQL).toContain("BOOKING_DEPOSIT_SOURCE_TYPE_INVALID");
    expect(SQL).toContain(
      "p_source_type NOT IN ('pos_rental_payment_attempt','manual_admin_confirmation')",
    );
  });

  it("locks the booking row FOR UPDATE and raises when not found", () => {
    expect(SQL).toContain("FROM public.rental_bookings");
    expect(SQL).toContain("FOR UPDATE");
    expect(SQL).toContain("RAISE EXCEPTION 'RENTAL_BOOKING_NOT_FOUND'");
  });

  it("enforces the R3 amount guard on replay + mid-core re-entry", () => {
    expect(SQL).toContain("BOOKING_DEPOSIT_AMOUNT_MISMATCH");
    // guard exists on both the confirmed-replay branch and the paid-re-entry branch
    const occurrences = SQL.split("BOOKING_DEPOSIT_AMOUNT_MISMATCH").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("fails closed on non-draft status and unexpected deposit status", () => {
    expect(SQL).toContain("RAISE EXCEPTION 'BOOKING_NOT_DRAFT'");
    expect(SQL).toContain("BOOKING_DEPOSIT_UNEXPECTED_STATUS");
    expect(SQL).toContain("v_dep_status NOT IN ('unpaid','paid')");
  });

  it("writes the held-balance event idempotently and fails closed if missing", () => {
    expect(SQL).toContain("'booking_deposit_collection'");
    expect(SQL).toContain(
      "ON CONFLICT (source_type, source_id, event_type) DO NOTHING",
    );
    expect(SQL).toContain("HELD_BALANCE_EVENT_WRITE_FAILED");
  });

  it("guards W3 deposit-paid write on unpaid and only flips the attempt when present", () => {
    expect(SQL).toContain("booking_deposit_payment_status = 'paid'");
    expect(SQL).toContain("AND booking_deposit_payment_status = 'unpaid'");
    expect(SQL).toContain("IF p_attempt_id IS NOT NULL THEN");
    expect(SQL).toContain(
      "status IN ('finalizing','pending','requires_action')",
    );
  });

  it("savepoint-isolates the confirm and returns paid_confirm_failed on 23P01/23514", () => {
    expect(SQL).toContain("WHEN sqlstate '23P01'");
    expect(SQL).toContain("RENTAL_BOOKING_CONFLICT");
    expect(SQL).toContain("WHEN sqlstate '23514'");
    expect(SQL).toContain(
      "booking_deposit_payment_status        = 'paid_confirm_failed'",
    );
    expect(SQL).toContain("'status','paid_confirm_failed'");
  });

  it("keeps W5 document issuance OUTSIDE the RPC (no official_documents write)", () => {
    expect(SQL).not.toContain("official_documents");
    expect(SQL).not.toContain("booking_deposit_confirmation");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PART B — JS parity state machine (executable contract for return mapping)
// ─────────────────────────────────────────────────────────────────────────────

type BookingState = {
  status: "draft" | "confirmed";
  depositStatus: "unpaid" | "paid" | "paid_confirm_failed";
  paidAmount: number | null;
  currency: string;
};

type RpcResult =
  | {
      status: "confirmed" | "paid_confirm_failed";
      idempotent: boolean;
      booking_deposit_paid_amount: number | null;
      currency_code: string;
      held_balance_event_id: string | null;
      confirm_failure_reason: string | null;
    };

class RpcRaise extends Error {}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Faithful parity re-implementation of f_confirm_rental_booking_deposit's
 * decision flow. `confirmOutcome` injects what the mig-058 overlap trigger would
 * do to the W4 confirm ('ok' | 'conflict' | 'date_invalid').
 */
function confirmDeposit(
  booking: BookingState,
  params: {
    sourceType: string;
    amount: number | null;
    attemptId: string | null;
  },
  heldEventExists: boolean,
  confirmOutcome: "ok" | "conflict" | "date_invalid" = "ok",
): RpcResult {
  if (params.amount === null || params.amount <= 0)
    throw new RpcRaise("BOOKING_DEPOSIT_AMOUNT_INVALID");
  if (
    !["pos_rental_payment_attempt", "manual_admin_confirmation"].includes(
      params.sourceType,
    )
  )
    throw new RpcRaise("BOOKING_DEPOSIT_SOURCE_TYPE_INVALID");

  // 1. Idempotent success re-entry (post-confirm replay) — R3 amount guard.
  if (booking.status === "confirmed" && booking.depositStatus === "paid") {
    if (round2(params.amount) !== booking.paidAmount)
      throw new RpcRaise("BOOKING_DEPOSIT_AMOUNT_MISMATCH");
    return {
      status: "confirmed",
      idempotent: true,
      booking_deposit_paid_amount: booking.paidAmount,
      currency_code: booking.currency,
      held_balance_event_id: heldEventExists ? "evt-1" : null,
      confirm_failure_reason: null,
    };
  }

  // 2. Must be a draft to (re)finalize.
  if (booking.status !== "draft") throw new RpcRaise("BOOKING_NOT_DRAFT");

  // 3. Deposit must be 'unpaid' or a mid-core re-entry 'paid'.
  if (!["unpaid", "paid"].includes(booking.depositStatus))
    throw new RpcRaise("BOOKING_DEPOSIT_UNEXPECTED_STATUS");
  if (
    booking.depositStatus === "paid" &&
    round2(params.amount) !== booking.paidAmount
  )
    throw new RpcRaise("BOOKING_DEPOSIT_AMOUNT_MISMATCH");

  // ── ATOMIC MONEY CORE ──────────────────────────────────────────────────────
  // W2 held event (idempotent) — always present after this point.
  const eventId = "evt-1";
  // W3 deposit-paid (guarded on 'unpaid').
  if (booking.depositStatus === "unpaid") {
    booking.depositStatus = "paid";
    booking.paidAmount = params.amount;
  }

  // ── W4 confirm (savepoint-isolated) ─────────────────────────────────────────
  if (confirmOutcome === "ok") {
    booking.status = "confirmed";
    return {
      status: "confirmed",
      idempotent: false,
      booking_deposit_paid_amount: params.amount,
      currency_code: booking.currency,
      held_balance_event_id: eventId,
      confirm_failure_reason: null,
    };
  }

  const reason =
    confirmOutcome === "conflict"
      ? "RENTAL_BOOKING_CONFLICT"
      : "RENTAL_BOOKING_DATE_INVALID";
  // Money core stays; flag paid_confirm_failed.
  booking.depositStatus = "paid_confirm_failed";
  return {
    status: "paid_confirm_failed",
    idempotent: false,
    booking_deposit_paid_amount: params.amount,
    currency_code: booking.currency,
    held_balance_event_id: eventId,
    confirm_failure_reason: reason,
  };
}

const draft = (): BookingState => ({
  status: "draft",
  depositStatus: "unpaid",
  paidAmount: null,
  currency: "THB",
});

describe("migration 119 — RPC state machine (JS parity)", () => {
  it("input guards: amount<=0 and bad source_type RAISE", () => {
    expect(() =>
      confirmDeposit(
        draft(),
        { sourceType: "manual_admin_confirmation", amount: 0, attemptId: null },
        false,
      ),
    ).toThrow("BOOKING_DEPOSIT_AMOUNT_INVALID");
    expect(() =>
      confirmDeposit(
        draft(),
        { sourceType: "bogus", amount: 100, attemptId: null },
        false,
      ),
    ).toThrow("BOOKING_DEPOSIT_SOURCE_TYPE_INVALID");
  });

  it("happy path (cash/manual): draft+unpaid → confirmed, money core recorded", () => {
    const b = draft();
    const r = confirmDeposit(
      b,
      { sourceType: "manual_admin_confirmation", amount: 1500, attemptId: null },
      false,
    );
    expect(r.status).toBe("confirmed");
    expect(r.idempotent).toBe(false);
    expect(r.booking_deposit_paid_amount).toBe(1500);
    expect(r.held_balance_event_id).toBe("evt-1");
    expect(b.status).toBe("confirmed");
    expect(b.depositStatus).toBe("paid");
  });

  it("happy path (POS QR): attempt present → confirmed with the event id", () => {
    const b = draft();
    const r = confirmDeposit(
      b,
      {
        sourceType: "pos_rental_payment_attempt",
        amount: 200,
        attemptId: "attempt-1",
      },
      false,
    );
    expect(r.status).toBe("confirmed");
    expect(r.held_balance_event_id).toBe("evt-1");
  });

  it("idempotent replay: confirmed+paid, same amount → idempotent, stored amount", () => {
    const b: BookingState = {
      status: "confirmed",
      depositStatus: "paid",
      paidAmount: 1500,
      currency: "THB",
    };
    const r = confirmDeposit(
      b,
      { sourceType: "manual_admin_confirmation", amount: 1500, attemptId: null },
      true,
    );
    expect(r.idempotent).toBe(true);
    expect(r.status).toBe("confirmed");
    expect(r.booking_deposit_paid_amount).toBe(1500);
  });

  it("replay amount guard: confirmed+paid, different amount → MISMATCH", () => {
    const b: BookingState = {
      status: "confirmed",
      depositStatus: "paid",
      paidAmount: 1500,
      currency: "THB",
    };
    expect(() =>
      confirmDeposit(
        b,
        {
          sourceType: "manual_admin_confirmation",
          amount: 1600,
          attemptId: null,
        },
        true,
      ),
    ).toThrow("BOOKING_DEPOSIT_AMOUNT_MISMATCH");
  });

  it("mid-core re-entry (crash recovery): draft+paid, same amount → confirms", () => {
    // Simulates a crash after W3 (deposit paid) but before W4 (confirm): the
    // booking is still draft but the deposit is already 'paid'. A same-key retry
    // must complete the confirmation, not double-charge.
    const b: BookingState = {
      status: "draft",
      depositStatus: "paid",
      paidAmount: 200,
      currency: "THB",
    };
    const r = confirmDeposit(
      b,
      {
        sourceType: "pos_rental_payment_attempt",
        amount: 200,
        attemptId: "attempt-1",
      },
      false,
    );
    expect(r.status).toBe("confirmed");
    expect(b.status).toBe("confirmed");
    expect(b.paidAmount).toBe(200); // unchanged — no double write
  });

  it("mid-core re-entry amount guard: draft+paid, different amount → MISMATCH", () => {
    const b: BookingState = {
      status: "draft",
      depositStatus: "paid",
      paidAmount: 200,
      currency: "THB",
    };
    expect(() =>
      confirmDeposit(
        b,
        {
          sourceType: "pos_rental_payment_attempt",
          amount: 250,
          attemptId: "attempt-1",
        },
        false,
      ),
    ).toThrow("BOOKING_DEPOSIT_AMOUNT_MISMATCH");
  });

  it("fail closed: draft + paid_confirm_failed deposit → UNEXPECTED_STATUS", () => {
    const b: BookingState = {
      status: "draft",
      depositStatus: "paid_confirm_failed",
      paidAmount: 200,
      currency: "THB",
    };
    expect(() =>
      confirmDeposit(
        b,
        {
          sourceType: "pos_rental_payment_attempt",
          amount: 200,
          attemptId: "attempt-1",
        },
        false,
      ),
    ).toThrow("BOOKING_DEPOSIT_UNEXPECTED_STATUS");
  });

  it("conflict path: overlap on confirm → paid_confirm_failed, money core kept", () => {
    const b = draft();
    const r = confirmDeposit(
      b,
      {
        sourceType: "pos_rental_payment_attempt",
        amount: 200,
        attemptId: "attempt-1",
      },
      false,
      "conflict",
    );
    expect(r.status).toBe("paid_confirm_failed");
    expect(r.confirm_failure_reason).toBe("RENTAL_BOOKING_CONFLICT");
    expect(r.held_balance_event_id).toBe("evt-1"); // money core survives
    expect(b.status).toBe("draft"); // NOT confirmed
    expect(b.depositStatus).toBe("paid_confirm_failed");
  });

  it("date-invalid path: 23514 → paid_confirm_failed with the date reason", () => {
    const b = draft();
    const r = confirmDeposit(
      b,
      { sourceType: "manual_admin_confirmation", amount: 200, attemptId: null },
      false,
      "date_invalid",
    );
    expect(r.status).toBe("paid_confirm_failed");
    expect(r.confirm_failure_reason).toBe("RENTAL_BOOKING_DATE_INVALID");
  });
});
