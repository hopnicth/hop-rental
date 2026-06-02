import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertRentalFulfillmentPrerequisites,
  completeRentalBookingFulfillment,
  type RentalFulfillmentPayload,
} from "~~/server/utils/rental-fulfillment";
import type { AdminClient } from "~~/server/utils/rental-fulfillment";

function futureDate(offsetYears = 1): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + offsetYears);
  return d.toISOString();
}

function pastDate(offsetYears = 1): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - offsetYears);
  return d.toISOString();
}

function mockClient(scenario: {
  booking?: Record<string, unknown>;
  checklist?: { id: string; status: string } | null;
  checklistItems?: Array<Record<string, unknown>>;
  users?: Array<Record<string, unknown>> | null;
  walkIn?: Array<Record<string, unknown>> | null;
  proofs?: Array<Record<string, unknown>> | null;
  fulfillments?: Array<Record<string, unknown>> | null;
  branchAccess?: { user_id: string } | null;
  /** kyc_profiles rows for the booking's user (replaces users.kyc_status). */
  kycProfiles?: Array<Record<string, unknown>> | null;
  /** kyc_pickup_overrides rows for this booking. */
  kycOverrides?: Array<Record<string, unknown>> | null;
  /** Optional callback to capture INSERT payloads for assertion. */
  onInsert?: (table: string, payload: Record<string, unknown>) => void;
}): AdminClient {
  let updatedBooking: Record<string, unknown> | null = null;
  const storage = {
    from: () => ({
      upload: async () => ({ error: null }),
      getPublicUrl: () => ({ data: { publicUrl: "https://cdn.test/s.png" } }),
      remove: async () => ({ error: null }),
    }),
  };

  return {
    from: (table: string) => {
      let updatePayload: Record<string, unknown> | null = null;
      const singleResult = () => {
        if (table === "rental_bookings") {
          return {
            data: updatedBooking ?? scenario.booking ?? null,
            error: null,
          };
        }
        if (table === "rental_booking_checklists") {
          return { data: scenario.checklist ?? null, error: null };
        }
        if (table === "users") {
          return { data: scenario.users?.[0] ?? null, error: null };
        }
        if (table === "walk_in_customers") {
          return { data: scenario.walkIn?.[0] ?? null, error: null };
        }
        if (table === "rental_booking_deposit_proofs") {
          return { data: scenario.proofs?.[0] ?? null, error: null };
        }
        if (table === "rental_booking_fulfillments") {
          return { data: scenario.fulfillments?.[0] ?? null, error: null };
        }
        if (table === "admin_user_branch_access") {
          return {
            data: scenario.branchAccess ?? { user_id: "staff-1" },
            error: null,
          };
        }
        return { data: null, error: null };
      };
      const listResult = () => {
        if (table === "rental_booking_checklist_items") {
          return { data: scenario.checklistItems ?? [], error: null };
        }
        if (table === "users") {
          return { data: scenario.users ?? [], error: null };
        }
        if (table === "kyc_profiles") {
          // Blocked by default — tests that need to pass KYC must provide kycProfiles explicitly.
          return { data: scenario.kycProfiles ?? [], error: null };
        }
        if (table === "kyc_pickup_overrides") {
          return { data: scenario.kycOverrides ?? [], error: null };
        }
        return singleResult();
      };
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        gt: () => chain,
        maybeSingle: async () => {
          if (table === "rental_bookings" && updatePayload) {
            updatedBooking = { ...(scenario.booking ?? {}), ...updatePayload };
            return { data: updatedBooking, error: null };
          }
          return singleResult();
        },
        single: async () => singleResult(),
        insert: async (payload: Record<string, unknown>) => {
          scenario.onInsert?.(table, payload);
          return { data: { id: "new-id" }, error: null };
        },
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          return chain;
        },
        delete: () => chain,
        then: (resolve: any) => resolve(listResult()),
      };
      return chain;
    },
    storage,
  } as unknown as AdminClient;
}

function baseBooking(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    user_id: "user-1",
    walk_in_phone: null,
    status,
    kyc_profile_id: "kyc-1",
    deposit_paid_amount: 1000,
    deposit_payment_status: "paid",
    deposit_refund_status: "not_refunded",
    deposit_refund_amount: 0,
    deposit_refund_notes: null,
    pos_branch_id: "branch-1",
    asset: { storage_branch_id: "branch-1" },
    ...extra,
  };
}

