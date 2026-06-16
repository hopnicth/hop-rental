/**
 * Tests: server/utils/rental-manual-deposit-confirmation.ts
 *        + POST /api/admin/rental-bookings/[id]/record-deposit
 *
 * Mocks at the util boundary (held-balance writer + confirmRentalBooking) and
 * uses a mock Supabase client for the direct table ops. Covers:
 *  1. amount > 0 and payment-channel validation (422)
 *  2. booking-not-found (404) and non-confirmable status (422)
 *  3. happy path: records held-balance liability (booking_deposit_collection,
 *     manual source), marks deposit paid, confirms via confirmRentalBooking
 *  4. confirmRentalBooking is called WITHOUT requireBookingDepositHeldBalanceEvent
 *     and WITH skipUserOwnershipCheck + requireBookingDepositPaid
 *  5. idempotent: already-confirmed booking does not re-confirm
 *  6. slip ownership guard + reviewed marking
 *  7. route contract: requirePlatformAdmin, no direct status write, no Omise
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("~~/server/utils/rental-held-balance-events", () => ({
  BOOKING_DEPOSIT_COLLECTION_EVENT: "booking_deposit_collection",
  recordRentalHeldBalanceEvent: vi.fn(async () => ({ id: "evt-1" })),
}));
vi.mock("~~/server/utils/rental-booking-confirmation", () => ({
  confirmRentalBooking: vi.fn(async () => ({ id: "b1", status: "confirmed" })),
}));

import { recordRentalHeldBalanceEvent } from "~~/server/utils/rental-held-balance-events";
import { confirmRentalBooking } from "~~/server/utils/rental-booking-confirmation";
import { recordManualBookingDeposit } from "../../server/utils/rental-manual-deposit-confirmation";

const recordEvent = recordRentalHeldBalanceEvent as unknown as ReturnType<
  typeof vi.fn
>;
const confirm = confirmRentalBooking as unknown as ReturnType<typeof vi.fn>;

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const SLIP_ID = "33333333-3333-4333-8333-333333333333";

function makeClient(cfg: {
  booking?: Record<string, unknown> | null;
  slip?: Record<string, unknown> | null;
  depositUpdateError?: { message: string } | null;
  slipUpdateError?: { message: string } | null;
}) {
  const calls: {
    updates: { table: string; payload: Record<string, unknown> }[];
  } = { updates: [] };
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
        const err =
          table === "rental_bookings"
            ? (cfg.depositUpdateError ?? null)
            : (cfg.slipUpdateError ?? null);
        return Promise.resolve({ error: err }).then(onF, onR);
      },
    });
    return q;
  }
  return { client: { from } as { from: (t: string) => unknown }, calls };
}

const draftBooking = {
  id: BOOKING_ID,
  user_id: "cust-1",
  status: "draft",
  currency_code: "THB",
};

beforeEach(() => {
  vi.clearAllMocks();
  confirm.mockResolvedValue({ id: BOOKING_ID, status: "confirmed" });
  recordEvent.mockResolvedValue({ id: "evt-1" });
});

describe("recordManualBookingDeposit — validation", () => {
  it("rejects amount <= 0 (422)", async () => {
    const { client } = makeClient({ booking: draftBooking });
    await expect(
      recordManualBookingDeposit({
        adminClient: client,
        bookingId: BOOKING_ID,
        adminUserId: ADMIN_ID,
        amount: 0,
        paymentChannel: "uploaded_slip",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(recordEvent).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("rejects an invalid payment channel (422)", async () => {
    const { client } = makeClient({ booking: draftBooking });
    await expect(
      recordManualBookingDeposit({
        adminClient: client,
        bookingId: BOOKING_ID,
        adminUserId: ADMIN_ID,
        amount: 1000,
        // @ts-expect-error invalid channel on purpose
        paymentChannel: "credit_card",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("404 when the booking does not exist", async () => {
    const { client } = makeClient({ booking: null });
    await expect(
      recordManualBookingDeposit({
        adminClient: client,
        bookingId: BOOKING_ID,
        adminUserId: ADMIN_ID,
        amount: 1000,
        paymentChannel: "manual",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("422 for a non-confirmable booking (cancelled/picked_up/returned/no_show)", async () => {
    for (const status of ["cancelled", "picked_up", "returned", "no_show"]) {
      const { client } = makeClient({
        booking: { ...draftBooking, status },
      });
      await expect(
        recordManualBookingDeposit({
          adminClient: client,
          bookingId: BOOKING_ID,
          adminUserId: ADMIN_ID,
          amount: 1000,
          paymentChannel: "manual",
        }),
      ).rejects.toMatchObject({ statusCode: 422 });
    }
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("recordManualBookingDeposit — happy path", () => {
  it("records a held-balance liability with the manual source and booking_deposit_collection event", async () => {
    const { client } = makeClient({ booking: draftBooking });
    await recordManualBookingDeposit({
      adminClient: client,
      bookingId: BOOKING_ID,
      adminUserId: ADMIN_ID,
      amount: 1500,
      paymentChannel: "line_slip",
      externalReference: "REF-9",
      adminNote: "checked",
    });
    expect(recordEvent).toHaveBeenCalledTimes(1);
    const arg = recordEvent.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.eventType).toBe("booking_deposit_collection");
    expect(arg.sourceType).toBe("manual_admin_confirmation");
    expect(arg.sourceId).toBe(BOOKING_ID);
    expect(arg.amount).toBe(1500);
    expect(arg.paymentMethod).toBe("bank_transfer");
    expect(arg.staffUserId).toBe(ADMIN_ID);
    const meta = arg.metadata as Record<string, unknown>;
    expect(meta.source).toBe("manual_admin_confirmation");
    expect(meta.payment_channel).toBe("line_slip");
    expect(meta.external_reference).toBe("REF-9");
  });

  it("marks the booking deposit paid then confirms via confirmRentalBooking", async () => {
    const { client, calls } = makeClient({ booking: draftBooking });
    const result = await recordManualBookingDeposit({
      adminClient: client,
      bookingId: BOOKING_ID,
      adminUserId: ADMIN_ID,
      amount: 1500,
      paymentChannel: "manual",
    });
    const depositUpdate = calls.updates.find(
      (u) => u.table === "rental_bookings",
    );
    expect(depositUpdate?.payload.booking_deposit_payment_status).toBe("paid");
    expect(depositUpdate?.payload.booking_deposit_paid_amount).toBe(1500);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(result.alreadyConfirmed).toBe(false);
  });

  it("confirms WITHOUT requireBookingDepositHeldBalanceEvent and WITH skip-ownership + deposit-paid", async () => {
    const { client } = makeClient({ booking: draftBooking });
    await recordManualBookingDeposit({
      adminClient: client,
      bookingId: BOOKING_ID,
      adminUserId: ADMIN_ID,
      amount: 1500,
      paymentChannel: "manual",
    });
    const confirmArg = confirm.mock.calls[0]![0] as Record<string, unknown>;
    expect(confirmArg.skipUserOwnershipCheck).toBe(true);
    expect(confirmArg.requireBookingDepositPaid).toBe(true);
    expect(confirmArg.requireBookingDepositHeldBalanceEvent).toBeUndefined();
    expect(confirmArg.userId).toBe(ADMIN_ID);
  });
});

describe("recordManualBookingDeposit — idempotency + slips", () => {
  it("does not re-confirm an already-confirmed booking", async () => {
    const { client } = makeClient({
      booking: { ...draftBooking, status: "confirmed" },
    });
    const result = await recordManualBookingDeposit({
      adminClient: client,
      bookingId: BOOKING_ID,
      adminUserId: ADMIN_ID,
      amount: 1500,
      paymentChannel: "manual",
    });
    expect(result.alreadyConfirmed).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("404 when the linked slip belongs to a different booking", async () => {
    const { client } = makeClient({
      booking: draftBooking,
      slip: { id: SLIP_ID, rental_booking_id: "other-booking" },
    });
    await expect(
      recordManualBookingDeposit({
        adminClient: client,
        bookingId: BOOKING_ID,
        adminUserId: ADMIN_ID,
        amount: 1500,
        paymentChannel: "uploaded_slip",
        depositSlipId: SLIP_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("marks an owned slip reviewed", async () => {
    const { client, calls } = makeClient({
      booking: draftBooking,
      slip: { id: SLIP_ID, rental_booking_id: BOOKING_ID },
    });
    const result = await recordManualBookingDeposit({
      adminClient: client,
      bookingId: BOOKING_ID,
      adminUserId: ADMIN_ID,
      amount: 1500,
      paymentChannel: "uploaded_slip",
      depositSlipId: SLIP_ID,
      adminNote: "ok",
    });
    const slipUpdate = calls.updates.find(
      (u) => u.table === "rental_booking_deposit_slips",
    );
    expect(slipUpdate?.payload.status).toBe("reviewed");
    expect(slipUpdate?.payload.reviewed_by).toBe(ADMIN_ID);
    expect(result.depositSlipReviewed).toBe(true);
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
