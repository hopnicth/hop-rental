import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDaysToLocalDate,
  toBangkokLocalDate,
} from "../../server/utils/rental-cancellation-policy";

const mockState = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  platformRole: "staff",
  branchAccess: true,
  branchRow: null as Record<string, unknown> | null,
  assetRow: null as Record<string, unknown> | null,
  customerRow: null as Record<string, unknown> | null,
  availabilityConflict: false,
  insertedBookings: [] as Record<string, unknown>[],
  insertedPaymentLines: [] as Record<string, unknown>[],
  upsertedWalkIns: [] as Record<string, unknown>[],
  touchedHeldBalanceEvents: false,
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
      if (mockState.availabilityConflict) {
        throw createError({
          statusCode: 409,
          statusMessage: "RENTAL_BOOKING_CONFLICT",
        });
      }
    }),
    isRentalBookingConflictError: (error: unknown) =>
      String((error as { statusMessage?: unknown })?.statusMessage ?? "") ===
      "RENTAL_BOOKING_CONFLICT",
    throwRentalBookingConflict: () => {
      throw createError({
        statusCode: 409,
        statusMessage: "RENTAL_BOOKING_CONFLICT",
      });
    },
  };
});

function queryResult<T>(result: T) {
  const chain: any = {
    select: () => chain,
    in: () => chain,
    eq: () => chain,
    lt: () => chain,
    gt: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: (value: T) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return chain;
}

const baseBranch = {
  id: "branch-hq",
  code: "HQ",
  name_th: "HQ Branch",
  name_en: "HQ",
  is_active: true,
};

const baseAsset = {
  id: "asset-1",
  code: "CAM-1",
  slug: "camera-1",
  name_th: "Camera",
  name_en: "Camera",
  brand: "HOP",
  thumbnail_url: "thumb.jpg",
  currency_code: "THB",
  daily_rate: 1000,
  weekly_rate: 0,
  monthly_rate: 0,
  daily_enabled: true,
  weekly_enabled: false,
  monthly_enabled: false,
  deposit_amount: 5000,
  min_rental_days: 1,
  max_rental_days: 30,
  storage_branch_id: "branch-hq",
  matches: [{ product_id: "product-1", sort_order: 1 }],
};

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({
    adminClient: {
      from: (table: string) => {
        if (table === "admin_user_branch_access") {
          return queryResult({
            data: mockState.branchAccess ? { branch_id: "branch-hq" } : null,
            error: null,
          });
        }
        if (table === "store_branches") {
          return queryResult({ data: mockState.branchRow, error: null });
        }
        if (table === "users") {
          return queryResult({ data: mockState.customerRow, error: null });
        }
        if (table === "assets") {
          return queryResult({ data: mockState.assetRow, error: null });
        }
        if (table === "walk_in_customers") {
          return {
            upsert: async (payload: Record<string, unknown>) => {
              mockState.upsertedWalkIns.push(payload);
              return { error: null };
            },
          };
        }
        if (table === "rental_booking_payment_lines") {
          return {
            insert: async (payload: Record<string, unknown>[]) => {
              mockState.insertedPaymentLines.push(...payload);
              return { error: null };
            },
          };
        }
        if (table === "rental_bookings") {
          return {
            insert: async (payload: Record<string, unknown>) => {
              mockState.insertedBookings.push(payload);
              return { error: null };
            },
          };
        }
        if (table === "rental_held_balance_events") {
          mockState.touchedHeldBalanceEvents = true;
        }
        throw new Error(`Unexpected table ${table}`);
      },
    },
    userId: "staff-1",
    platformRole: mockState.platformRole,
  }),
}));

const endpoint = (
  await import("../../server/api/admin/pos-v3/rental-bookings/drafts.post")
).default;

