import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  platformRole: "staff" as string,
  branchAccess: true,
  bookingRow: null as Record<string, unknown> | null,
  existingPosAttempt: null as Record<string, unknown> | null,
  insertAttemptError: null as { code?: string; message?: string } | null,
  insertedAttempts: [] as Record<string, unknown>[],
  updatedBookings: [] as Record<string, unknown>[],
  heldBalanceEventCalls: [] as Record<string, unknown>[],
  heldBalanceShouldFail: false,
  bookingUpdateShouldFail: false,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: async () => mockState.body,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("~~/server/utils/rental-held-balance-events", () => ({
  recordRentalHeldBalanceEvent: vi.fn(
    async (input: Record<string, unknown>) => {
      mockState.heldBalanceEventCalls.push({ ...input });
      if (mockState.heldBalanceShouldFail) {
        const err: any = new Error("HELD_BALANCE_ERROR");
        err.statusCode = 500;
        throw err;
      }
      return {
        id: "event-1",
        event_type: input.eventType,
        amount: input.amount,
      };
    },
  ),
}));

function qr(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
    then: (resolve: (v: any) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return chain;
}

const baseBooking = {
  id: "booking-1",
  status: "confirmed",
  deposit_amount: 5000,
  deposit_paid_amount: 0,
  deposit_payment_status: "unpaid",
  booking_deposit_payment_status: "paid",
  booking_deposit_paid_amount: 200,
  pos_branch_id: "branch-hq",
  currency_code: "THB",
};

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({
    adminClient: {
      from: (table: string) => {
        if (table === "admin_user_branch_access")
          return qr({
            data: mockState.branchAccess ? { branch_id: "branch-hq" } : null,
            error: null,
          });
        if (table === "rental_bookings") {
          return {
            select: () => qr({ data: mockState.bookingRow, error: null }),
            update: (payload: Record<string, unknown>) => {
              mockState.updatedBookings.push({ ...payload });
              const err = mockState.bookingUpdateShouldFail
                ? { code: "500", message: "DB error" }
                : null;
              return qr({ data: null, error: err });
            },
          };
        }
        if (table === "pos_rental_payment_attempts") {
          return {
            select: () =>
              qr({ data: mockState.existingPosAttempt, error: null }),
            insert: (payload: Record<string, unknown>) => {
              mockState.insertedAttempts.push({ ...payload });
              const result = {
                data: mockState.insertAttemptError
                  ? null
                  : { id: "attempt-1", amount: payload.amount, status: "paid" },
                error: mockState.insertAttemptError ?? null,
              };
              return { select: () => ({ single: async () => result }) };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    },
    userId: "staff-1",
    platformRole: mockState.platformRole,
  }),
}));

const endpoint = (
  await import("../../server/api/admin/pos-v3/rental-bookings/[bookingId]/remaining-security-deposit-payments.post")
).default;

describe("admin POS V3 remaining security deposit payments", () => {
  const event = { context: { params: { bookingId: "booking-1" } } };

  beforeEach(() => {
    mockState.body = {
      idempotencyKey: "remaining-key-1",
      amount: 4800,
      paymentMethod: "cash",
    };
    mockState.platformRole = "staff";
    mockState.branchAccess = true;
    mockState.bookingRow = { ...baseBooking };
    mockState.existingPosAttempt = null;
    mockState.insertAttemptError = null;
    mockState.insertedAttempts = [];
    mockState.updatedBookings = [];
    mockState.heldBalanceEventCalls = [];
    mockState.heldBalanceShouldFail = false;
    mockState.bookingUpdateShouldFail = false;
  });

  it("success: collects remaining security deposit and returns paid status", async () => {
    const result: any = await endpoint(event);
    expect(result.status).toBe("paid");
    expect(result.remainingSecurityDepositPaidAmount).toBe(4800);
    expect(result.paymentAttemptId).toBe("attempt-1");
    expect(result.currencyCode).toBe("THB");
  });

  it("success: creates payment attempt with correct payment_purpose", async () => {
    await endpoint(event);
    expect(mockState.insertedAttempts).toHaveLength(1);
    expect(mockState.insertedAttempts[0].payment_purpose).toBe(
      "remaining_security_deposit",
    );
    expect(mockState.insertedAttempts[0].payment_method).toBe("cash");
    expect(mockState.insertedAttempts[0].amount).toBe(4800);
  });

  it("success: updates booking with deposit_payment_status = paid", async () => {
    await endpoint(event);
    expect(mockState.updatedBookings).toHaveLength(1);
    expect(mockState.updatedBookings[0].deposit_payment_status).toBe("paid");
    expect(mockState.updatedBookings[0].deposit_paid_amount).toBe(4800);
    expect(mockState.updatedBookings[0].deposit_payment_method).toBe("cash");
  });

  it("success: records held balance event with correct event_type", async () => {
    await endpoint(event);
    expect(mockState.heldBalanceEventCalls).toHaveLength(1);
    expect(mockState.heldBalanceEventCalls[0].eventType).toBe(
      "remaining_security_deposit_collection",
    );
    expect(mockState.heldBalanceEventCalls[0].amount).toBe(4800);
    expect(mockState.heldBalanceEventCalls[0].sourceType).toBe(
      "pos_rental_payment_attempt",
    );
  });

  it("rejects when booking status is not confirmed", async () => {
    mockState.bookingRow = { ...baseBooking, status: "picked_up" };
    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects when booking_deposit_payment_status is not paid", async () => {
    mockState.bookingRow = {
      ...baseBooking,
      booking_deposit_payment_status: "unpaid",
    };
    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects when deposit is already paid (remaining already collected)", async () => {
    mockState.bookingRow = {
      ...baseBooking,
      deposit_payment_status: "paid",
      deposit_paid_amount: 4800,
    };
    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects when amount mismatches server-computed remaining deposit", async () => {
    mockState.body = { ...mockState.body, amount: 999 };
    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects when paymentMethod is not cash", async () => {
    mockState.body = { ...mockState.body, paymentMethod: "card" };
    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects when booking is not a POS V3 booking (no pos_branch_id)", async () => {
    mockState.bookingRow = { ...baseBooking, pos_branch_id: null };
    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects when branch access is denied", async () => {
    mockState.branchAccess = false;
    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns idempotent success when attempt with same key already exists", async () => {
    mockState.existingPosAttempt = {
      id: "existing-attempt",
      amount: 4800,
      status: "paid",
    };
    const result: any = await endpoint(event);
    expect(result.idempotent).toBe(true);
    expect(result.paymentAttemptId).toBe("existing-attempt");
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  it("returns paid_confirm_failed when booking update fails after attempt creation", async () => {
    mockState.bookingUpdateShouldFail = true;
    const result: any = await endpoint(event);
    expect(result.status).toBe("paid_confirm_failed");
    expect(result.paymentAttemptId).toBe("attempt-1");
    expect(result.warnings).toContain("Booking update failed");
  });

  it("returns paid_confirm_failed when held balance event fails", async () => {
    mockState.heldBalanceShouldFail = true;
    const result: any = await endpoint(event);
    expect(result.status).toBe("paid_confirm_failed");
    expect(result.warnings).toContain("Held balance event recording failed");
  });

  it("rejects when no remaining deposit is due (booking_deposit covers full amount)", async () => {
    mockState.bookingRow = {
      ...baseBooking,
      deposit_amount: 200,
      booking_deposit_paid_amount: 200,
    };
    mockState.body = { ...mockState.body, amount: 0 };
    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 422 });
  });
});
