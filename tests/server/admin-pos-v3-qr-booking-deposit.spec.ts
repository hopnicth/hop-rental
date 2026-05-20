import { beforeEach, describe, expect, it, vi } from "vitest";

// ── State shared across all test groups ───────────────────────────────────────
const mockState = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  routerParams: { bookingId: "booking-1" } as Record<string, string>,
  platformRole: "staff" as string,
  branchAccess: true,
  bookingRow: null as Record<string, unknown> | null,
  // QR attempt DB state
  existingAttemptByKey: null as Record<string, unknown> | null,
  pendingQrAttempt: null as Record<string, unknown> | null,
  insertAttemptError: null as { code?: string; message?: string } | null,
  insertedAttempts: [] as Record<string, unknown>[],
  updatedAttempts: [] as Record<string, unknown>[],
  // Gateway mocks
  expiredChargeIds: [] as string[],
  createChargeError: null as Error | null,
  availabilityConflict: false,
  // Helper unit test mocks
  finalizerShouldFail: false,
  // Stale reconciliation mocks (poll endpoint)
  retrieveChargeShouldThrow: false,
  retrieveChargeCalls: [] as string[],
  liveChargeStatus: "paid" as string,
  // Phase 2D-B3.2: active attempt lookup (active.get endpoint)
  activeAttemptForBooking: null as Record<string, unknown> | null,
  // Phase 2D-B4: cancel endpoint
  expireChargeShouldThrow: false,
}));

// ── h3 mock ───────────────────────────────────────────────────────────────────
vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: async () => mockState.body,
  getHeader: (_event: unknown, name: string) => {
    if (name === "x-forwarded-proto") return "https";
    if (name === "x-forwarded-host") return "admin.example.com";
    return null;
  },
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

// ── Availability ──────────────────────────────────────────────────────────────
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

// ── Deposit amount calculator ─────────────────────────────────────────────────
vi.mock("~~/app/utils/rental-payment-lines", () => ({
  calculateBookingDepositDueNow: vi.fn(() => 200),
}));

// ── Omise gateway ─────────────────────────────────────────────────────────────
vi.mock("~~/server/utils/omise", () => ({
  createOmisePromptPayCharge: vi.fn(async () => {
    if (mockState.createChargeError) throw mockState.createChargeError;
    return {
      gatewayChargeId: "chrg_test_001",
      gatewaySourceId: "src_test_001",
      qrImageUrl: "https://cdn.omise.co/qr/test.png",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      status: "pending",
      raw: {},
    };
  }),
  expireOmiseCharge: vi.fn(async (_event: unknown, chargeId: string) => {
    if (mockState.expireChargeShouldThrow)
      throw new Error("OMISE_EXPIRE_FAILED");
    mockState.expiredChargeIds.push(chargeId);
  }),
  retrieveOmiseCharge: vi.fn(async (_event: unknown, chargeId: string) => {
    mockState.retrieveChargeCalls.push(chargeId);
    if (mockState.retrieveChargeShouldThrow) throw new Error("RETRIEVE_FAILED");
    return {
      status: mockState.liveChargeStatus,
      gatewayChargeId: chargeId,
      gatewaySourceId: null,
      authorizeUri: null,
      qrImageUrl: null,
      expiresAt: null,
      failureCode: null,
      failureMessage: null,
      raw: { id: chargeId, amount: 20000, currency: "thb" },
    };
  }),
}));

// ── Shared finalizer mock (for helper unit tests) ────────────────────────────
vi.mock("~~/server/utils/pos-rental-booking-deposit-finalizer", () => ({
  finalizePosRentalBookingDeposit: vi.fn(async () => {
    if (mockState.finalizerShouldFail) {
      return {
        status: "paid_confirm_failed",
        bookingDepositPaidAmount: 200,
        currencyCode: "THB",
        warnings: ["BOOKING_CONFIRMATION_FAILED_MANUAL_REVIEW_REQUIRED"],
      };
    }
    return {
      status: "confirmed",
      bookingDepositPaidAmount: 200,
      currencyCode: "THB",
      booking: { id: "booking-1", status: "confirmed" },
    };
  }),
}));

// ── DB client factory ─────────────────────────────────────────────────────────
function chain(result: { data: unknown; error: unknown }) {
  const c: any = {
    select: (_cols?: string) => c,
    eq: () => c,
    in: () => c,
    order: () => c,
    limit: () => c,
    single: async () => result,
    maybeSingle: async () => result,
    then: (resolve: (v: any) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return c;
}

/** Stateful chain for pos_rental_payment_attempts that detects `.in()` calls.
 *  When `.in()` is called (active-endpoint pattern), returns activeAttemptForBooking.
 *  Otherwise returns existingAttemptByKey (creation / poll endpoint pattern). */
function makeAttemptSelectChain() {
  let usedIn = false;
  const result = () =>
    usedIn
      ? { data: mockState.activeAttemptForBooking, error: null }
      : { data: mockState.existingAttemptByKey, error: null };
  const c: any = {
    select: () => c,
    eq: () => c,
    in: () => {
      usedIn = true;
      return c;
    },
    order: () => c,
    limit: () => c,
    single: async () => result(),
    maybeSingle: async () => result(),
    then: (resolve: (v: any) => unknown) =>
      Promise.resolve(result()).then(resolve),
  };
  return c;
}

function makeAdminClient() {
  return {
    from: (table: string): any => {
      if (table === "admin_user_branch_access")
        return chain({
          data: mockState.branchAccess ? { branch_id: "branch-hq" } : null,
          error: null,
        });

      if (table === "rental_bookings")
        return {
          select: () => chain({ data: mockState.bookingRow, error: null }),
        };

      if (table === "pos_rental_payment_attempts") {
        return {
          select: (cols: string) => {
            // distinguish pending-QR lookup (narrow cols) vs full-select lookup
            if (cols === "id, gateway_charge_id")
              return chain({ data: mockState.pendingQrAttempt, error: null });
            // Full-select: use stateful chain (active endpoint uses .in(); others don't)
            return makeAttemptSelectChain();
          },
          insert: (payload: Record<string, unknown>) => {
            mockState.insertedAttempts.push({ ...payload });
            const insertResult = {
              data: mockState.insertAttemptError
                ? null
                : {
                    id: "attempt-qr-1",
                    ...payload,
                    status: payload.status ?? "pending",
                  },
              error: mockState.insertAttemptError ?? null,
            };
            return { select: () => ({ single: async () => insertResult }) };
          },
          update: (payload: Record<string, unknown>) => {
            mockState.updatedAttempts.push({ ...payload });
            return chain({ data: null, error: null });
          },
        };
      }
      return chain({ data: null, error: null });
    },
  };
}

// ── Admin auth mock ───────────────────────────────────────────────────────────
vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({
    adminClient: makeAdminClient(),
    userId: "staff-1",
    platformRole: mockState.platformRole,
  }),
}));