describe("admin POS V3 rental draft API", () => {
  beforeEach(() => {
    mockState.body = {
      idempotencyKey: "draft-key-1",
      walkInPhone: "0812345678",
      bookerName: "Walk In",
      assetId: "asset-1",
      branchId: "branch-hq",
      startDate: "2026-05-21",
      endDate: "2026-05-23",
    };
    mockState.platformRole = "staff";
    mockState.branchAccess = true;
    mockState.branchRow = { ...baseBranch };
    mockState.assetRow = { ...baseAsset };
    mockState.customerRow = {
      id: "user-1",
      full_name: "Account Customer",
      phone: "0899999999",
    };
    mockState.availabilityConflict = false;
    mockState.insertedBookings = [];
    mockState.insertedPaymentLines = [];
    mockState.upsertedWalkIns = [];
    mockState.touchedHeldBalanceEvents = false;
  });

  it("creates a draft booking only, with unpaid Booking Deposit fields", async () => {
    const result = await endpoint({});

    expect(result.booking.status).toBe("draft");
    expect(mockState.insertedBookings[0]).toMatchObject({
      status: "draft",
      booking_deposit_payment_status: "unpaid",
      booking_deposit_paid_amount: 0,
      booking_deposit_paid_at: null,
      deposit_paid_amount: 0,
      deposit_payment_status: "unpaid",
      checkout_paid_amount: 0,
    });
    expect(mockState.touchedHeldBalanceEvents).toBe(false);
  });

  it("returns capped Booking Deposit quote and paymentRequired flag", async () => {
    const result = await endpoint({});

    expect(result.quote).toMatchObject({
      rentalTotalAmount: 3000,
      requiredSecurityDepositAmount: 5000,
      bookingDepositDueNow: 200,
      remainingSecurityDepositDueAtPickup: 4800,
      currencyCode: "THB",
    });
    expect(result.payment).toMatchObject({
      bookingDepositPaymentStatus: "unpaid",
      paymentRequired: true,
    });
  });

  it("persists branch and staff context", async () => {
    await endpoint({});

    expect(mockState.insertedBookings[0]).toMatchObject({
      pos_branch_id: "branch-hq",
      pos_branch_code: "HQ",
      pos_branch_name: "HQ Branch",
      pos_staff_user_id: "staff-1",
    });
  });

  it("creates POS V3 draft quote payment-line snapshots", async () => {
    await endpoint({});

    expect(
      mockState.insertedPaymentLines.map((line) => line.line_type),
    ).toEqual(["rental_fee", "booking_deposit", "refundable_security_deposit"]);
    expect(mockState.insertedPaymentLines[0]).toMatchObject({
      source: "pos_v3_draft_quote",
    });
  });

  it("caps Booking Deposit when security deposit is lower than policy amount", async () => {
    mockState.assetRow = { ...baseAsset, deposit_amount: 100 };

    const result = await endpoint({});

    expect(result.quote.bookingDepositDueNow).toBe(100);
    expect(result.quote.remainingSecurityDepositDueAtPickup).toBe(0);
  });

  it("allows zero-deposit draft with explicit zero-due warning", async () => {
    mockState.assetRow = { ...baseAsset, deposit_amount: 0 };

    const result = await endpoint({});

    expect(result.quote.bookingDepositDueNow).toBe(0);
    expect(result.payment.paymentRequired).toBe(false);
    expect(result.warnings).toContain(
      "ZERO_BOOKING_DEPOSIT_CONFIRMATION_NOT_ENABLED",
    );
  });

  it("supports linked user customers", async () => {
    mockState.body = {
      ...mockState.body,
      userId: "user-1",
      walkInPhone: null,
      bookerName: null,
      bookerPhone: null,
    };

    const result = await endpoint({});

    expect(result.booking.customer).toMatchObject({
      kind: "account",
      userId: "user-1",
      bookerName: "Account Customer",
      bookerPhone: "0899999999",
    });
    expect(mockState.insertedBookings[0]).toMatchObject({
      user_id: "user-1",
      walk_in_phone: null,
    });
  });

  it("supports walk-in phone customers", async () => {
    await endpoint({});

    expect(mockState.upsertedWalkIns[0]).toMatchObject({
      phone: "0812345678",
      full_name: "Walk In",
      created_by_user_id: "staff-1",
    });
    expect(mockState.insertedBookings[0]).toMatchObject({
      user_id: null,
      walk_in_phone: "0812345678",
    });
  });

  it("rejects missing customer identity", async () => {
    mockState.body = {
      ...mockState.body,
      walkInPhone: null,
      bookerPhone: null,
    };

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 422 });
    expect(mockState.insertedBookings).toHaveLength(0);
  });

  it("rejects missing branch", async () => {
    mockState.body = { ...mockState.body, branchId: "" };

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects staff without POS branch access", async () => {
    mockState.branchAccess = false;

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects inactive or missing assets", async () => {
    mockState.assetRow = null;

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects non-rentable assets", async () => {
    mockState.assetRow = { ...baseAsset, daily_enabled: false };

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects same-day startDate with SAME_DAY_RENTAL_USE_INSTANT_RENTAL_FLOW", async () => {
    // Use the same Bangkok-local helper the endpoint uses so the test is
    // immune to UTC/local timezone mismatches (e.g. midnight–07:00 ICT).
    const today = toBangkokLocalDate(new Date());
    const tomorrow = addDaysToLocalDate(today, 1);
    mockState.body = { ...mockState.body, startDate: today, endDate: tomorrow };

    await expect(endpoint({})).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "SAME_DAY_RENTAL_USE_INSTANT_RENTAL_FLOW",
    });
    expect(mockState.insertedBookings).toHaveLength(0);
  });

  it("rejects past startDate", async () => {
    mockState.body = {
      ...mockState.body,
      startDate: "2020-01-01",
      endDate: "2020-01-03",
    };

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 422 });
    expect(mockState.insertedBookings).toHaveLength(0);
  });

  it("rejects invalid date ranges", async () => {
    mockState.body = {
      ...mockState.body,
      startDate: "2026-05-23",
      endDate: "2026-05-21",
    };

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects duration rule violations", async () => {
    mockState.assetRow = { ...baseAsset, min_rental_days: 5 };

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects availability conflicts without creating a draft", async () => {
    mockState.availabilityConflict = true;

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 409 });
    expect(mockState.insertedBookings).toHaveLength(0);
  });
});
