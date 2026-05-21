import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  routerParams: {} as Record<string, string>,
  platformRole: "staff",
  adminUserId: "staff-1",
  booking: null as Record<string, unknown> | null,
  paymentLines: [] as Array<Record<string, unknown>>,
  customer: null as Record<string, unknown> | null,
  walkIn: null as Record<string, unknown> | null,
  branchAccess: true,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  getRouterParam: (_event: unknown, name: string) =>
    mockState.routerParams[name],
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

function tableResult(table: string) {
  if (table === "rental_bookings") {
    return { data: mockState.booking, error: null };
  }
  if (table === "rental_booking_payment_lines") {
    return { data: mockState.paymentLines, error: null };
  }
  if (table === "users") {
    return { data: mockState.customer, error: null };
  }
  if (table === "walk_in_customers") {
    return { data: mockState.walkIn, error: null };
  }
  if (table === "admin_user_branch_access") {
    return {
      data: mockState.branchAccess ? { user_id: mockState.adminUserId } : null,
      error: null,
    };
  }
  throw new Error(`Unexpected table ${table}`);
}

function query(table: string) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    maybeSingle: async () => tableResult(table),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(tableResult(table)).then(resolve),
  };
  return chain;
}

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({
    adminClient: { from: (table: string) => query(table) },
    userId: mockState.adminUserId,
    platformRole: mockState.platformRole,
  }),
}));

const { buildRentalPickupReadiness } =
  await import("../../server/utils/rental-pickup-readiness");
const endpoint = (
  await import("../../server/api/admin/pos-v2/rental-bookings/[id]/pickup-readiness.get")
).default;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function booking(extra: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    user_id: "user-1",
    walk_in_phone: null,
    status: "confirmed",
    asset_id: "asset-1",
    asset_code: "CAM-1",
    asset_name: "Camera",
    product_name: "Camera",
    start_date: today(),
    end_date: today(),
    rental_days: 1,
    currency_code: "THB",
    rental_total: 1000,
    deposit_amount: 5000,
    deposit_paid_amount: 0,
    deposit_payment_status: "unpaid",
    booking_deposit_payment_status: "unpaid",
    booking_deposit_paid_amount: 0,
    checkout_paid_amount: 0,
    booker_name: "Booker",
    booker_phone: "0812345678",
    pos_branch_id: "branch-hq",
    pos_branch_code: "HQ",
    pos_branch_name: "HQ Branch",
    pos_staff_user_id: "staff-1",
    created_at: "2026-05-16T00:00:00.000Z",
    asset: {
      storage_branch_id: "branch-hq",
      store_branches: { id: "branch-hq", code: "HQ", name_th: "HQ Branch" },
    },
    ...extra,
  };
}

function line(lineType: string, grossAmount: number) {
  const isDeposit = ["booking_deposit", "refundable_security_deposit"].includes(
    lineType,
  );
  return {
    line_type: lineType,
    tax_category:
      lineType === "rental_fee"
        ? "rental_income"
        : lineType === "booking_deposit"
          ? "partial_refundable_security_deposit"
          : "refundable_security_deposit",
    description_th: lineType,
    description_en: lineType,
    gross_amount: grossAmount,
    wht_applicable: false,
    wht_rate: 0,
    wht_amount: 0,
    net_payable_amount: grossAmount,
    is_refundable: isDeposit,
    wht_certificate_required: false,
    applies_to_security_deposit: isDeposit,
    reduces_remaining_security_deposit: lineType === "booking_deposit",
    status: "active",
    source: "pos_booking_create",
    metadata:
      lineType === "booking_deposit" ? { securityDepositRequired: 5000 } : {},
  };
}

function paymentLines() {
  return [
    line("rental_fee", 1000),
    line("booking_deposit", 200),
    line("refundable_security_deposit", 4800),
  ];
}

describe("rental pickup readiness utility", () => {
  it("returns a ready confirmed booking with reused money summary", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: paymentLines(),
      customerProfile: {
        id: "user-1",
        full_name: "Verified Customer",
        phone: "0812345678",
        kyc_status: "verified",
      },
    });

    expect(readiness.readiness.classification).toBe("ready");
    // Rental fee unpaid does NOT block pickup; totalPickupDueAmount = deposit only.
    expect(readiness.moneySummary.pickupDue).toMatchObject({
      rentalFeeDueAmount: 1000,
      remainingSecurityDepositDueAmount: 5000,
      totalPickupDueAmount: 5000,
    });
  });

  it("blocks statuses that are not pending pickup", () => {
    for (const status of ["cancelled", "no_show", "picked_up", "returned"]) {
      const readiness = buildRentalPickupReadiness({
        booking: booking({ status }),
        paymentLines: paymentLines(),
        customerProfile: { kyc_status: "verified" },
      });

      expect(readiness.readiness.classification).toBe("blocked");
      expect(readiness.readiness.blockers.map((b) => b.code)).toContain(
        "booking_status_not_pickup_eligible",
      );
    }
  });

  it("uses existing KYC and walk-in ID evidence signals as blockers", () => {
    const account = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: paymentLines(),
      customerProfile: { kyc_status: "pending" },
    });
    const walkIn = buildRentalPickupReadiness({
      booking: booking({ user_id: null, walk_in_phone: "0812345678" }),
      paymentLines: paymentLines(),
      walkInCustomer: { phone: "0812345678" },
    });

    expect(account.readiness.blockers.map((b) => b.code)).toContain(
      "customer_kyc_not_verified",
    );
    expect(walkIn.readiness.blockers.map((b) => b.code)).toContain(
      "walk_in_id_evidence_missing",
    );
  });

  it("surfaces money summary warnings without duplicating money calculations", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: [],
      customerProfile: { kyc_status: "verified" },
    });

    expect(readiness.readiness.classification).toBe("warning");
    expect(readiness.moneyWarnings.map((warning) => warning.code)).toContain(
      "missing_payment_lines",
    );
    expect(
      readiness.readiness.warnings.map((warning) => warning.code),
    ).toContain("money_summary_warning");
  });
});

describe("admin POS V2 pickup readiness endpoint", () => {
  beforeEach(() => {
    mockState.routerParams = { id: "booking-1" };
    mockState.platformRole = "staff";
    mockState.booking = booking();
    mockState.paymentLines = paymentLines();
    mockState.customer = {
      id: "user-1",
      full_name: "Verified Customer",
      phone: "0812345678",
      kyc_status: "verified",
    };
    mockState.walkIn = null;
    mockState.branchAccess = true;
  });

  it("returns a structured read-only readiness payload", async () => {
    const result = await endpoint({});

    expect(result.readiness.booking.id).toBe("booking-1");
    expect(result.readiness.readiness.classification).toBe("ready");
    // totalPickupDueAmount = remaining security deposit only (rental fee deferred).
    expect(result.readiness.moneySummary.pickupDue.totalPickupDueAmount).toBe(
      5000,
    );
  });

  it("returns 404 when the booking is not found", async () => {
    mockState.booking = null;

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 404 });
  });

  it("enforces POS branch access for staff", async () => {
    mockState.branchAccess = false;

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 403 });
  });

  it("allows super_admin without branch access row", async () => {
    mockState.platformRole = "super_admin";
    mockState.branchAccess = false;

    const result = await endpoint({});

    expect(result.readiness.booking.id).toBe("booking-1");
  });
});
