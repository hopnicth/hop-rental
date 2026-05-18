import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  platformRole: "staff" as string,
  branchAccess: true,
  bookingRow: null as Record<string, unknown> | null,
  existingPosAttempt: null as Record<string, unknown> | null,
  insertAttemptError: null as { code?: string; message?: string } | null,
  insertedAttempts: [] as Record<string, unknown>[],
  updatedAttempts: [] as Record<string, unknown>[],
  updatedBookings: [] as Record<string, unknown>[],
  confirmShouldFail: false,
  availabilityConflict: false,
  heldBalanceEventCalls: [] as Record<string, unknown>[],
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: async () => mockState.body,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("~~/server/utils/rental-booking-availability", async () => {
  const { createError } = await import("h3");
  return {
    assertRentalBookingAvailability: vi.fn(async () => {
      if (mockState.availabilityConflict)
        throw createError({
          statusCode: 409,
          statusMessage: "RENTAL_BOOKING_CONFLICT",
        });
    }),
  };
});

vi.mock("~~/server/utils/rental-held-balance-events", () => ({
  recordBookingDepositHeldBalanceCollection: vi.fn(
    async (input: Record<string, unknown>) => {
      mockState.heldBalanceEventCalls.push({ ...input });
    },
  ),
}));

vi.mock("~~/server/utils/rental-booking-confirmation", async () => {
  const { createError } = await import("h3");
  return {
    confirmRentalBooking: vi.fn(async () => {
      if (mockState.confirmShouldFail)
        throw createError({
          statusCode: 409,
          statusMessage: "RENTAL_BOOKING_CONFLICT",
        });
      return { id: "booking-1", status: "confirmed" };
    }),
  };
});

vi.mock("~~/app/utils/rental-payment-lines", () => ({
  calculateBookingDepositDueNow: vi.fn(() => 200),
}));