function validPayload(
  eventType: "pickup" | "return",
  overrides: Partial<RentalFulfillmentPayload> = {},
): RentalFulfillmentPayload {
  return {
    signatureDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    notes: "ok",
    ...overrides,
  };
}

const baseChecklist = { id: "chk-1", status: "completed" };
const baseChecklistItem = {
  id: "ci-1",
  is_required: true,
  checked: true,
  result_status: "passed",
};
const baseUser = { id: "user-1", kyc_status: "verified" };
const baseKycProfile = {
  id: "kyc-1",
  status: "verified",
  valid_until: futureDate(),
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("assertRentalFulfillmentPrerequisites", () => {
  it("prevalidates pickup without requiring paid deposit when requested", async () => {
    const result = await assertRentalFulfillmentPrerequisites({
      adminClient: mockClient({
        booking: baseBooking("confirmed", { deposit_payment_status: "unpaid" }),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
        kycProfiles: [baseKycProfile],
      }),
      userId: "staff-1",
      platformRole: "staff",
      bookingId: "booking-1",
      eventType: "pickup",
      payload: validPayload("pickup"),
      requirePaidPickupDeposit: false,
    });

    expect(result).toMatchObject({
      requiredStatus: "confirmed",
      branchId: "branch-1",
      checklistId: "chk-1",
    });
  });

  it("prevalidates signature before callers mutate payment", async () => {
    await expect(
      assertRentalFulfillmentPrerequisites({
        adminClient: mockClient({
          booking: baseBooking("confirmed", {
            deposit_payment_status: "unpaid",
          }),
          checklist: baseChecklist,
          checklistItems: [baseChecklistItem],
          users: [baseUser],
          kycProfiles: [baseKycProfile],
        }),
        userId: "staff-1",
        platformRole: "staff",
        bookingId: "booking-1",
        eventType: "pickup",
        payload: validPayload("pickup", { signatureDataUrl: "bad" }),
        requirePaidPickupDeposit: false,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

function makeErrorTest(
  name: string,
  setup: () => {
    client: AdminClient;
    payload: RentalFulfillmentPayload;
    eventType: "pickup" | "return";
  },
  expectedStatus: number,
  expectedMessage: string,
) {
  it(name, async () => {
    const { client, payload, eventType } = setup();
    try {
      await completeRentalBookingFulfillment({
        adminClient: client,
        userId: "staff-1",
        platformRole: "staff",
        bookingId: "booking-1",
        eventType,
        payload,
      });
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.statusCode).toBe(expectedStatus);
      expect(err.statusMessage).toContain(expectedMessage);
    }
  });
}

describe("completeRentalBookingFulfillment", () => {
  // ─── Pickup ─────────────────────────────────────────────

  makeErrorTest(
    "pickup blocked if booking status is not confirmed",
    () => ({
      client: mockClient({ booking: baseBooking("draft") }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "confirmed",
  );

  makeErrorTest(
    "pickup blocked if booking was marked no-show",
    () => ({
      client: mockClient({ booking: baseBooking("no_show") }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "confirmed",
  );

  makeErrorTest(
    "pickup blocked if checklist is missing",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed"),
        checklist: null,
        users: [baseUser],
        kycProfiles: [baseKycProfile],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "completed checklist",
  );

  makeErrorTest(
    "pickup blocked if checklist is not completed",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed"),
        checklist: null, // Supabase .eq("status", "completed") would return null for in_progress checklist
        users: [baseUser],
        kycProfiles: [baseKycProfile],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "completed checklist",
  );

  makeErrorTest(
    "pickup blocked if required checklist items are unanswered",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [
          {
            id: "ci-1",
            is_required: true,
            checked: false,
            result_status: "pending",
          },
        ],
        users: [baseUser],
        kycProfiles: [baseKycProfile],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "unanswered required items",
  );

  makeErrorTest(
    "pickup blocked if signature is missing",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
        kycProfiles: [baseKycProfile],
      }),
      payload: validPayload("pickup", { signatureDataUrl: null }),
      eventType: "pickup",
    }),
    422,
    "signature is required",
  );

  makeErrorTest(
    "pickup blocked if deposit is not paid",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed", { deposit_payment_status: "unpaid" }),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "paid deposit",
  );

  // ── Phase 2E-B1.5: POS V3 math-based remaining security deposit gate ─────────

  it("B1.5: POS V3 pickup blocked when remaining security deposit is due (math gate)", async () => {
    // booking_deposit_paid_amount > 0 → POS V3 path; deposit_payment_status unpaid → remaining due
    try {
      await completeRentalBookingFulfillment({
        adminClient: mockClient({
          booking: {
            ...baseBooking("confirmed"),
            deposit_amount: 5000,
            booking_deposit_paid_amount: 200,
            deposit_payment_status: "unpaid",
            deposit_paid_amount: 0,
          },
          checklist: baseChecklist,
          checklistItems: [baseChecklistItem],
          users: [baseUser],
        }),
        userId: "staff-1",
        platformRole: "staff",
        bookingId: "booking-1",
        eventType: "pickup",
        payload: validPayload("pickup"),
      });
      expect.fail("Should have thrown REMAINING_SECURITY_DEPOSIT_DUE");
    } catch (err: any) {
      expect(err.statusCode).toBe(422);
      expect(err.statusMessage).toBe("REMAINING_SECURITY_DEPOSIT_DUE");
    }
  });

  it("B1.5: POS V3 pickup allowed when remaining deposit is fully collected", async () => {
    // booking_deposit_paid=200 + deposit_paid_amount=4800 = total 5000 = deposit_amount
    const result = await completeRentalBookingFulfillment({
      adminClient: mockClient({
        booking: {
          ...baseBooking("confirmed"),
          deposit_amount: 5000,
          booking_deposit_paid_amount: 200,
          deposit_payment_status: "paid",
          deposit_paid_amount: 4800,
        },
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
        kycProfiles: [baseKycProfile],
      }),
      userId: "staff-1",
      platformRole: "staff",
      bookingId: "booking-1",
      eventType: "pickup",
      payload: validPayload("pickup"),
    });
    expect(result.status).toBe("picked_up");
  });

  it("B1.5: POS V3 pickup allowed when booking deposit covers full deposit (no remaining due)", async () => {
    // deposit=150, booking_deposit_paid=150 → totalCovered=150 = required → remainingSecurityDue=0
    const result = await completeRentalBookingFulfillment({
      adminClient: mockClient({
        booking: {
          ...baseBooking("confirmed"),
          deposit_amount: 150,
          booking_deposit_paid_amount: 150,
          deposit_payment_status: "unpaid",
          deposit_paid_amount: 0,
        },
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
        kycProfiles: [baseKycProfile],
      }),
      userId: "staff-1",
      platformRole: "staff",
      bookingId: "booking-1",
      eventType: "pickup",
      payload: validPayload("pickup"),
    });
    expect(result.status).toBe("picked_up");
  });

  // ── Phase 2E-B1 deposit guard safety ────────────────────────────────────────

  it("pickup allowed when booking_deposit_payment_status === paid (POS V3 deposit path)", async () => {
    const result = await completeRentalBookingFulfillment({
      adminClient: mockClient({
        booking: baseBooking("confirmed", {
          deposit_payment_status: "unpaid",
          booking_deposit_payment_status: "paid",
        }),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
        kycProfiles: [baseKycProfile],
      }),
      userId: "staff-1",
      platformRole: "staff",
      bookingId: "booking-1",
      eventType: "pickup",
      payload: validPayload("pickup"),
    });
    expect(result.status).toBe("picked_up");
  });

  makeErrorTest(
    "pickup blocked if booking_deposit_payment_status === paid_confirm_failed (not paid)",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed", {
          deposit_payment_status: "unpaid",
          booking_deposit_payment_status: "paid_confirm_failed",
        }),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "paid deposit",
  );

  makeErrorTest(
    "pickup blocked if booking_deposit_payment_status === unpaid (both fields unpaid)",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed", {
          deposit_payment_status: "unpaid",
          booking_deposit_payment_status: "unpaid",
        }),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "paid deposit",
  );

  // ── KYC gate tests (TASK 3) ─────────────────────────────────────────────────

  makeErrorTest(
    "pickup blocked when KYC profile is pending",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        kycProfiles: [{ status: "pending", valid_until: null, created_at: "2026-01-01T00:00:00.000Z" }],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "Pickup KYC gate",
  );

  makeErrorTest(
    "pickup blocked when KYC profile is rejected",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        kycProfiles: [{ status: "rejected", valid_until: null, created_at: "2026-01-01T00:00:00.000Z" }],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "Pickup KYC gate",
  );

  makeErrorTest(
    "pickup blocked when KYC profile is revoked",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        kycProfiles: [{ status: "revoked", valid_until: null, created_at: "2026-01-01T00:00:00.000Z" }],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "Pickup KYC gate",
  );

  makeErrorTest(
    "pickup blocked when KYC profile is verified but expired at confirm time",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        kycProfiles: [
          { status: "verified", valid_until: pastDate(), created_at: "2025-01-01T00:00:00.000Z" },
        ],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "Pickup KYC gate",
  );

  makeErrorTest(
    "pickup blocked when no KYC profile exists (no_profile)",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        kycProfiles: [],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "Pickup KYC gate",
  );

  makeErrorTest(
    "walk-in with kyc_profile_id = null is blocked (no_profile — TASK 4 sets the FK)",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed", { user_id: null, walk_in_phone: "0812345678", kyc_profile_id: null }),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        kycProfiles: [], // kyc_profile_id = null → code skips DB query entirely
        kycOverrides: [],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "Pickup KYC gate",
  );

  makeErrorTest(
    "pickup blocked when override is for a different booking",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        kycProfiles: [{ status: "pending", valid_until: null, created_at: "2026-01-01T00:00:00.000Z" }],
        kycOverrides: [{ booking_id: "different-booking" }],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "Pickup KYC gate",
  );

  it("pickup proceeds when KYC is not ready but a valid booking-specific override exists", async () => {
    const result = await completeRentalBookingFulfillment({
      adminClient: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        kycProfiles: [{ id: "kyc-1", status: "pending", valid_until: null, created_at: "2026-01-01T00:00:00.000Z" }],
        kycOverrides: [{ id: "override-1", booking_id: "booking-1" }],
      }),
      userId: "staff-1",
      platformRole: "staff",
      bookingId: "booking-1",
      eventType: "pickup",
      payload: validPayload("pickup"),
    });
    expect(result.status).toBe("picked_up");
  });

  it("confirmed-time re-check blocks expired KYC even when readiness was previously passing", async () => {
    // Simulates the TOCTOU scenario: KYC was valid at readiness time but expired
    // by confirm time. confirm must re-check fresh (live new Date()).
    try {
      await completeRentalBookingFulfillment({
        adminClient: mockClient({
          booking: baseBooking("confirmed"),
          checklist: baseChecklist,
          checklistItems: [baseChecklistItem],
          kycProfiles: [
            { status: "verified", valid_until: pastDate(), created_at: "2025-01-01T00:00:00.000Z" },
          ],
          kycOverrides: [],
        }),
        userId: "staff-1",
        platformRole: "staff",
        bookingId: "booking-1",
        eventType: "pickup",
        payload: validPayload("pickup"),
      });
      expect.fail("Should have thrown — expired KYC must block confirm pickup");
    } catch (err: any) {
      expect(err.statusCode).toBe(422);
      expect(err.statusMessage).toContain("Pickup KYC gate");
    }
  });

  makeErrorTest(
    "duplicate pickup is rejected",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
        fulfillments: [{ id: "f1" }],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    409,
    "already recorded",
  );

  it("pickup success changes status to picked_up", async () => {
    const result = await completeRentalBookingFulfillment({
      adminClient: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
        kycProfiles: [baseKycProfile],
      }),
      userId: "staff-1",
      platformRole: "staff",
      bookingId: "booking-1",
      eventType: "pickup",
      payload: validPayload("pickup"),
    });

    expect(result.status).toBe("picked_up");
  });

  // ── Walk-in KYC gate (TASK 4.1b) ─────────────────────────────────────────────

  it("walk-in with kyc_profile_id set and verified linked profile succeeds", async () => {
    const result = await completeRentalBookingFulfillment({
      adminClient: mockClient({
        booking: baseBooking("confirmed", { user_id: null, walk_in_phone: "0812345678", kyc_profile_id: "kyc-1" }),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        kycProfiles: [baseKycProfile],
      }),
      userId: "staff-1",
      platformRole: "staff",
      bookingId: "booking-1",
      eventType: "pickup",
      payload: validPayload("pickup"),
    });
    expect(result.status).toBe("picked_up");
  });

  it("registered booking resolves KYC via user_id — kyc_profile_id on booking is ignored", async () => {
    // user_id is set → code takes user_id path regardless of kyc_profile_id column value
    const result = await completeRentalBookingFulfillment({
      adminClient: mockClient({
        booking: baseBooking("confirmed", { user_id: "user-1", kyc_profile_id: "some-other-profile" }),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
        kycProfiles: [baseKycProfile],
      }),
      userId: "staff-1",
      platformRole: "staff",
      bookingId: "booking-1",
      eventType: "pickup",
      payload: validPayload("pickup"),
    });
    expect(result.status).toBe("picked_up");
  });

  // ── KYC snapshot write tests (TASK 4.1b) ─────────────────────────────────────

  it("pickup with verified KYC writes snapshot with kyc_authorized_via=verified and profile id", async () => {
    let capturedInsert: Record<string, unknown> | null = null;
    const result = await completeRentalBookingFulfillment({
      adminClient: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
        kycProfiles: [baseKycProfile],
        onInsert: (table, payload) => {
          if (table === "rental_booking_fulfillments") capturedInsert = payload;
        },
      }),
      userId: "staff-1",
      platformRole: "staff",
      bookingId: "booking-1",
      eventType: "pickup",
      payload: validPayload("pickup"),
    });
    expect(result.status).toBe("picked_up");
    expect(capturedInsert?.kyc_authorized_via).toBe("verified");
    expect(capturedInsert?.kyc_profile_id).toBe("kyc-1");
    expect(capturedInsert?.kyc_override_id).toBeNull();
    expect(capturedInsert?.kyc_status_snapshot).toBe("verified");
  });

  it("pickup with override KYC writes snapshot using the matched override id — not arbitrary first entry", async () => {
    // Decoy override in position [0]; matched override in position [1].
    // Snapshot must use the matched id, proving no arbitrary-index reliance.
    let capturedInsert: Record<string, unknown> | null = null;
    const result = await completeRentalBookingFulfillment({
      adminClient: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
        kycProfiles: [{ id: "kyc-1", status: "pending", valid_until: null, created_at: "2026-01-01T00:00:00.000Z" }],
        kycOverrides: [
          { id: "override-decoy", booking_id: "different-booking" },
          { id: "override-1", booking_id: "booking-1" },
        ],
        onInsert: (table, payload) => {
          if (table === "rental_booking_fulfillments") capturedInsert = payload;
        },
      }),
      userId: "staff-1",
      platformRole: "staff",
      bookingId: "booking-1",
      eventType: "pickup",
      payload: validPayload("pickup"),
    });
    expect(result.status).toBe("picked_up");
    expect(capturedInsert?.kyc_authorized_via).toBe("override");
    expect(capturedInsert?.kyc_override_id).toBe("override-1");
    expect(capturedInsert?.kyc_override_id).not.toBe("override-decoy");
    // Profile evidence captured even though insufficient (audit trail)
    expect(capturedInsert?.kyc_profile_id).toBe("kyc-1");
    expect(capturedInsert?.kyc_status_snapshot).toBe("pending");
  });

  it("return event does not write KYC snapshot columns", async () => {
    let capturedInsert: Record<string, unknown> | null = null;
    const result = await completeRentalBookingFulfillment({
      adminClient: mockClient({
        booking: baseBooking("picked_up"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        proofs: [{ id: "p1", amount: 500 }],
        users: [baseUser],
        onInsert: (table, payload) => {
          if (table === "rental_booking_fulfillments") capturedInsert = payload;
        },
      }),
      userId: "staff-1",
      platformRole: "staff",
      bookingId: "booking-1",
      eventType: "return",
      payload: validPayload("return", { refundAmount: 500, refundStatus: "refunded" }),
    });
    expect(result.status).toBe("returned");
    expect(capturedInsert?.kyc_authorized_via).toBeUndefined();
    expect(capturedInsert?.kyc_profile_id).toBeUndefined();
    expect(capturedInsert?.kyc_override_id).toBeUndefined();
    expect(capturedInsert?.kyc_status_snapshot).toBeUndefined();
    expect(capturedInsert?.kyc_valid_until_snapshot).toBeUndefined();
  });

  // ── App-level snapshot consistency guards (source inspection) ─────────────────

  it("app guard: verified snapshot requires kycProfile to be non-null", () => {
    const src = readFileSync(resolve(process.cwd(), "server/utils/rental-fulfillment.ts"), "utf8");
    expect(src).toContain("KYC snapshot inconsistency: verified gate with no profile");
  });

  it("app guard: override snapshot requires matchedOverrideId (override SELECT must include id)", () => {
    const src = readFileSync(resolve(process.cwd(), "server/utils/rental-fulfillment.ts"), "utf8");
    expect(src).toContain("KYC snapshot inconsistency: override gate with no override id");
  });

  it("KYC gate does not query kyc_profiles by phone — user_id and kyc_profile_id only", () => {
    const src = readFileSync(resolve(process.cwd(), "server/utils/rental-fulfillment.ts"), "utf8");
    // Registered: user_id path
    expect(src).toContain('.eq("user_id", userId)');
    // Walk-in: kyc_profile_id FK path
    expect(src).toContain('.eq("id", kycProfileId)');
    // Phone-based KYC matching is prohibited
    expect(src).not.toContain('.eq("walk_in_phone"');
  });

  it("KYC gate resolves registered via user_id (if branch) and walk-in via kyc_profile_id (else-if branch)", () => {
    const src = readFileSync(resolve(process.cwd(), "server/utils/rental-fulfillment.ts"), "utf8");
    expect(src).toContain("if (userId)");
    expect(src).toContain("else if (kycProfileId)");
  });

  it("override SELECT includes id for snapshot capture", () => {
    const src = readFileSync(resolve(process.cwd(), "server/utils/rental-fulfillment.ts"), "utf8");
    expect(src).toContain('"id, booking_id"');
  });

  it("profile SELECT includes id for snapshot capture", () => {
    const src = readFileSync(resolve(process.cwd(), "server/utils/rental-fulfillment.ts"), "utf8");
    expect(src).toContain('"id, status, valid_until, created_at"');
  });

  // ─── Return ─────────────────────────────────────────────

  makeErrorTest(
    "return blocked if booking status is not picked_up",
    () => ({
      client: mockClient({ booking: baseBooking("confirmed") }),
      payload: validPayload("return"),
      eventType: "return",
    }),
    422,
    "picked_up",
  );

  makeErrorTest(
    "return blocked if checklist is missing",
    () => ({
      client: mockClient({
        booking: baseBooking("picked_up"),
        checklist: null,
      }),
      payload: validPayload("return"),
      eventType: "return",
    }),
    422,
    "completed checklist",
  );

  makeErrorTest(
    "return blocked if checklist is not completed",
    () => ({
      client: mockClient({
        booking: baseBooking("picked_up"),
        checklist: null, // Supabase .eq("status", "completed") would return null for in_progress checklist
      }),
      payload: validPayload("return"),
      eventType: "return",
    }),
    422,
    "completed checklist",
  );

  makeErrorTest(
    "return blocked if signature is missing",
    () => ({
      client: mockClient({
        booking: baseBooking("picked_up"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
      }),
      payload: validPayload("return", { signatureDataUrl: null }),
      eventType: "return",
    }),
    422,
    "signature is required",
  );

  makeErrorTest(
    "return blocked if refund amount exceeds deposit paid",
    () => ({
      client: mockClient({
        booking: baseBooking("picked_up"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        proofs: [{ id: "p1", amount: 500 }],
      }),
      payload: validPayload("return", { refundAmount: 1500 }),
      eventType: "return",
    }),
    422,
    "Refund amount cannot exceed",
  );

  makeErrorTest(
    "return blocked if refund proof is missing when refund > 0",
    () => ({
      client: mockClient({
        booking: baseBooking("picked_up"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        proofs: null,
      }),
      payload: validPayload("return", { refundAmount: 500 }),
      eventType: "return",
    }),
    422,
    "refund proof",
  );

  makeErrorTest(
    "return blocked if refund status requires proof but proof is missing",
    () => ({
      client: mockClient({
        booking: baseBooking("picked_up"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        proofs: null,
      }),
      payload: validPayload("return", {
        refundAmount: 0,
        refundStatus: "refunded",
      }),
      eventType: "return",
    }),
    422,
    "refund proof",
  );

  makeErrorTest(
    "duplicate return is rejected",
    () => ({
      client: mockClient({
        booking: baseBooking("picked_up"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        fulfillments: [{ id: "f1" }],
        proofs: [{ id: "p1", amount: 500 }],
      }),
      payload: validPayload("return"),
      eventType: "return",
    }),
    409,
    "already recorded",
  );

  it("return success changes status to returned", async () => {
    const result = await completeRentalBookingFulfillment({
      adminClient: mockClient({
        booking: baseBooking("picked_up"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        proofs: [{ id: "p1", amount: 500 }],
        users: [baseUser],
      }),
      userId: "staff-1",
      platformRole: "staff",
      bookingId: "booking-1",
      eventType: "return",
      payload: validPayload("return", {
        refundAmount: 500,
        refundStatus: "refunded",
      }),
    });

    expect(result.status).toBe("returned");
  });
});
