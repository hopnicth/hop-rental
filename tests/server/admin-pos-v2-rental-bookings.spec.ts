import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  platformRole: "staff",
  insertedBookings: [] as Record<string, unknown>[],
  insertedPaymentLines: [] as Record<string, unknown>[],
  upsertedWalkIns: [] as Record<string, unknown>[],
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: async () => mockState.body,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

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

const branchRow = {
  id: "branch-hq",
  code: "HQ",
  name_th: "HQ Branch",
  name_en: "HQ",
  is_active: true,
};

const assetRow = {
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
  matches: [],
};

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({
    adminClient: {
      from: (table: string) => {
        if (table === "admin_user_branch_access") {
          return queryResult({ data: { branch_id: "branch-hq" }, error: null });
        }
        if (table === "store_branches") {
          return queryResult({ data: branchRow, error: null });
        }
        if (table === "assets") {
          return queryResult({ data: assetRow, error: null });
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
            select: () => queryResult({ data: [], error: null }),
            insert: async (payload: Record<string, unknown>) => {
              mockState.insertedBookings.push(payload);
              return { error: null };
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    },
    userId: "staff-1",
    platformRole: mockState.platformRole,
  }),
}));

const endpoint = (
  await import("../../server/api/admin/pos-v2/rental-bookings.post")
).default;

describe("admin POS V2 future rental booking API", () => {
  beforeEach(() => {
    mockState.body = {
      walkInPhone: "0812345678",
      bookerName: "Walk In",
      assetId: "asset-1",
      branchId: "branch-hq",
      startDate: "2026-05-21",
      endDate: "2026-05-23",
    };
    mockState.platformRole = "staff";
    mockState.insertedBookings = [];
    mockState.insertedPaymentLines = [];
    mockState.upsertedWalkIns = [];
  });

  it("creates a confirmed future booking without collecting payment", async () => {
    const result = await endpoint({});

    expect(result.booking).toMatchObject({
      status: "confirmed",
      assetId: "asset-1",
      branchId: "branch-hq",
      rentalDays: 3,
      rentalTotal: 3000,
      checkoutPaidAmount: 0,
    });
    expect(mockState.insertedBookings[0]).toMatchObject({
      status: "confirmed",
      deposit_paid_amount: 0,
      booking_deposit_paid_amount: 0,
      booking_deposit_payment_status: "unpaid",
      checkout_total_amount: 8000,
      checkout_paid_amount: 0,
      pos_branch_id: "branch-hq",
      pos_staff_user_id: "staff-1",
    });
    expect(
      mockState.insertedPaymentLines.map((line) => line.line_type),
    ).toEqual(["rental_fee", "booking_deposit", "refundable_security_deposit"]);
    expect(result.moneySummary.bookingDeposit).toMatchObject({
      expectedAmount: 200,
      paidAmount: 0,
      isRevenue: false,
    });
    // totalPickupDueAmount = remaining security deposit only (rental fee deferred to return).
    expect(result.moneySummary.pickupDue).toMatchObject({
      rentalFeeDueAmount: 3000,
      remainingSecurityDepositDueAmount: 5000,
      totalPickupDueAmount: 5000,
    });
  });

  it("rejects payment collection fields in Phase 3", async () => {
    mockState.body = {
      ...mockState.body,
      depositPaidAmount: 200,
      depositPaymentMethod: "cash",
    };

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 422 });
    expect(mockState.insertedBookings).toHaveLength(0);
  });
});
