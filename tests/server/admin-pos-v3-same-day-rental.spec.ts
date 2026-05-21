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
  touchedOfficialDocuments: false,
  touchedVatRecords: false,
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
  daily_rate: 200,
  weekly_rate: 0,
  monthly_rate: 0,
  daily_enabled: true,
  weekly_enabled: false,
  monthly_enabled: false,
  deposit_amount: 2500,
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
          return {};
        }
        if (table === "official_documents") {
          mockState.touchedOfficialDocuments = true;
          return {};
        }
        if (table === "vat_output_tax_records") {
          mockState.touchedVatRecords = true;
          return {};
        }
        throw new Error(`Unexpected table ${table}`);
      },
    },
    userId: "staff-1",
    platformRole: mockState.platformRole,
  }),
}));

const endpoint = (
  await import("../../server/api/admin/pos-v3/rental-bookings/same-day.post")
).default;

describe("admin POS V3 same-day rental API", () => {
  beforeEach(() => {
    const today = toBangkokLocalDate(new Date());
    mockState.body = {
      idempotencyKey: "same-day-key-1",
      walkInPhone: "0812345678",
      bookerName: "Walk In",
      assetId: "asset-1",
      branchId: "branch-hq",
      startDate: today,
      returnDate: addDaysToLocalDate(today, 1),
      numDays: 2,
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
    mockState.touchedOfficialDocuments = false;
    mockState.touchedVatRecords = false;
  });

  it("creates a confirmed same-day booking without Booking Deposit fields paid", async () => {
    const result: any = await endpoint({});

    expect(result.booking.status).toBe("confirmed");
    expect(mockState.insertedBookings[0]).toMatchObject({
      status: "confirmed",
      booking_deposit_payment_status: "unpaid",
      booking_deposit_paid_amount: 0,
      deposit_paid_amount: 0,
      deposit_payment_status: "unpaid",
      checkout_paid_amount: 0,
    });
  });

  it("stores only rental_fee and refundable_security_deposit lines", async () => {
    const result: any = await endpoint({});

    expect(result.quote.paymentLines.map((line: any) => line.lineType)).toEqual([
      "rental_fee",
      "refundable_security_deposit",
    ]);
    expect(
      mockState.insertedPaymentLines.map((line) => line.line_type),
    ).toEqual(["rental_fee", "refundable_security_deposit"]);
  });

  it("marks payment lines with same-day discriminator metadata", async () => {
    await endpoint({});

    expect(mockState.insertedPaymentLines[0]).toMatchObject({
      source: "pos_v3_same_day_quote",
    });
    expect(mockState.insertedPaymentLines[0].metadata).toMatchObject({
      bookingChannel: "admin_pos_v3",
      phase: "staff_created_same_day_confirmed",
      bookingDepositPolicy: "not_applicable_same_day",
    });
  });

  it("returns full refundable deposit due at pickup and zero booking deposit due now", async () => {
    const result: any = await endpoint({});

    expect(result.quote).toMatchObject({
      rentalTotalAmount: 400,
      requiredSecurityDepositAmount: 2500,
      bookingDepositDueNow: 0,
      remainingSecurityDepositDueAtPickup: 2500,
      estimatedPickupDueAmount: 2500,
      currencyCode: "THB",
    });
    expect(result.payment).toMatchObject({
      bookingDepositPaymentStatus: "unpaid",
      paymentRequired: false,
    });
  });

  it("has no VAT/WHT/tax invoice/official document side effects", async () => {
    await endpoint({});

    expect(mockState.touchedHeldBalanceEvents).toBe(false);
    expect(mockState.touchedOfficialDocuments).toBe(false);
    expect(mockState.touchedVatRecords).toBe(false);
  });
});