function qr(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
    then: (resolve: (v: any) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return chain;
}

const baseBooking = {
  id: "booking-1",
  user_id: null,
  walk_in_phone: "0812345678",
  status: "draft",
  asset_id: "asset-1",
  sku_id: null,
  start_date: "2026-05-21",
  end_date: "2026-05-24",
  rental_days: 3,
  hub_id: "branch-hq",
  deposit_amount: 5000,
  currency_code: "THB",
  booking_deposit_payment_status: "unpaid",
  booking_deposit_paid_amount: 0,
  pos_branch_id: "branch-hq",
  pos_staff_user_id: "staff-1",
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
              return qr({ data: null, error: null });
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
            update: (payload: Record<string, unknown>) => {
              mockState.updatedAttempts.push({ ...payload });
              return qr({ data: null, error: null });
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
  await import("../../server/api/admin/pos-v3/rental-bookings/[bookingId]/booking-deposit-payments.post")
).default;

describe("admin POS V3 booking deposit payments", () => {
  const event = { context: { params: { bookingId: "booking-1" } } };

  beforeEach(() => {
    mockState.body = {
      idempotencyKey: "pay-key-1",
      amount: 200,
      paymentMethod: "cash",
    };
    mockState.platformRole = "staff";
    mockState.branchAccess = true;
    mockState.bookingRow = { ...baseBooking };
    mockState.existingPosAttempt = null;
    mockState.insertAttemptError = null;
    mockState.insertedAttempts = [];
    mockState.updatedAttempts = [];
    mockState.updatedBookings = [];
    mockState.confirmShouldFail = false;
    mockState.availabilityConflict = false;
    mockState.heldBalanceEventCalls = [];
  });

  it("happy path: records attempt, held-balance event, updates booking, confirms", async () => {
    const result = await endpoint(event);

    expect(result.status).toBe("confirmed");
    expect(result.paymentAttemptId).toBe("attempt-1");
    expect(result.booking).toMatchObject({
      id: "booking-1",
      status: "confirmed",
      bookingDepositPaidAmount: 200,
      currencyCode: "THB",
    });
    expect(mockState.insertedAttempts).toHaveLength(1);
    expect(mockState.insertedAttempts[0]).toMatchObject({
      rental_booking_id: "booking-1",
      payment_purpose: "booking_deposit",
      payment_method: "cash",
      amount: 200,
      status: "paid",
      branch_id: "branch-hq",
      staff_user_id: "staff-1",
      idempotency_key: "pay-key-1",
    });
    expect(mockState.heldBalanceEventCalls).toHaveLength(1);
    expect(mockState.heldBalanceEventCalls[0]).toMatchObject({
      amount: 200,
      sourceType: "pos_rental_payment_attempt",
      sourceId: "attempt-1",
      paymentMethod: "cash",
      branchId: "branch-hq",
    });
    expect(mockState.updatedBookings).toHaveLength(1);
    expect(mockState.updatedBookings[0]).toMatchObject({
      booking_deposit_payment_status: "paid",
      booking_deposit_paid_amount: 200,
      booking_deposit_pos_attempt_id: "attempt-1",
    });
  });

  it("idempotency: returns existing attempt without re-processing", async () => {
    mockState.existingPosAttempt = {
      id: "attempt-existing",
      amount: 200,
      status: "paid",
    };

    const result = await endpoint(event);

    expect(result.idempotent).toBe(true);
    expect(result.paymentAttemptId).toBe("attempt-existing");
    expect(mockState.insertedAttempts).toHaveLength(0);
    expect(mockState.heldBalanceEventCalls).toHaveLength(0);
  });

  it("idempotency: throws 409 if same key has conflicting amount", async () => {
    mockState.existingPosAttempt = {
      id: "attempt-existing",
      amount: 500,
      status: "paid",
    };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: "IDEMPOTENCY_KEY_AMOUNT_CONFLICT",
    });
  });

  it("transitions to paid_confirm_failed if confirmation fails after cash collected", async () => {
    mockState.confirmShouldFail = true;

    const result = await endpoint(event);

    expect(result.status).toBe("paid_confirm_failed");
    expect(result.paymentAttemptId).toBe("attempt-1");
    expect(result.warnings).toContain(
      "BOOKING_CONFIRMATION_FAILED_MANUAL_REVIEW_REQUIRED",
    );
    // Attempt flagged
    expect(mockState.updatedAttempts).toHaveLength(1);
    expect(mockState.updatedAttempts[0]).toMatchObject({
      status: "paid_confirm_failed",
    });
    // Booking first set to paid, then to paid_confirm_failed
    expect(mockState.updatedBookings).toHaveLength(2);
    expect(mockState.updatedBookings[0]).toMatchObject({
      booking_deposit_payment_status: "paid",
    });
    expect(mockState.updatedBookings[1]).toMatchObject({
      booking_deposit_payment_status: "paid_confirm_failed",
    });
  });

  it("rejects non-draft booking status", async () => {
    mockState.bookingRow = { ...baseBooking, status: "confirmed" };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "Only draft bookings can be finalized",
    });
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  it("rejects already-paid booking deposit", async () => {
    mockState.bookingRow = {
      ...baseBooking,
      booking_deposit_payment_status: "paid",
    };

    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  it("rejects missing idempotency key", async () => {
    mockState.body = { amount: 200, paymentMethod: "cash" };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "idempotencyKey is required",
    });
  });

  it("rejects non-cash payment method", async () => {
    mockState.body = {
      idempotencyKey: "key-1",
      amount: 200,
      paymentMethod: "promptpay",
    };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "paymentMethod must be 'cash'",
    });
  });

  it("rejects zero amount", async () => {
    mockState.body = {
      idempotencyKey: "key-1",
      amount: 0,
      paymentMethod: "cash",
    };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "ZERO_BOOKING_DEPOSIT_FINALIZATION_NOT_ENABLED",
    });
  });

  it("rejects amount that does not match server-computed deposit", async () => {
    mockState.body = {
      idempotencyKey: "key-1",
      amount: 999,
      paymentMethod: "cash",
    };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "BOOKING_DEPOSIT_AMOUNT_MISMATCH",
    });
  });

  it("rejects non-POS V3 booking (missing pos_branch_id)", async () => {
    mockState.bookingRow = { ...baseBooking, pos_branch_id: null };

    await expect(endpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "Booking is not a POS V3 booking",
    });
  });

  it("rejects staff without POS branch access", async () => {
    mockState.branchAccess = false;

    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  it("rejects when availability is conflicted — no payment created", async () => {
    mockState.availabilityConflict = true;

    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  it("super_admin bypasses branch access check", async () => {
    mockState.platformRole = "super_admin";
    mockState.branchAccess = false;

    const result = await endpoint(event);

    expect(result.status).toBe("confirmed");
  });

  it("works with linked account customer (non-null user_id)", async () => {
    mockState.bookingRow = {
      ...baseBooking,
      user_id: "user-2",
      walk_in_phone: null,
    };

    const result = await endpoint(event);

    expect(result.status).toBe("confirmed");
    expect(mockState.insertedAttempts[0]).toMatchObject({
      rental_booking_id: "booking-1",
    });
  });
});