// ── Base data ─────────────────────────────────────────────────────────────────
const baseBooking = {
  id: "booking-1",
  user_id: null,
  walk_in_phone: "0812345678",
  status: "draft",
  asset_id: "asset-1",
  sku_id: null,
  start_date: "2026-06-01",
  end_date: "2026-06-04",
  rental_days: 3,
  hub_id: "branch-hq",
  deposit_amount: 5000,
  currency_code: "THB",
  booking_deposit_payment_status: "unpaid",
  booking_deposit_paid_amount: 0,
  pos_branch_id: "branch-hq",
  pos_staff_user_id: "staff-1",
};

// ── Import endpoints under test ───────────────────────────────────────────────
const qrEndpoint = (
  await import("../../server/api/admin/pos-v3/rental-bookings/[bookingId]/booking-deposit-qr.post")
).default;
const activeEndpoint = (
  await import("../../server/api/admin/pos-v3/rental-bookings/[bookingId]/booking-deposit-qr/active.get")
).default;
const cancelEndpoint = (
  await import("../../server/api/admin/pos-v3/rental-bookings/[bookingId]/booking-deposit-qr/cancel.post")
).default;

// ════════════════════════════════════════════════════════════════════════════
// QR Creation Endpoint Tests
// ════════════════════════════════════════════════════════════════════════════
describe("admin POS V3 QR booking deposit creation", () => {
  const event = { context: { params: { bookingId: "booking-1" } } };

  beforeEach(() => {
    mockState.body = { idempotencyKey: "qr-key-1", amount: 200 };
    mockState.platformRole = "staff";
    mockState.branchAccess = true;
    mockState.bookingRow = { ...baseBooking };
    mockState.existingAttemptByKey = null;
    mockState.pendingQrAttempt = null;
    mockState.insertAttemptError = null;
    mockState.insertedAttempts = [];
    mockState.updatedAttempts = [];
    mockState.expiredChargeIds = [];
    mockState.createChargeError = null;
    mockState.availabilityConflict = false;
  });

  it("happy path: inserts pending attempt, calls Omise, returns QR response", async () => {
    const result = await qrEndpoint(event);

    expect(result.status).toBe("pending");
    expect(result.paymentAttemptId).toBe("attempt-qr-1");
    expect(result.qrImageUrl).toBe("https://cdn.omise.co/qr/test.png");
    expect(result.amount).toBe(200);
    expect(result.currency).toBe("THB");
    expect(mockState.insertedAttempts).toHaveLength(1);
    expect(mockState.insertedAttempts[0]).toMatchObject({
      rental_booking_id: "booking-1",
      payment_purpose: "booking_deposit",
      payment_method: "promptpay_qr",
      amount: 200,
      status: "pending",
      gateway: "omise",
      branch_id: "branch-hq",
      idempotency_key: "qr-key-1",
    });
    // Gateway columns updated after charge creation
    const gatewayUpdate = mockState.updatedAttempts.find(
      (u) => u.gateway_charge_id === "chrg_test_001",
    );
    expect(gatewayUpdate).toMatchObject({
      gateway_charge_id: "chrg_test_001",
      qr_image_url: "https://cdn.omise.co/qr/test.png",
    });
  });

  it("idempotency: returns existing pending attempt for same key", async () => {
    mockState.existingAttemptByKey = {
      id: "attempt-existing",
      status: "pending",
      amount: 200,
      currency_code: "THB",
      qr_image_url: "https://cdn.omise.co/qr/existing.png",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };

    const result = await qrEndpoint(event);

    expect(result.paymentAttemptId).toBe("attempt-existing");
    expect(result.status).toBe("pending");
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  it("idempotency: returns 409 if same key is already paid", async () => {
    mockState.existingAttemptByKey = {
      id: "attempt-paid",
      status: "paid",
      amount: 200,
      currency_code: "THB",
      qr_image_url: null,
      expires_at: null,
    };

    await expect(qrEndpoint(event)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: "PAYMENT_ALREADY_PROCESSED",
    });
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  it("idempotency: returns 409 if same key is in finalizing state", async () => {
    mockState.existingAttemptByKey = {
      id: "attempt-finalizing",
      status: "finalizing",
      amount: 200,
      currency_code: "THB",
      qr_image_url: null,
      expires_at: null,
    };

    await expect(qrEndpoint(event)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("one-active-QR rule: expires old pending QR before creating new one", async () => {
    mockState.pendingQrAttempt = {
      id: "attempt-old",
      gateway_charge_id: "chrg_old_001",
    };

    await qrEndpoint(event);

    expect(mockState.expiredChargeIds).toContain("chrg_old_001");
    const expiredUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "expired",
    );
    expect(expiredUpdate).toBeDefined();
  });

  it("one-active-QR rule: skips Omise expire call if old attempt has no charge id", async () => {
    mockState.pendingQrAttempt = { id: "attempt-old", gateway_charge_id: null };

    await qrEndpoint(event);

    expect(mockState.expiredChargeIds).toHaveLength(0);
  });

  it("rejects non-draft booking", async () => {
    mockState.bookingRow = { ...baseBooking, status: "confirmed" };
    await expect(qrEndpoint(event)).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects already-paid deposit", async () => {
    mockState.bookingRow = {
      ...baseBooking,
      booking_deposit_payment_status: "paid",
    };
    await expect(qrEndpoint(event)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects zero amount", async () => {
    mockState.body = { idempotencyKey: "qr-key-1", amount: 0 };
    await expect(qrEndpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "ZERO_BOOKING_DEPOSIT_FINALIZATION_NOT_ENABLED",
    });
  });

  it("rejects amount that does not match server-computed deposit", async () => {
    mockState.body = { idempotencyKey: "qr-key-1", amount: 999 };
    await expect(qrEndpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "BOOKING_DEPOSIT_AMOUNT_MISMATCH",
    });
  });

  it("rejects non-POS V3 booking (missing pos_branch_id)", async () => {
    mockState.bookingRow = { ...baseBooking, pos_branch_id: null };
    await expect(qrEndpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "Booking is not a POS V3 booking",
    });
  });

  it("rejects staff without POS branch access", async () => {
    mockState.branchAccess = false;
    await expect(qrEndpoint(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  it("super_admin bypasses branch access check", async () => {
    mockState.platformRole = "super_admin";
    mockState.branchAccess = false;
    const result = await qrEndpoint(event);
    expect(result.status).toBe("pending");
  });

  it("rejects when availability conflicts", async () => {
    mockState.availabilityConflict = true;
    await expect(qrEndpoint(event)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockState.insertedAttempts).toHaveLength(0);
  });

  it("marks attempt failed if Omise charge creation throws", async () => {
    mockState.createChargeError = Object.assign(new Error("GATEWAY_ERROR"), {
      statusCode: 502,
    });

    await expect(qrEndpoint(event)).rejects.toMatchObject({ statusCode: 502 });
    const failedUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "failed",
    );
    expect(failedUpdate).toBeDefined();
  });

  it("rejects missing idempotency key", async () => {
    mockState.body = { amount: 200 };
    await expect(qrEndpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "idempotencyKey is required",
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Poll Endpoint Tests
// ════════════════════════════════════════════════════════════════════════════
const pollEndpoint = (
  await import("../../server/api/admin/pos-v3/rental-bookings/[bookingId]/booking-deposit-qr/poll.post")
).default;

describe("admin POS V3 QR booking deposit poll", () => {
  const event = { context: { params: { bookingId: "booking-1" } } };
  const futureExpiry = new Date(Date.now() + 300_000).toISOString();
  const pastExpiry = new Date(Date.now() - 1_000).toISOString();

  // The poll endpoint uses the same requirePlatformAdmin mock (adminClient from makeAdminClient).
  // We need a dedicated client for poll that reads pollAttemptRow.
  // Override requirePlatformAdmin for poll tests by overriding mockState values.
  beforeEach(() => {
    mockState.body = { paymentAttemptId: "attempt-qr-1" };
    mockState.updatedAttempts = [];
    mockState.bookingRow = null;
    mockState.retrieveChargeShouldThrow = false;
    mockState.retrieveChargeCalls = [];
    mockState.liveChargeStatus = "paid";
    mockState.finalizerShouldFail = false;
    // Point existingAttemptByKey to our poll attempt (poll uses .select(POS_QR_ATTEMPT_SELECT))
    mockState.existingAttemptByKey = {
      id: "attempt-qr-1",
      status: "pending",
      amount: 200,
      currency_code: "THB",
      qr_image_url: "https://cdn.omise.co/qr/test.png",
      expires_at: futureExpiry,
    };
  });

  it("returns current status for a pending attempt with future expiry", async () => {
    const result = await pollEndpoint(event);
    expect(result.paymentAttemptId).toBe("attempt-qr-1");
    expect(result.status).toBe("pending");
    expect(result.qrImageUrl).toBe("https://cdn.omise.co/qr/test.png");
  });

  it("local expiry: marks attempt expired if expiresAt is past, returns expired", async () => {
    mockState.existingAttemptByKey = {
      id: "attempt-qr-1",
      status: "pending",
      amount: 200,
      currency_code: "THB",
      qr_image_url: "https://cdn.omise.co/qr/test.png",
      expires_at: pastExpiry,
    };

    const result = await pollEndpoint(event);

    expect(result.status).toBe("expired");
    // Attempt updated in DB
    const expiredUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "expired",
    );
    expect(expiredUpdate).toBeDefined();
    expect(expiredUpdate?.expired_at).toBeTruthy();
  });

  it("does not re-expire an already-expired attempt", async () => {
    mockState.existingAttemptByKey = {
      id: "attempt-qr-1",
      status: "expired",
      amount: 200,
      currency_code: "THB",
      qr_image_url: null,
      expires_at: pastExpiry,
    };

    const result = await pollEndpoint(event);

    expect(result.status).toBe("expired");
    // No DB update issued (status already expired)
    const expiredUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "expired",
    );
    expect(expiredUpdate).toBeUndefined();
  });

  it("returns paid status without modification", async () => {
    mockState.existingAttemptByKey = {
      id: "attempt-qr-1",
      status: "paid",
      amount: 200,
      currency_code: "THB",
      qr_image_url: null,
      expires_at: null,
    };
    const result = await pollEndpoint(event);
    expect(result.status).toBe("paid");
    expect(mockState.updatedAttempts).toHaveLength(0);
  });

  it("404 when attempt not found", async () => {
    mockState.existingAttemptByKey = null;
    await expect(pollEndpoint(event)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("422 when paymentAttemptId missing from body", async () => {
    mockState.body = {};
    await expect(pollEndpoint(event)).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  // ── Stale reconciliation tests ─────────────────────────────────────────────
  // Shared fixture: stale pending attempt WITH a gateway_charge_id
  const staleQrAttempt = {
    id: "attempt-qr-1",
    rental_booking_id: "booking-1",
    status: "pending",
    amount: 200,
    currency_code: "THB",
    qr_image_url: "https://cdn.omise.co/qr/test.png",
    expires_at: pastExpiry,
    gateway_charge_id: "chrg_test_001",
    gateway: "omise",
    payment_method: "promptpay_qr",
  };

  it("stale reconciliation: live Omise charge = paid → booking finalized → returns paid", async () => {
    mockState.existingAttemptByKey = { ...staleQrAttempt };
    mockState.bookingRow = { ...baseBooking };
    mockState.liveChargeStatus = "paid";

    const result = await pollEndpoint(event);

    expect(result.status).toBe("paid");
    // retrieveOmiseCharge was called with the attempt's gateway_charge_id
    expect(mockState.retrieveChargeCalls).toHaveLength(1);
    expect(mockState.retrieveChargeCalls[0]).toBe("chrg_test_001");
    // DB: finalizing transition + paid confirmation (two updates from helper)
    const finalizingUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "finalizing",
    );
    const paidUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "paid",
    );
    expect(finalizingUpdate).toBeDefined();
    expect(paidUpdate).toBeDefined();
    expect(paidUpdate?.paid_at).toBeTruthy();
  });

  it("stale reconciliation: live Omise charge = expired → attempt updated to expired", async () => {
    mockState.existingAttemptByKey = { ...staleQrAttempt };
    mockState.bookingRow = { ...baseBooking };
    mockState.liveChargeStatus = "expired";

    const result = await pollEndpoint(event);

    expect(result.status).toBe("expired");
    // retrieveOmiseCharge called
    expect(mockState.retrieveChargeCalls).toHaveLength(1);
    // Only one DB update (expired, with expired_at)
    const expiredUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "expired",
    );
    expect(expiredUpdate).toBeDefined();
    expect(expiredUpdate?.expired_at).toBeTruthy();
    // No finalizing or paid updates (no finalization)
    expect(
      mockState.updatedAttempts.find((u) => u.status === "finalizing"),
    ).toBeUndefined();
  });

  it("stale reconciliation: retrieveOmiseCharge throws → attempt NOT expired → returns pending", async () => {
    mockState.existingAttemptByKey = { ...staleQrAttempt };
    mockState.bookingRow = { ...baseBooking };
    mockState.retrieveChargeShouldThrow = true;

    const result = await pollEndpoint(event);

    // Status stays pending — safe: payment may have succeeded at Omise
    expect(result.status).toBe("pending");
    // Retrieve was attempted
    expect(mockState.retrieveChargeCalls).toHaveLength(1);
    // NO DB updates — attempt must not be blindly marked expired
    expect(mockState.updatedAttempts).toHaveLength(0);
  });

  it("active-window: pending attempt with gateway_charge_id and Omise still pending → retrieve called, status preserved", async () => {
    // Webhook-miss fallback fires even within the valid QR window.
    // When the live Omise charge is still pending, the attempt stays pending (no-op transition).
    mockState.existingAttemptByKey = {
      ...staleQrAttempt,
      expires_at: futureExpiry, // still in active window
    };
    mockState.bookingRow = { ...baseBooking };
    mockState.liveChargeStatus = "pending"; // Omise: customer has not paid yet

    const result = await pollEndpoint(event);

    expect(result.status).toBe("pending");
    // Active-window reconciliation: retrieve IS called now (webhook-miss fallback)
    expect(mockState.retrieveChargeCalls).toHaveLength(1);
    expect(mockState.retrieveChargeCalls[0]).toBe("chrg_test_001");
  });

  // ── Active-window live-charge reconciliation tests (Phase 2D-B2.1) ──────────
  // These tests prove that the poll endpoint can recover a real paid QR charge
  // even when the Omise webhook was not delivered, before the QR window expires.

  it("active-window: live charge paid before expiry → booking finalized → returns paid", async () => {
    // Core smoke-failure recovery scenario:
    // Customer pays QR → webhook not delivered → poll detects paid charge → finalizes booking.
    mockState.existingAttemptByKey = {
      ...staleQrAttempt,
      expires_at: futureExpiry, // still in active window
    };
    mockState.bookingRow = { ...baseBooking };
    mockState.liveChargeStatus = "paid";

    const result = await pollEndpoint(event);

    expect(result.status).toBe("paid");
    // retrieveOmiseCharge was called with the attempt's gateway_charge_id
    expect(mockState.retrieveChargeCalls).toHaveLength(1);
    expect(mockState.retrieveChargeCalls[0]).toBe("chrg_test_001");
    // Full paid finalization path: finalizing transition + paid confirmation
    const finalizingUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "finalizing",
    );
    const paidUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "paid",
    );
    expect(finalizingUpdate).toBeDefined();
    expect(paidUpdate).toBeDefined();
    expect(paidUpdate?.paid_at).toBeTruthy();
  });

  it("active-window: retrieveOmiseCharge throws → status preserved, no DB writes", async () => {
    // Retrieve failure is safe: do NOT expire or fail the attempt.
    // Payment may have succeeded at Omise — local expiry here would be incorrect.
    mockState.existingAttemptByKey = {
      ...staleQrAttempt,
      expires_at: futureExpiry, // still in active window
    };
    mockState.bookingRow = { ...baseBooking };
    mockState.retrieveChargeShouldThrow = true;

    const result = await pollEndpoint(event);

    // Status stays pending — safe: payment may have succeeded at Omise
    expect(result.status).toBe("pending");
    // Retrieve was attempted
    expect(mockState.retrieveChargeCalls).toHaveLength(1);
    // NO DB updates — attempt must not be blindly marked expired or failed
    expect(mockState.updatedAttempts).toHaveLength(0);
  });

  it("active-window: finalizing attempt + live paid charge → crash-recovery → returns paid", async () => {
    // A 'finalizing' attempt within the active window: process crashed mid-finalization.
    // Active reconciliation re-enters the paid path via the helper (idempotent).
    // The helper skips the finalizing→finalizing transition write since already there.
    mockState.existingAttemptByKey = {
      ...staleQrAttempt,
      status: "finalizing",
      expires_at: futureExpiry, // still in active window
    };
    mockState.bookingRow = { ...baseBooking };
    mockState.liveChargeStatus = "paid";

    const result = await pollEndpoint(event);

    expect(result.status).toBe("paid");
    expect(mockState.retrieveChargeCalls).toHaveLength(1);
    expect(mockState.retrieveChargeCalls[0]).toBe("chrg_test_001");
    // Only ONE DB write: paid confirmation (no finalizing transition — already in finalizing)
    expect(mockState.updatedAttempts).toHaveLength(1);
    const paidUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "paid",
    );
    expect(paidUpdate).toBeDefined();
    expect(paidUpdate?.paid_at).toBeTruthy();
    // No spurious finalizing write
    expect(
      mockState.updatedAttempts.find((u) => u.status === "finalizing"),
    ).toBeUndefined();
  });

  it("stale reconciliation: finalizing attempt + live paid charge → crash-recovery → returns paid", async () => {
    // A 'finalizing' attempt with past expires_at means the process crashed mid-finalization.
    // Stale reconciliation re-enters the paid path via the helper (idempotent).
    // The helper skips the finalizing→finalizing transition write since already there.
    mockState.existingAttemptByKey = {
      ...staleQrAttempt,
      status: "finalizing",
    };
    mockState.bookingRow = { ...baseBooking };
    mockState.liveChargeStatus = "paid";

    const result = await pollEndpoint(event);

    expect(result.status).toBe("paid");
    // retrieveOmiseCharge was called
    expect(mockState.retrieveChargeCalls).toHaveLength(1);
    expect(mockState.retrieveChargeCalls[0]).toBe("chrg_test_001");
    // Only ONE DB write: paid confirmation (no finalizing transition — already in finalizing)
    expect(mockState.updatedAttempts).toHaveLength(1);
    const paidUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "paid",
    );
    expect(paidUpdate).toBeDefined();
    expect(paidUpdate?.paid_at).toBeTruthy();
    // No spurious finalizing write
    const finalizingUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "finalizing",
    );
    expect(finalizingUpdate).toBeUndefined();
  });

  // ── requires_action recovery tests (Phase 2D-B2.2) ──────────────────────────
  // A PromptPay attempt may have been incorrectly written to DB as "requires_action"
  // by a previous mapper version. The poll must re-trigger live reconciliation to
  // recover these attempts rather than treating them as stuck non-pending state.

  it("requires_action recovery: live Omise charge still pending → live recon fires, status corrected to pending", async () => {
    // DB has requires_action (poisoned by old mapper).
    // Omise live charge is still pending (customer hasn't paid yet).
    // Expected: live recon fires, status corrected back to pending.
    mockState.existingAttemptByKey = {
      ...staleQrAttempt,
      status: "requires_action",
      expires_at: futureExpiry,
    };
    mockState.bookingRow = { ...baseBooking };
    mockState.liveChargeStatus = "pending";

    const result = await pollEndpoint(event);

    expect(result.status).toBe("pending");
    // Live recon was triggered — retrieveOmiseCharge called
    expect(mockState.retrieveChargeCalls).toHaveLength(1);
    expect(mockState.retrieveChargeCalls[0]).toBe("chrg_test_001");
  });

  it("requires_action recovery: live Omise charge is paid → booking finalized → returns paid", async () => {
    // DB has requires_action (poisoned by old mapper).
    // Omise live charge shows paid — customer paid during the stuck period.
    // Expected: full finalization path, returns paid.
    mockState.existingAttemptByKey = {
      ...staleQrAttempt,
      status: "requires_action",
      expires_at: futureExpiry,
    };
    mockState.bookingRow = { ...baseBooking };
    mockState.liveChargeStatus = "paid";

    const result = await pollEndpoint(event);

    expect(result.status).toBe("paid");
    expect(mockState.retrieveChargeCalls).toHaveLength(1);
    // Full paid finalization: finalizing transition + paid confirmation
    const finalizingUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "finalizing",
    );
    const paidUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "paid",
    );
    expect(finalizingUpdate).toBeDefined();
    expect(paidUpdate).toBeDefined();
    expect(paidUpdate?.paid_at).toBeTruthy();
  });

  it("requires_action recovery: past expiry + live charge still pending → retrieve called, status preserved pending", async () => {
    // DB has requires_action with past expiry.
    // Omise still pending — must not local-expire because gateway_charge_id exists.
    mockState.existingAttemptByKey = {
      ...staleQrAttempt,
      status: "requires_action",
      expires_at: pastExpiry,
    };
    mockState.bookingRow = { ...baseBooking };
    mockState.liveChargeStatus = "pending";

    const result = await pollEndpoint(event);

    // Corrected to pending after live recon (not local-expired)
    expect(result.status).toBe("pending");
    expect(mockState.retrieveChargeCalls).toHaveLength(1);
    // No local expiry DB write
    expect(
      mockState.updatedAttempts.find((u) => u.status === "expired"),
    ).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// applyPosRentalQrGatewayResult Helper Unit Tests
// ════════════════════════════════════════════════════════════════════════════
import { applyPosRentalQrGatewayResult } from "../../server/utils/pos-rental-qr-booking-deposit";

/** Minimal in-memory DB client that tracks pos_rental_payment_attempts updates. */
function makeHelperClient() {
  const ops: Array<{ payload: Record<string, unknown> }> = [];
  const eq = () => ({
    eq,
    then: (r: any) => Promise.resolve({ data: null, error: null }).then(r),
  });
  return {
    ops,
    from: (_table: string) => ({
      update: (payload: Record<string, unknown>) => {
        ops.push({ payload });
        return { eq };
      },
    }),
  };
}

const pendingAttempt = {
  id: "attempt-qr-1",
  status: "pending",
  amount: 200,
  currency_code: "THB",
  branch_id: "branch-hq",
  staff_user_id: "staff-1",
  idempotency_key: "qr-key-1",
};
const bookingFixture = { id: "booking-1", user_id: null, currency_code: "THB" };

// Gateway charge where amount/currency match the attempt (200 THB = 20000 satang)
function matchedCharge(status: string, amountSatang = 20000) {
  return {
    status,
    gatewayChargeId: "chrg_test_001",
    gatewaySourceId: null,
    authorizeUri: null,
    qrImageUrl: null,
    expiresAt: null,
    failureCode: null,
    failureMessage: null,
    raw: { id: "chrg_test_001", amount: amountSatang, currency: "thb" },
  } as any;
}

describe("applyPosRentalQrGatewayResult helper", () => {
  beforeEach(() => {
    mockState.finalizerShouldFail = false;
  });

  it("skips already-terminal attempt (paid) — idempotency guard", async () => {
    const client = makeHelperClient();
    const result = await applyPosRentalQrGatewayResult({
      client,
      posAttempt: { ...pendingAttempt, status: "paid" },
      booking: bookingFixture,
      result: matchedCharge("paid"),
    });
    expect(result.attemptStatus).toBe("paid");
    expect(client.ops).toHaveLength(0); // no DB writes
  });

  it("finalizing + non-paid gateway result — preserves status, no downgrade, no DB writes", async () => {
    // 'finalizing' + non-paid is contradictory (paid charge was already confirmed).
    // Safe behavior: preserve 'finalizing' for manual review; do NOT downgrade.
    const client = makeHelperClient();
    const result = await applyPosRentalQrGatewayResult({
      client,
      posAttempt: { ...pendingAttempt, status: "finalizing" },
      booking: bookingFixture,
      result: matchedCharge("expired"), // non-paid contradictory result
    });
    expect(result.attemptStatus).toBe("finalizing");
    expect(client.ops).toHaveLength(0); // no DB writes — preserve for manual review
  });

  it("finalizing + paid → re-enters finalization (recovery) → resolves to paid", async () => {
    // 'finalizing' + paid is the crash-recovery path.
    // The finalizer is idempotent; the finalizing→paid transition write is skipped
    // (already in 'finalizing'), and finalizePosRentalBookingDeposit() is replayed.
    const { finalizePosRentalBookingDeposit } =
      await import("../../server/utils/pos-rental-booking-deposit-finalizer");
    const client = makeHelperClient();
    const result = await applyPosRentalQrGatewayResult({
      client,
      posAttempt: { ...pendingAttempt, status: "finalizing" },
      booking: bookingFixture,
      result: matchedCharge("paid"),
    });
    expect(result.attemptStatus).toBe("paid");
    expect(result.finalizerStatus).toBe("confirmed");
    // Only ONE DB write: paid confirmation (no finalizing transition — already there)
    expect(client.ops).toHaveLength(1);
    expect(client.ops[0].payload).toMatchObject({ status: "paid" });
    expect(client.ops[0].payload.paid_at).toBeTruthy();
    // No spurious finalizing write
    expect(
      client.ops.find((o) => o.payload.status === "finalizing"),
    ).toBeUndefined();
    // Finalizer called idempotently with correct args
    expect(finalizePosRentalBookingDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "attempt-qr-1",
        amount: 200,
        paymentMethod: "promptpay_qr",
      }),
    );
  });

  it("finalizing + paid + finalizer paid_confirm_failed → resolves to paid_confirm_failed, zero helper DB writes", async () => {
    // Recovery path: finalizer was re-entered but reports paid_confirm_failed.
    // Finalizer owns the attempt update; helper writes zero rows (no finalizing transition, no paid write).
    mockState.finalizerShouldFail = true;
    const client = makeHelperClient();
    const result = await applyPosRentalQrGatewayResult({
      client,
      posAttempt: { ...pendingAttempt, status: "finalizing" },
      booking: bookingFixture,
      result: matchedCharge("paid"),
    });
    expect(result.attemptStatus).toBe("paid_confirm_failed");
    expect(result.finalizerStatus).toBe("paid_confirm_failed");
    // Zero DB writes from helper (finalizer owns the paid_confirm_failed row update)
    expect(client.ops).toHaveLength(0);
    expect(client.ops.find((o) => o.payload.status === "paid")).toBeUndefined();
  });

  it("throws 409 on amount mismatch — no finalization", async () => {
    const client = makeHelperClient();
    await expect(
      applyPosRentalQrGatewayResult({
        client,
        posAttempt: pendingAttempt,
        booking: bookingFixture,
        result: matchedCharge("paid", 9999), // wrong satang amount
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: "PAYMENT_AMOUNT_MISMATCH",
    });
    expect(client.ops).toHaveLength(0); // attempt NOT updated
  });

  it("non-paid (failed) gateway result — updates attempt to failed, no finalizer", async () => {
    const client = makeHelperClient();
    const result = await applyPosRentalQrGatewayResult({
      client,
      posAttempt: pendingAttempt,
      booking: bookingFixture,
      result: matchedCharge("failed"),
    });
    expect(result.attemptStatus).toBe("failed");
    expect(client.ops).toHaveLength(1);
    expect(client.ops[0].payload).toMatchObject({ status: "failed" });
    expect(client.ops[0].payload.expired_at).toBeUndefined();
  });

  it("non-paid (expired) gateway result — updates attempt with expired_at, no finalizer", async () => {
    const client = makeHelperClient();
    const result = await applyPosRentalQrGatewayResult({
      client,
      posAttempt: pendingAttempt,
      booking: bookingFixture,
      result: matchedCharge("expired"),
    });
    expect(result.attemptStatus).toBe("expired");
    expect(client.ops[0].payload).toMatchObject({ status: "expired" });
    expect(client.ops[0].payload.expired_at).toBeTruthy();
  });

  it("paid result — transitions finalizing → calls finalizer → updates to paid", async () => {
    const { finalizePosRentalBookingDeposit } =
      await import("../../server/utils/pos-rental-booking-deposit-finalizer");
    const client = makeHelperClient();
    const result = await applyPosRentalQrGatewayResult({
      client,
      posAttempt: pendingAttempt,
      booking: bookingFixture,
      result: matchedCharge("paid"),
    });
    expect(result.attemptStatus).toBe("paid");
    expect(result.finalizerStatus).toBe("confirmed");
    // Two DB writes: finalizing transition + paid confirmation
    expect(client.ops[0].payload).toMatchObject({ status: "finalizing" });
    expect(client.ops[1].payload).toMatchObject({ status: "paid" });
    expect(client.ops[1].payload.paid_at).toBeTruthy();
    // Finalizer called with correct args
    expect(finalizePosRentalBookingDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "attempt-qr-1",
        amount: 200,
        paymentMethod: "promptpay_qr",
        branchId: "branch-hq",
        staffUserId: "staff-1",
        idempotencyKey: "qr-key-1",
      }),
    );
  });

  it("paid result + finalizer paid_confirm_failed — status preserved, attempt NOT updated to paid", async () => {
    mockState.finalizerShouldFail = true;
    const client = makeHelperClient();
    const result = await applyPosRentalQrGatewayResult({
      client,
      posAttempt: pendingAttempt,
      booking: bookingFixture,
      result: matchedCharge("paid"),
    });
    expect(result.attemptStatus).toBe("paid_confirm_failed");
    expect(result.finalizerStatus).toBe("paid_confirm_failed");
    // Only one DB write (finalizing transition); finalizer owns the paid_confirm_failed update
    expect(client.ops).toHaveLength(1);
    expect(client.ops[0].payload).toMatchObject({ status: "finalizing" });
    // No second update to "paid"
    const paidUpdate = client.ops.find((o) => o.payload.status === "paid");
    expect(paidUpdate).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Phase 2D-B3.2: Active QR Attempt Lookup Endpoint Tests
// ════════════════════════════════════════════════════════════════════════════
describe("admin POS V3 QR active attempt endpoint (Phase 2D-B3.2)", () => {
  const event = { context: { params: { bookingId: "booking-1" } } };

  const activeAttemptRow = {
    id: "attempt-active-1",
    rental_booking_id: "booking-1",
    payment_purpose: "booking_deposit",
    payment_method: "promptpay_qr",
    amount: 200,
    currency_code: "THB",
    status: "pending",
    gateway: "omise",
    gateway_charge_id: "chrg_active_001",
    gateway_source_id: "src_active_001",
    qr_image_url: "https://cdn.omise.co/qr/active.png",
    expires_at: new Date(Date.now() + 300_000).toISOString(),
    expired_at: null,
    idempotency_key: "qr-active-key",
    branch_id: "branch-hq",
    staff_user_id: "staff-1",
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    mockState.platformRole = "staff";
    mockState.branchAccess = true;
    mockState.bookingRow = { ...baseBooking };
    mockState.activeAttemptForBooking = null;
    mockState.insertedAttempts = [];
    mockState.updatedAttempts = [];
  });

  it("returns active attempt when a pending attempt exists for the booking", async () => {
    mockState.activeAttemptForBooking = { ...activeAttemptRow };
    const result = await activeEndpoint(event);
    expect(result.attempt).not.toBeNull();
    expect(result.attempt?.paymentAttemptId).toBe("attempt-active-1");
    expect(result.attempt?.status).toBe("pending");
    expect(result.attempt?.qrImageUrl).toBe(
      "https://cdn.omise.co/qr/active.png",
    );
    expect(result.attempt?.amount).toBe(200);
    expect(result.attempt?.currency).toBe("THB");
  });

  it("returns active attempt when attempt status is requires_action (stale mapper recovery)", async () => {
    mockState.activeAttemptForBooking = {
      ...activeAttemptRow,
      status: "requires_action",
    };
    const result = await activeEndpoint(event);
    expect(result.attempt).not.toBeNull();
    expect(result.attempt?.status).toBe("requires_action");
  });

  it("returns active attempt when attempt status is finalizing", async () => {
    mockState.activeAttemptForBooking = {
      ...activeAttemptRow,
      status: "finalizing",
    };
    const result = await activeEndpoint(event);
    expect(result.attempt).not.toBeNull();
    expect(result.attempt?.status).toBe("finalizing");
  });

  it("returns { attempt: null } when no active attempt exists (only terminal attempts)", async () => {
    mockState.activeAttemptForBooking = null;
    const result = await activeEndpoint(event);
    expect(result.attempt).toBeNull();
  });

  it("enforces branch access guard — 403 when staff has no POS access", async () => {
    mockState.branchAccess = false;
    await expect(activeEndpoint(event)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: "No POS access for selected branch",
    });
  });

  it("returns 404 when booking does not exist", async () => {
    mockState.bookingRow = null;
    await expect(activeEndpoint(event)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: "Rental booking not found",
    });
  });

  it("returns 422 when booking has no pos_branch_id (not a POS V3 booking)", async () => {
    mockState.bookingRow = { ...baseBooking, pos_branch_id: null };
    await expect(activeEndpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "Booking is not a POS V3 booking",
    });
  });

  it("super_admin bypasses branch access check", async () => {
    mockState.platformRole = "super_admin";
    mockState.branchAccess = false; // would fail for staff
    mockState.activeAttemptForBooking = { ...activeAttemptRow };
    const result = await activeEndpoint(event);
    expect(result.attempt).not.toBeNull();
    expect(result.attempt?.paymentAttemptId).toBe("attempt-active-1");
  });

  it("does not insert or update any records — endpoint is read-only", async () => {
    mockState.activeAttemptForBooking = { ...activeAttemptRow };
    await activeEndpoint(event);
    expect(mockState.insertedAttempts).toHaveLength(0);
    expect(mockState.updatedAttempts).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Phase 2D-B4: Cancel Active QR Attempt Endpoint Tests
// ════════════════════════════════════════════════════════════════════════════
describe("admin POS V3 QR cancel endpoint (Phase 2D-B4)", () => {
  const event = { context: { params: { bookingId: "booking-1" } } };

  const cancelableAttempt = {
    id: "attempt-cancel-1",
    rental_booking_id: "booking-1",
    payment_purpose: "booking_deposit",
    payment_method: "promptpay_qr",
    amount: 200,
    currency_code: "THB",
    status: "pending",
    gateway: "omise",
    gateway_charge_id: "chrg_cancel_001",
    gateway_source_id: "src_cancel_001",
    qr_image_url: "https://cdn.omise.co/qr/cancel.png",
    expires_at: new Date(Date.now() + 300_000).toISOString(),
    expired_at: null,
    idempotency_key: "qr-cancel-key",
    branch_id: "branch-hq",
    staff_user_id: "staff-1",
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    mockState.platformRole = "staff";
    mockState.branchAccess = true;
    mockState.bookingRow = { ...baseBooking };
    mockState.activeAttemptForBooking = null;
    mockState.insertedAttempts = [];
    mockState.updatedAttempts = [];
    mockState.expiredChargeIds = [];
    mockState.expireChargeShouldThrow = false;
    mockState.retrieveChargeShouldThrow = false;
    mockState.retrieveChargeCalls = [];
    mockState.liveChargeStatus = "expired";
  });

  it("happy path: expires Omise charge, marks attempt cancelled, returns { cancelled: true }", async () => {
    mockState.activeAttemptForBooking = { ...cancelableAttempt };
    const result = await cancelEndpoint(event);

    expect(result.cancelled).toBe(true);
    expect(result.paymentAttemptId).toBe("attempt-cancel-1");
    expect(mockState.expiredChargeIds).toContain("chrg_cancel_001");
    const cancelUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "cancelled",
    );
    expect(cancelUpdate).toBeDefined();
  });

  it("returns { cancelled: false, reason: 'no_cancelable_attempt' } when no pending attempt exists", async () => {
    mockState.activeAttemptForBooking = null;
    const result = await cancelEndpoint(event);
    expect(result.cancelled).toBe(false);
    expect(result.reason).toBe("no_cancelable_attempt");
    // No writes to DB
    expect(mockState.updatedAttempts).toHaveLength(0);
    expect(mockState.expiredChargeIds).toHaveLength(0);
  });

  it("requires_action attempt is also cancelable", async () => {
    mockState.activeAttemptForBooking = {
      ...cancelableAttempt,
      status: "requires_action",
    };
    const result = await cancelEndpoint(event);
    expect(result.cancelled).toBe(true);
    expect(mockState.expiredChargeIds).toContain("chrg_cancel_001");
  });

  it("fail-closed: expire fails but retrieve confirms dead → allows local cancel", async () => {
    mockState.activeAttemptForBooking = { ...cancelableAttempt };
    mockState.expireChargeShouldThrow = true;
    mockState.liveChargeStatus = "expired"; // gateway confirms already dead

    const result = await cancelEndpoint(event);
    expect(result.cancelled).toBe(true);
    expect(mockState.retrieveChargeCalls).toContain("chrg_cancel_001");
    const cancelUpdate = mockState.updatedAttempts.find(
      (u) => u.status === "cancelled",
    );
    expect(cancelUpdate).toBeDefined();
  });

  it("fail-closed: expire fails and retrieve shows live charge → throws 502", async () => {
    mockState.activeAttemptForBooking = { ...cancelableAttempt };
    mockState.expireChargeShouldThrow = true;
    mockState.liveChargeStatus = "pending"; // still live at gateway

    await expect(cancelEndpoint(event)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: "GATEWAY_CANCEL_FAILED",
    });
    // Attempt status must NOT be updated to cancelled
    expect(
      mockState.updatedAttempts.find((u) => u.status === "cancelled"),
    ).toBeUndefined();
  });

  it("fail-closed: both expire and retrieve throw → throws 502, no local update", async () => {
    mockState.activeAttemptForBooking = { ...cancelableAttempt };
    mockState.expireChargeShouldThrow = true;
    mockState.retrieveChargeShouldThrow = true;

    await expect(cancelEndpoint(event)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: "GATEWAY_CANCEL_FAILED",
    });
    expect(
      mockState.updatedAttempts.find((u) => u.status === "cancelled"),
    ).toBeUndefined();
  });

  it("no gateway_charge_id: cancels locally without calling Omise", async () => {
    mockState.activeAttemptForBooking = {
      ...cancelableAttempt,
      gateway_charge_id: null,
    };
    const result = await cancelEndpoint(event);
    expect(result.cancelled).toBe(true);
    expect(mockState.expiredChargeIds).toHaveLength(0);
    expect(mockState.retrieveChargeCalls).toHaveLength(0);
  });

  it("enforces branch access guard — 403 when staff has no POS access", async () => {
    mockState.branchAccess = false;
    await expect(cancelEndpoint(event)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: "No POS access for selected branch",
    });
  });

  it("returns 404 when booking does not exist", async () => {
    mockState.bookingRow = null;
    await expect(cancelEndpoint(event)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: "Rental booking not found",
    });
  });

  it("returns 422 when booking has no pos_branch_id (not a POS V3 booking)", async () => {
    mockState.bookingRow = { ...baseBooking, pos_branch_id: null };
    await expect(cancelEndpoint(event)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "Booking is not a POS V3 booking",
    });
  });

  it("super_admin bypasses branch access check", async () => {
    mockState.platformRole = "super_admin";
    mockState.branchAccess = false;
    mockState.activeAttemptForBooking = { ...cancelableAttempt };
    const result = await cancelEndpoint(event);
    expect(result.cancelled).toBe(true);
  });

  it("does not insert any records — cancel is update-only", async () => {
    mockState.activeAttemptForBooking = { ...cancelableAttempt };
    await cancelEndpoint(event);
    expect(mockState.insertedAttempts).toHaveLength(0);
  });
});
