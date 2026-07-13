/**
 * Tests: server/utils/rental-manual-deposit-confirmation.ts
 *        + POST /api/admin/rental-bookings/[id]/record-deposit
 *
 * Migration 119: the money core (held-balance liability + deposit-paid fields +
 * draft→confirmed) is now a SINGLE atomic RPC call — f_confirm_rental_booking_deposit
 * (source_type 'manual_admin_confirmation', p_source_id = bookingId, p_attempt_id
 * null). This spec stubs that RPC on the mock client and asserts its args +
 * return mapping. The slip-review UPDATE stays OUTSIDE the money txn (best-effort).
 *
 * Covers:
 *  1. amount > 0 and payment-channel validation (422) — RPC not reached
 *  2. booking-not-found (404) and non-confirmable status (422) — RPC not reached
 *  3. happy path: RPC called with the manual source, bank_transfer method, null
 *     attempt/branch, correct amount + metadata
 *  4. RPC error message → mapped status code (e.g. BOOKING_NOT_DRAFT → 409)
 *  5. paid_confirm_failed → 409 (money core kept, confirmation blocked)
 *  6. idempotent replay: rpc.idempotent === true → alreadyConfirmed true
 *  7. slip ownership guard (404, before RPC) + reviewed marking (after RPC)
 *  8. route contract: requirePlatformAdmin, no direct status write, no Omise
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { recordManualBookingDeposit } from "../../server/utils/rental-manual-deposit-confirmation";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const SLIP_ID = "33333333-3333-4333-8333-333333333333";

type RpcResult = { data: unknown; error: { message: string } | null };

function makeClient(cfg: {
  booking?: Record<string, unknown> | null;
  slip?: Record<string, unknown> | null;
  slipUpdateError?: { message: string } | null;
  rpcResult?: RpcResult;
}) {
  const calls: {
    updates: { table: string; payload: Record<string, unknown> }[];
    rpc: { fn: string; params: Record<string, unknown> }[];
  } = { updates: [], rpc: [] };
  function from(table: string) {
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q,
      update: (payload: Record<string, unknown>) => {
        calls.updates.push({ table, payload });
        return q;
      },
      eq: () => q,
      order: () => q,
      maybeSingle: () => {
        if (table === "rental_bookings")
          return Promise.resolve({ data: cfg.booking ?? null, error: null });
        if (table === "rental_booking_deposit_slips")
          return Promise.resolve({ data: cfg.slip ?? null, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
        // Only the slip-review UPDATE resolves this way now.
        return Promise.resolve({ error: cfg.slipUpdateError ?? null }).then(
          onF,
          onR,
        );
      },
    });
    return q;
  }
  const rpc = (fn: string, params: Record<string, unknown>) => {
    calls.rpc.push({ fn, params });
    return Promise.resolve(
      cfg.rpcResult ?? {
        data: {
          status: "confirmed",
          held_balance_event_id: "evt-1",
          idempotent: false,
        },
        error: null,
      },
    );
  };
  return {
    client: { from, rpc } as {
      from: (t: string) => unknown;
      rpc: (fn: string, params: Record<string, unknown>) => Promise<RpcResult>;
    },
    calls,
  };
}

const draftBooking = {
  id: BOOKING_ID,
  user_id: "cust-1",
  status: "draft",
  currency_code: "THB",
  rental_days: 5, // 3-tier formula → 200 THB booking deposit
  deposit_amount: 5000,
};

describe("recordManualBookingDeposit — validation", () => {
  it("rejects amount <= 0 (422) — RPC not reached", async () => {
    const { client, calls } = makeClient({ booking: draftBooking });
    await expect(
      recordManualBookingDeposit({
        adminClient: client,
        bookingId: BOOKING_ID,
        adminUserId: ADMIN_ID,
        amount: 0,
        paymentChannel: "uploaded_slip",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(calls.rpc).toHaveLength(0);
  });

  it("rejects an invalid payment channel (422)", async () => {
    const { client, calls } = makeClient({ booking: draftBooking });
    await expect(
      recordManualBookingDeposit({
        adminClient: client,
        bookingId: BOOKING_ID,
        adminUserId: ADMIN_ID,
        amount: 200,
        // @ts-expect-error invalid channel on purpose
        paymentChannel: "credit_card",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(calls.rpc).toHaveLength(0);
  });

  it("404 when the booking does not exist — RPC not reached", async () => {
    const { client, calls } = makeClient({ booking: null });
    await expect(
      recordManualBookingDeposit({
        adminClient: client,
        bookingId: BOOKING_ID,
        adminUserId: ADMIN_ID,
        amount: 200,
        paymentChannel: "manual",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(calls.rpc).toHaveLength(0);
  });

  it("422 for a non-confirmable booking (cancelled/picked_up/returned/no_show)", async () => {
    for (const status of ["cancelled", "picked_up", "returned", "no_show"]) {
      const { client, calls } = makeClient({
        booking: { ...draftBooking, status },
      });
      await expect(
        recordManualBookingDeposit({
          adminClient: client,
          bookingId: BOOKING_ID,
          adminUserId: ADMIN_ID,
          amount: 200,
          paymentChannel: "manual",
        }),
      ).rejects.toMatchObject({ statusCode: 422 });
      expect(calls.rpc).toHaveLength(0);
    }
  });
});

describe("recordManualBookingDeposit — atomic RPC happy path", () => {
  it("calls f_confirm_rental_booking_deposit with the manual source + bank_transfer", async () => {
    const { client, calls } = makeClient({ booking: draftBooking });
    await recordManualBookingDeposit({
      adminClient: client,
      bookingId: BOOKING_ID,
      adminUserId: ADMIN_ID,
      amount: 200,
      paymentChannel: "line_slip",
      externalReference: "REF-9",
      adminNote: "checked",
    });
    expect(calls.rpc).toHaveLength(1);
    expect(calls.rpc[0]!.fn).toBe("f_confirm_rental_booking_deposit");
    const p = calls.rpc[0]!.params;
    expect(p.p_booking_id).toBe(BOOKING_ID);
    expect(p.p_source_type).toBe("manual_admin_confirmation");
    expect(p.p_source_id).toBe(BOOKING_ID);
    expect(p.p_attempt_id).toBeNull();
    expect(p.p_amount).toBe(200);
    expect(p.p_currency_code).toBe("THB");
    expect(p.p_payment_method).toBe("bank_transfer");
    expect(p.p_branch_id).toBeNull();
    expect(p.p_staff_user_id).toBe(ADMIN_ID);
    const meta = p.p_event_metadata as Record<string, unknown>;
    expect(meta.source).toBe("manual_admin_confirmation");
    expect(meta.payment_channel).toBe("line_slip");
    expect(meta.external_reference).toBe("REF-9");
    expect(meta.admin_note).toBe("checked");
  });

  it("confirms atomically: no direct rental_bookings status write from the util", async () => {
    const { client, calls } = makeClient({ booking: draftBooking });
    const result = await recordManualBookingDeposit({
      adminClient: client,
      bookingId: BOOKING_ID,
      adminUserId: ADMIN_ID,
      amount: 200,
      paymentChannel: "manual",
    });
    // The deposit-paid fields + draft→confirmed are inside the RPC — the util
    // makes NO direct rental_bookings write.
    expect(
      calls.updates.find((u) => u.table === "rental_bookings"),
    ).toBeUndefined();
    expect(result.booking.status).toBe("confirmed");
    expect(result.heldBalanceEventId).toBe("evt-1");
    expect(result.alreadyConfirmed).toBe(false);
  });
});

describe("recordManualBookingDeposit — RPC error mapping", () => {
  it("maps a RAISE message to its status code (BOOKING_NOT_DRAFT → 409)", async () => {
    const { client } = makeClient({
      booking: draftBooking,
      rpcResult: { data: null, error: { message: "BOOKING_NOT_DRAFT" } },
    });
    await expect(
      recordManualBookingDeposit({
        adminClient: client,
        bookingId: BOOKING_ID,
        adminUserId: ADMIN_ID,
        amount: 200,
        paymentChannel: "manual",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("maps an amount-mismatch RAISE to 422", async () => {
    const { client } = makeClient({
      booking: draftBooking,
      rpcResult: {
        data: null,
        error: { message: "BOOKING_DEPOSIT_AMOUNT_MISMATCH" },
      },
    });
    await expect(
      recordManualBookingDeposit({
        adminClient: client,
        bookingId: BOOKING_ID,
        adminUserId: ADMIN_ID,
        amount: 200,
        paymentChannel: "manual",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("paid_confirm_failed → 409 (money core kept, confirmation blocked)", async () => {
    const { client } = makeClient({
      booking: draftBooking,
      rpcResult: {
        data: {
          status: "paid_confirm_failed",
          held_balance_event_id: "evt-1",
          confirm_failure_reason: "RENTAL_BOOKING_CONFLICT",
        },
        error: null,
      },
    });
    await expect(
      recordManualBookingDeposit({
        adminClient: client,
        bookingId: BOOKING_ID,
        adminUserId: ADMIN_ID,
        amount: 200,
        paymentChannel: "manual",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("recordManualBookingDeposit — idempotency + slips", () => {
  it("idempotent replay: rpc.idempotent true → alreadyConfirmed true", async () => {
    const { client } = makeClient({
      booking: { ...draftBooking, status: "confirmed" },
      rpcResult: {
        data: {
          status: "confirmed",
          held_balance_event_id: "evt-1",
          idempotent: true,
        },
        error: null,
      },
    });
    const result = await recordManualBookingDeposit({
      adminClient: client,
      bookingId: BOOKING_ID,
      adminUserId: ADMIN_ID,
      amount: 200,
      paymentChannel: "manual",
    });
    expect(result.alreadyConfirmed).toBe(true);
  });

  it("404 when the linked slip belongs to a different booking — RPC not reached", async () => {
    const { client, calls } = makeClient({
      booking: draftBooking,
      slip: { id: SLIP_ID, rental_booking_id: "other-booking" },
    });
    await expect(
      recordManualBookingDeposit({
        adminClient: client,
        bookingId: BOOKING_ID,
        adminUserId: ADMIN_ID,
        amount: 200,
        paymentChannel: "uploaded_slip",
        depositSlipId: SLIP_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(calls.rpc).toHaveLength(0);
  });

  it("marks an owned slip reviewed (after the RPC, outside the money txn)", async () => {
    const { client, calls } = makeClient({
      booking: draftBooking,
      slip: { id: SLIP_ID, rental_booking_id: BOOKING_ID },
    });
    const result = await recordManualBookingDeposit({
      adminClient: client,
      bookingId: BOOKING_ID,
      adminUserId: ADMIN_ID,
      amount: 200,
      paymentChannel: "uploaded_slip",
      depositSlipId: SLIP_ID,
      adminNote: "ok",
    });
    expect(calls.rpc).toHaveLength(1);
    const slipUpdate = calls.updates.find(
      (u) => u.table === "rental_booking_deposit_slips",
    );
    expect(slipUpdate?.payload.status).toBe("reviewed");
    expect(slipUpdate?.payload.reviewed_by).toBe(ADMIN_ID);
    expect(result.depositSlipReviewed).toBe(true);
  });
});

describe("AdminBookingDepositConfirm panel contract — SelectItem empty-string regression", () => {
  // Reka <SelectItem> (under @nuxt/ui USelect) throws when an option's value is
  // an empty string — this 500'd the whole booking-detail page for any booking
  // with a deposit slip. The "— None —" option must use a non-empty sentinel,
  // mapped back to null at the submit boundary (wire contract unchanged).
  const PANEL_SRC = readFileSync(
    resolve(process.cwd(), "app/components/admin/AdminBookingDepositConfirm.vue"),
    "utf8",
  );
  it("has no empty-string option value (the page-crashing pattern)", () => {
    expect(PANEL_SRC).not.toMatch(/value:\s*(""|'')/);
  });
  it("uses a non-empty sentinel for the None option and maps it to null on submit", () => {
    expect(PANEL_SRC).toContain('const NO_SLIP_VALUE = "__none__"');
    expect(PANEL_SRC).toContain("{ value: NO_SLIP_VALUE, label:");
    // Boundary map: the request body must never carry the sentinel.
    expect(PANEL_SRC).toContain("depositSlipId.value !== NO_SLIP_VALUE");
    expect(PANEL_SRC).not.toContain("depositSlipId: depositSlipId.value || null");
  });
});

describe("record-deposit route contract", () => {
  const SRC = readFileSync(
    resolve(
      process.cwd(),
      "server/api/admin/rental-bookings/[id]/record-deposit.post.ts",
    ),
    "utf8",
  );
  it("requires platform admin and delegates to the manual-deposit util", () => {
    expect(SRC).toContain("requirePlatformAdmin");
    expect(SRC).toContain("recordManualBookingDeposit");
  });
  it("never writes status directly, never touches Omise/payment lines/VAT", () => {
    expect(SRC).not.toContain('status: "confirmed"');
    expect(SRC).not.toContain('"payment_attempts"');
    expect(SRC).not.toContain("rental_booking_payment_lines");
    expect(SRC).not.toContain("getPublicUrl");
    expect(SRC).not.toContain("deposit.patch");
  });
});

describe("booking-deposit amount guard (owner decision 2026-07-10)", () => {
  it("rejects an amount that mismatches the 3-tier formula (422, RPC not reached)", async () => {
    const { client, calls } = makeClient({ booking: draftBooking });
    await expect(
      recordManualBookingDeposit({
        adminClient: client,
        bookingId: BOOKING_ID,
        adminUserId: ADMIN_ID,
        amount: 2000, // the security deposit — the old prefill bug
        paymentChannel: "manual",
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "BOOKING_DEPOSIT_AMOUNT_MISMATCH",
    });
    expect(calls.rpc).toHaveLength(0);
  });

  it("accepts the exact formula amount (200 for a 5-day booking)", async () => {
    const { client, calls } = makeClient({ booking: draftBooking });
    await recordManualBookingDeposit({
      adminClient: client,
      bookingId: BOOKING_ID,
      adminUserId: ADMIN_ID,
      amount: 200,
      paymentChannel: "manual",
    });
    expect(calls.rpc).toHaveLength(1);
    expect(calls.rpc[0]!.params.p_amount).toBe(200);
  });

  it.each([
    { rental_days: 3, expected: 200 },
    { rental_days: 20, expected: 500 },
    { rental_days: 30, expected: 1000 },
  ])(
    "guards at the tier amount for $rental_days days",
    async ({ rental_days, expected }) => {
      const { client, calls } = makeClient({
        booking: { ...draftBooking, rental_days, deposit_amount: 5000 },
      });
      await recordManualBookingDeposit({
        adminClient: client,
        bookingId: BOOKING_ID,
        adminUserId: ADMIN_ID,
        amount: expected,
        paymentChannel: "manual",
      });
      expect(calls.rpc[0]!.params.p_amount).toBe(expected);
    },
  );
});

describe("AdminBookingDepositConfirm — formula prefill contract (advance-only)", () => {
  const SRC = readFileSync(
    resolve(
      process.cwd(),
      "app/components/admin/AdminBookingDepositConfirm.vue",
    ),
    "utf8",
  );
  const PAGE = readFileSync(
    resolve(process.cwd(), "app/pages/admin/rental-bookings/[id].vue"),
    "utf8",
  );
  it("computes the amount from the shared 3-tier formula, not deposit_amount", () => {
    expect(SRC).toContain("calculateBookingDepositDueNow");
    expect(SRC).not.toContain("defaultAmount");
  });
  it("has no free-form amount input — amount is read-only display", () => {
    expect(SRC).not.toContain('type="number"');
    expect(SRC).toContain("cannot be edited here");
  });
  it("labels both deposits with canonical glossary", () => {
    expect(SRC).toContain("เงินมัดจำจอง");
    expect(SRC).toContain("เงินมัดจำประกันเก็บตอนรับของ");
  });
  it("shows a POS V3 notice when the booking starts today (no hard block)", () => {
    expect(SRC).toContain("startsToday");
    expect(SRC).toContain("/admin/pos-v3");
    expect(SRC).toContain('v-if="startsToday"');
  });
  it("the page passes rental-days/security-deposit/start-date, not default-amount", () => {
    expect(PAGE).toContain(':rental-days="booking?.rentalDays"');
    expect(PAGE).toContain(':security-deposit-amount="booking?.depositAmount"');
    expect(PAGE).toContain(':start-date="booking?.startDate"');
    expect(PAGE).not.toContain(':default-amount="booking?.depositAmount"');
  });
});
