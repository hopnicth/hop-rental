/**
 * Omise webhook handler — POS V3 QR Booking Deposit fan-out integration tests.
 *
 * Tests the routing, payment_events linkage, and error paths of the POS QR
 * branch in server/api/webhooks/omise.post.ts.
 * The applyPosRentalQrGatewayResult helper is mocked here; it is unit-tested
 * separately in admin-pos-v3-qr-booking-deposit.spec.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Global stub: useRuntimeConfig (Nuxt auto-import not available in vitest) ──
vi.stubGlobal("useRuntimeConfig", () => ({
  omiseWebhookSecret: "wh-test-secret",
}));

// ── Mock state ────────────────────────────────────────────────────────────────
const mockWh = vi.hoisted(() => ({
  sigValid: true,
  posRentalAttempt: null as Record<string, unknown> | null,
  posBooking: null as Record<string, unknown> | null,
  applyQrShouldThrow: false,
  retrieveChargeShouldThrow: false,
  paymentEventInsertError: null as { code?: string; message?: string } | null,
  insertedEvents: [] as Record<string, unknown>[],
  updatedEvents: [] as Record<string, unknown>[],
  recordedAlerts: [] as Record<string, unknown>[],
  applyQrCalls: [] as Record<string, unknown>[],
  retrieveChargeCalls: [] as string[],
}));

// ── h3 ────────────────────────────────────────────────────────────────────────
vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readRawBody: async () =>
    JSON.stringify({
      id: "evt_test_001",
      key: "charge.complete",
      data: {
        object: "charge",
        id: "chrg_test_001",
        amount: 20000,
        currency: "thb",
        successful: true,
      },
    }),
  getHeader: (_event: unknown, name: string) => {
    if (name === "omise-signature") return "t=1,v1=abc";
    if (name === "omise-signature-timestamp") return "1";
    return null;
  },
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

// ── Supabase service role ─────────────────────────────────────────────────────
vi.mock("#supabase/server", () => ({
  serverSupabaseServiceRole: () => makeWebhookClient(),
}));

// ── omise: keep normalizeOmiseCharge real, mock retrieveOmiseCharge ───────────
const liveChargeFixture = {
  status: "paid",
  gatewayChargeId: "chrg_test_001",
  gatewaySourceId: null,
  authorizeUri: null,
  qrImageUrl: null,
  expiresAt: null,
  failureCode: null,
  failureMessage: null,
  raw: { id: "chrg_test_001", amount: 20000, currency: "thb" },
};

vi.mock("~~/server/utils/omise", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~~/server/utils/omise")>();
  return {
    ...actual,
    retrieveOmiseCharge: vi.fn(async (_event: unknown, chargeId: string) => {
      mockWh.retrieveChargeCalls.push(chargeId);
      if (mockWh.retrieveChargeShouldThrow)
        throw new Error("CHARGE_RETRIEVE_FAILED");
      return liveChargeFixture;
    }),
  };
});

// ── payment-core: keep real except sig verification ───────────────────────────
vi.mock("~~/server/utils/payment-core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~~/server/utils/payment-core")>();
  return { ...actual, verifyOmiseWebhookSignature: () => mockWh.sigValid };
});

// ── pos-rental-qr-booking-deposit: keep constant, mock apply fn ───────────────
vi.mock(
  "~~/server/utils/pos-rental-qr-booking-deposit",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~~/server/utils/pos-rental-qr-booking-deposit")
      >();
    return {
      ...actual,
      applyPosRentalQrGatewayResult: vi.fn(
        async (input: Record<string, unknown>) => {
          mockWh.applyQrCalls.push(input);
          if (mockWh.applyQrShouldThrow) throw new Error("FINALIZATION_FAILED");
          return { attemptStatus: "paid", finalizerStatus: "confirmed" };
        },
      ),
    };
  },
);

// ── payments: keep real except recordPaymentAlert ─────────────────────────────
vi.mock("~~/server/utils/payments", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~~/server/utils/payments")>();
  return {
    ...actual,
    recordPaymentAlert: vi.fn(
      async (_client: unknown, opts: Record<string, unknown>) => {
        mockWh.recordedAlerts.push({ ...opts });
      },
    ),
  };
});

// ── Stub unused webhook branches (not called in QR path) ─────────────────────
vi.mock("~~/server/utils/mixed-checkout-finalization", () => ({
  MIXED_CHECKOUT_SESSION_SELECT: "id",
  MIXED_PAYMENT_ATTEMPT_SELECT:
    "id, mixed_checkout_session_id, gateway, gateway_charge_id",
  applyMixedCheckoutGatewayResult: vi.fn(async () => {}),
}));
vi.mock("~~/server/utils/rental-booking-deposit-payment", () => ({
  RENTAL_BOOKING_PAYMENT_ATTEMPT_SELECT:
    "id, booking_id, gateway, gateway_charge_id",
  applyRentalBookingDepositGatewayResult: vi.fn(async () => {}),
  assertGatewayAmountMatchesBookingDeposit: vi.fn(() => {}),
  computeBookingDepositLinesFromBooking: vi.fn(() => ({})),
  loadRentalBookingForDepositPayment: vi.fn(async () => ({})),
}));

// ── Mock DB client ────────────────────────────────────────────────────────────
function makeWebhookClient() {
  function qr(data: unknown) {
    const c: any = {
      select: (_cols?: string) => c,
      eq: () => c,
      maybeSingle: async () => ({ data, error: null }),
      single: async () => ({ data, error: null }),
      then: (r: any) => Promise.resolve({ data, error: null }).then(r),
    };
    return c;
  }
  return {
    from: (table: string): any => {
      if (table === "payment_events") {
        return {
          insert: (payload: Record<string, unknown>) => {
            mockWh.insertedEvents.push({ ...payload });
            const err = mockWh.paymentEventInsertError;
            return {
              select: () => ({
                single: async () => ({
                  data: err ? null : { id: "event-1" },
                  error: err ?? null,
                }),
              }),
            };
          },
          update: (payload: Record<string, unknown>) => {
            mockWh.updatedEvents.push({ ...payload });
            return qr(null);
          },
        };
      }
      if (table === "pos_rental_payment_attempts")
        return qr(mockWh.posRentalAttempt);
      if (table === "rental_bookings") return qr(mockWh.posBooking);
      // payment_attempts, rental_booking_payment_attempts, mixed_payment_attempts → null (not our path)
      return qr(null);
    },
  };
}

// ── Base fixtures ─────────────────────────────────────────────────────────────
const basePosAttempt = {
  id: "attempt-qr-1",
  rental_booking_id: "booking-1",
  // mig-093: the webhook fan-out dispatches on payment_purpose
  // (server/api/webhooks/omise.post.ts) — without it the attempt routes to
  // the unknown-purpose branch and never reaches the finalizer.
  payment_purpose: "booking_deposit",
  status: "pending",
  amount: 200,
  currency_code: "THB",
  gateway: "omise",
  gateway_charge_id: "chrg_test_001",
  branch_id: "branch-hq",
  staff_user_id: "staff-1",
  idempotency_key: "qr-key-1",
};
const baseBooking = {
  id: "booking-1",
  user_id: null,
  status: "draft",
  currency_code: "THB",
  deposit_amount: 5000,
  pos_branch_id: "branch-hq",
  pos_staff_user_id: "staff-1",
};

// ════════════════════════════════════════════════════════════════════════════
// Webhook POS QR fan-out tests
// ════════════════════════════════════════════════════════════════════════════
describe("Omise webhook POS V3 QR Booking Deposit fan-out", () => {
  const event = {};

  beforeEach(() => {
    mockWh.sigValid = true;
    mockWh.posRentalAttempt = null;
    mockWh.posBooking = null;
    mockWh.applyQrShouldThrow = false;
    mockWh.retrieveChargeShouldThrow = false;
    mockWh.paymentEventInsertError = null;
    mockWh.insertedEvents = [];
    mockWh.updatedEvents = [];
    mockWh.recordedAlerts = [];
    mockWh.applyQrCalls = [];
    mockWh.retrieveChargeCalls = [];
  });

  it("A. Happy path: POS QR attempt matched → helper invoked → payment_events linked", async () => {
    mockWh.posRentalAttempt = { ...basePosAttempt };
    mockWh.posBooking = { ...baseBooking };

    const result = await webhook(event);

    expect(result).toMatchObject({ ok: true, posRentalQr: true });
    // retrieveOmiseCharge was called with the matched charge ID
    expect(mockWh.retrieveChargeCalls).toHaveLength(1);
    expect(mockWh.retrieveChargeCalls[0]).toBe("chrg_test_001");
    // applyPosRentalQrGatewayResult was called with the live charge (not raw payload)
    expect(mockWh.applyQrCalls).toHaveLength(1);
    expect(mockWh.applyQrCalls[0]).toMatchObject({
      posAttempt: expect.objectContaining({ id: "attempt-qr-1" }),
      booking: expect.objectContaining({ id: "booking-1" }),
      result: expect.objectContaining({
        gatewayChargeId: "chrg_test_001",
        status: "paid",
      }),
    });
    // payment_events updated as processed with pos_rental_payment_attempt_id linked
    const processedUpdate = mockWh.updatedEvents.find(
      (u) => u.status === "processed",
    );
    expect(processedUpdate).toBeDefined();
    expect(processedUpdate?.pos_rental_payment_attempt_id).toBe("attempt-qr-1");
    expect(processedUpdate?.processed_at).toBeTruthy();
    // No alert recorded
    expect(mockWh.recordedAlerts).toHaveLength(0);
  });

  it("B. Booking not found after attempt match → payment_events failed, correct error code", async () => {
    mockWh.posRentalAttempt = { ...basePosAttempt };
    mockWh.posBooking = null; // booking not in DB

    const result = await webhook(event);

    expect(result).toMatchObject({ ok: true, missingPosRentalBooking: true });
    // payment_events updated as failed
    const failedUpdate = mockWh.updatedEvents.find(
      (u) => u.status === "failed",
    );
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate?.processing_error).toBe("POS_RENTAL_BOOKING_NOT_FOUND");
    expect(failedUpdate?.pos_rental_payment_attempt_id).toBe("attempt-qr-1");
    // Helper NOT called (booking missing)
    expect(mockWh.applyQrCalls).toHaveLength(0);
  });

  it("C. Helper throws → payment alert recorded → payment_events failed", async () => {
    mockWh.posRentalAttempt = { ...basePosAttempt };
    mockWh.posBooking = { ...baseBooking };
    mockWh.applyQrShouldThrow = true;

    const result = await webhook(event);

    expect(result).toMatchObject({ ok: true, posRentalQrWebhookFailed: true });
    // Alert recorded for the booking
    expect(mockWh.recordedAlerts).toHaveLength(1);
    expect(mockWh.recordedAlerts[0]).toMatchObject({
      kind: "booking_deposit_webhook_failed",
      audience: "admin",
      severity: "critical",
    });
    // payment_events updated as failed
    const failedUpdate = mockWh.updatedEvents.find(
      (u) => u.status === "failed",
    );
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate?.pos_rental_payment_attempt_id).toBe("attempt-qr-1");
    expect(failedUpdate?.processing_error).toContain("FINALIZATION_FAILED");
  });

  it("D. Duplicate webhook delivery (23505 on payment_events.insert) → idempotent, returns duplicate", async () => {
    mockWh.posRentalAttempt = { ...basePosAttempt };
    mockWh.posBooking = { ...baseBooking };
    mockWh.paymentEventInsertError = {
      code: "23505",
      message: "unique violation",
    };

    const result = await webhook(event);

    expect(result).toMatchObject({ ok: true, duplicate: true });
    // Helper NOT called — short-circuited at event insert
    expect(mockWh.applyQrCalls).toHaveLength(0);
    expect(mockWh.updatedEvents).toHaveLength(0);
  });

  it("E. No matching POS rental attempt → falls through to missingAttempt alert path", async () => {
    mockWh.posRentalAttempt = null; // nothing in DB for any table
    mockWh.posBooking = null;

    const result = await webhook(event);

    expect(result).toMatchObject({ ok: true, missingAttempt: true });
    // Alert recorded for missing attempt
    expect(mockWh.recordedAlerts).toHaveLength(1);
    expect(mockWh.recordedAlerts[0]).toMatchObject({
      kind: "webhook_missing_payment_attempt",
    });
    // Helper NOT called; retrieveOmiseCharge NOT called (attempt not matched)
    expect(mockWh.applyQrCalls).toHaveLength(0);
    expect(mockWh.retrieveChargeCalls).toHaveLength(0);
  });

  it("F. retrieveOmiseCharge fails → booking NOT finalized → alert recorded → payment_events failed", async () => {
    mockWh.posRentalAttempt = { ...basePosAttempt };
    mockWh.posBooking = { ...baseBooking };
    mockWh.retrieveChargeShouldThrow = true;

    const result = await webhook(event);

    expect(result).toMatchObject({ ok: true, posRentalQrWebhookFailed: true });
    // retrieveOmiseCharge was attempted
    expect(mockWh.retrieveChargeCalls).toHaveLength(1);
    expect(mockWh.retrieveChargeCalls[0]).toBe("chrg_test_001");
    // applyPosRentalQrGatewayResult NOT called — charge retrieval failed
    expect(mockWh.applyQrCalls).toHaveLength(0);
    // Alert recorded
    expect(mockWh.recordedAlerts).toHaveLength(1);
    expect(mockWh.recordedAlerts[0]).toMatchObject({
      kind: "booking_deposit_webhook_failed",
      audience: "admin",
      severity: "critical",
    });
    // payment_events updated as failed with the retrieve error message
    const failedUpdate = mockWh.updatedEvents.find(
      (u) => u.status === "failed",
    );
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate?.pos_rental_payment_attempt_id).toBe("attempt-qr-1");
    expect(failedUpdate?.processing_error).toContain("CHARGE_RETRIEVE_FAILED");
  });
});

// ── Import webhook handler ────────────────────────────────────────────────────
const webhook = (await import("../../server/api/webhooks/omise.post")).default;
