import { describe, expect, it } from "vitest";
import {
  assertRentalFulfillmentPrerequisites,
  completeRentalBookingFulfillment,
  type RentalFulfillmentPayload,
} from "~~/server/utils/rental-fulfillment";
import type { AdminClient } from "~~/server/utils/rental-fulfillment";

function mockClient(scenario: {
  booking?: Record<string, unknown>;
  checklist?: { id: string; status: string } | null;
  checklistItems?: Array<Record<string, unknown>>;
  users?: Array<Record<string, unknown>> | null;
  walkIn?: Array<Record<string, unknown>> | null;
  proofs?: Array<Record<string, unknown>> | null;
  fulfillments?: Array<Record<string, unknown>> | null;
  branchAccess?: { user_id: string } | null;
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
        insert: async () => ({ data: { id: "new-id" }, error: null }),
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

describe("assertRentalFulfillmentPrerequisites", () => {
  it("prevalidates pickup without requiring paid deposit when requested", async () => {
    const result = await assertRentalFulfillmentPrerequisites({
      adminClient: mockClient({
        booking: baseBooking("confirmed", { deposit_payment_status: "unpaid" }),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [baseUser],
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

  makeErrorTest(
    "pickup blocked if KYC is not verified (account user)",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed"),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        users: [{ id: "user-1", kyc_status: "pending" }],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "verified customer KYC",
  );

  makeErrorTest(
    "pickup blocked if walk-in ID evidence is missing",
    () => ({
      client: mockClient({
        booking: baseBooking("confirmed", {
          user_id: null,
          walk_in_phone: "0812345678",
        }),
        checklist: baseChecklist,
        checklistItems: [baseChecklistItem],
        walkIn: [{ phone: "0812345678", id_card_url: null }],
      }),
      payload: validPayload("pickup"),
      eventType: "pickup",
    }),
    422,
    "walk-in ID evidence",
  );

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
      }),
      userId: "staff-1",
      platformRole: "staff",
      bookingId: "booking-1",
      eventType: "pickup",
      payload: validPayload("pickup"),
    });

    expect(result.status).toBe("picked_up");
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
