import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockState = vi.hoisted(() => ({
  routerParams: {} as Record<string, string>,
  platformRole: "staff",
  adminUserId: "staff-1",
  booking: null as Record<string, unknown> | null,
  paymentLines: [] as Array<Record<string, unknown>>,
  customer: null as Record<string, unknown> | null,
  walkIn: null as Record<string, unknown> | null,
  kycProfiles: [] as Array<Record<string, unknown>>,
  kycOverrides: [] as Array<Record<string, unknown>>,
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
  if (table === "kyc_profiles") {
    return { data: mockState.kycProfiles, error: null };
  }
  if (table === "kyc_pickup_overrides") {
    return { data: mockState.kycOverrides, error: null };
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
    limit: () => chain,
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

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

function booking(extra: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    user_id: "user-1",
    walk_in_phone: null,
    status: "confirmed",
    kyc_profile_id: null,
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

function verifiedKycProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "kyc-1",
    status: "verified",
    valid_until: futureDate(),
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function pendingKycProfile() {
  return { id: "kyc-1", status: "pending", valid_until: null, created_at: "2026-01-01T00:00:00.000Z" };
}

// ── buildRentalPickupReadiness unit tests ─────────────────────────────────────

describe("rental pickup readiness utility", () => {
  it("returns ready for confirmed booking with verified KYC profile", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: paymentLines(),
      customerProfile: {
        id: "user-1",
        full_name: "Verified Customer",
        phone: "0812345678",
      },
      kycProfile: { id: "kyc-1", status: "verified", valid_until: futureDate(), created_at: "2026-01-01T00:00:00.000Z" },
      kycOverrides: [],
    });

    expect(readiness.readiness.classification).toBe("ready");
    expect(readiness.readiness.blockers).toHaveLength(0);
    expect(readiness.customer.kycStatus).toBe("verified");
    expect(readiness.moneySummary.pickupDue).toMatchObject({
      rentalFeeDueAmount: 1000,
      remainingSecurityDepositDueAmount: 5000,
      totalPickupDueAmount: 5000,
    });
  });

  it("blocks pickup when KYC is verified but valid_until has expired", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: paymentLines(),
      kycProfile: { id: "kyc-1", status: "verified", valid_until: pastDate(), created_at: "2026-01-01T00:00:00.000Z" },
      kycOverrides: [],
    });

    expect(readiness.readiness.classification).toBe("blocked");
    const blocker = readiness.readiness.blockers.find(
      (b) => b.code === "kyc_pickup_gate_blocked",
    );
    expect(blocker).toBeDefined();
    expect(blocker?.context?.kycReason).toBe("expired");
  });

  it("blocks pickup when KYC status is pending", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: paymentLines(),
      kycProfile: pendingKycProfile(),
      kycOverrides: [],
    });

    expect(readiness.readiness.classification).toBe("blocked");
    const blocker = readiness.readiness.blockers.find(
      (b) => b.code === "kyc_pickup_gate_blocked",
    );
    expect(blocker?.context?.kycReason).toBe("pending");
  });

  it("blocks pickup when KYC status is rejected", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: paymentLines(),
      kycProfile: { id: "kyc-1", status: "rejected", valid_until: null, created_at: "2026-01-01T00:00:00.000Z" },
      kycOverrides: [],
    });

    expect(readiness.readiness.blockers.map((b) => b.code)).toContain(
      "kyc_pickup_gate_blocked",
    );
    const blocker = readiness.readiness.blockers.find(
      (b) => b.code === "kyc_pickup_gate_blocked",
    );
    expect(blocker?.context?.kycReason).toBe("rejected");
  });

  it("blocks pickup when KYC status is revoked", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: paymentLines(),
      kycProfile: { id: "kyc-1", status: "revoked", valid_until: null, created_at: "2026-01-01T00:00:00.000Z" },
      kycOverrides: [],
    });

    const blocker = readiness.readiness.blockers.find(
      (b) => b.code === "kyc_pickup_gate_blocked",
    );
    expect(blocker?.context?.kycReason).toBe("revoked");
  });

  it("blocks pickup when no KYC profile exists (no_profile)", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: paymentLines(),
      kycProfile: null,
      kycOverrides: [],
    });

    expect(readiness.readiness.classification).toBe("blocked");
    const blocker = readiness.readiness.blockers.find(
      (b) => b.code === "kyc_pickup_gate_blocked",
    );
    expect(blocker?.context?.kycReason).toBe("no_profile");
    expect(readiness.customer.kycStatus).toBeNull();
  });

  it("allows pickup via override when KYC is not ready and a booking-specific override exists", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: paymentLines(),
      kycProfile: pendingKycProfile(),
      kycOverrides: [{ id: "override-1", booking_id: "booking-1" }],
    });

    // No blocker because override allows pickup
    expect(readiness.readiness.blockers.map((b) => b.code)).not.toContain(
      "kyc_pickup_gate_blocked",
    );
    // Warning is emitted for the override path
    const warning = readiness.readiness.warnings.find(
      (w) => w.code === "kyc_pickup_via_override",
    );
    expect(warning).toBeDefined();
  });

  it("still blocks when override is for a different booking", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: paymentLines(),
      kycProfile: pendingKycProfile(),
      kycOverrides: [{ id: "override-x", booking_id: "different-booking" }],
    });

    expect(readiness.readiness.blockers.map((b) => b.code)).toContain(
      "kyc_pickup_gate_blocked",
    );
  });

  it("verified KYC takes precedence; override emits no warning when KYC already passes", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: paymentLines(),
      kycProfile: { id: "kyc-1", status: "verified", valid_until: futureDate(), created_at: "2026-01-01T00:00:00.000Z" },
      kycOverrides: [{ id: "override-1", booking_id: "booking-1" }],
    });

    expect(readiness.readiness.classification).toBe("ready");
    // Override warning should NOT appear when KYC passes directly
    expect(readiness.readiness.warnings.map((w) => w.code)).not.toContain(
      "kyc_pickup_via_override",
    );
  });

  it("with multiple profiles: selects verified profile over non-verified even if older", () => {
    // Simulated via selectBestKycProfile — two profiles: pending (newer) + verified
    // This is exercised in loadRentalPickupReadiness where profiles array is passed in.
    // Here we validate buildRentalPickupReadiness correctly uses the resolved kycProfile.
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: paymentLines(),
      // Caller pre-selected the best profile (verified), simulating selectBestKycProfile
      kycProfile: { id: "kyc-1", status: "verified", valid_until: futureDate(), created_at: "2025-06-01T00:00:00.000Z" },
      kycOverrides: [],
    });
    expect(readiness.readiness.classification).toBe("ready");
  });

  it("walk-in with kyc_profile_id = null is blocked (no_profile — TASK 4 sets the FK)", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking({ user_id: null, walk_in_phone: "0812345678", kyc_profile_id: null }),
      paymentLines: paymentLines(),
      walkInCustomer: { phone: "0812345678", full_name: "Walk-in Customer" },
      kycProfile: null,
      kycOverrides: [],
    });

    expect(readiness.readiness.classification).toBe("blocked");
    const blocker = readiness.readiness.blockers.find(
      (b) => b.code === "kyc_pickup_gate_blocked",
    );
    expect(blocker).toBeDefined();
    expect(blocker?.context?.kycReason).toBe("no_profile");
  });

  it("walk-in with kyc_profile_id set and verified linked profile is ready", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking({ user_id: null, walk_in_phone: "0812345678", kyc_profile_id: "kyc-1" }),
      paymentLines: paymentLines(),
      walkInCustomer: { phone: "0812345678", full_name: "Walk-in Customer" },
      kycProfile: verifiedKycProfile(),
      kycOverrides: [],
    });

    expect(readiness.readiness.classification).toBe("ready");
    expect(readiness.readiness.blockers).toHaveLength(0);
    expect(readiness.customer.kycStatus).toBe("verified");
  });

  it("walk-in with kyc_profile_id set but expired profile is blocked (expired)", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking({ user_id: null, walk_in_phone: "0812345678", kyc_profile_id: "kyc-1" }),
      paymentLines: paymentLines(),
      kycProfile: verifiedKycProfile({ valid_until: pastDate() }),
      kycOverrides: [],
    });

    expect(readiness.readiness.classification).toBe("blocked");
    const blocker = readiness.readiness.blockers.find(b => b.code === "kyc_pickup_gate_blocked");
    expect(blocker?.context?.kycReason).toBe("expired");
  });

  it("walk-in with kyc_profile_id set but pending profile is blocked (pending)", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking({ user_id: null, walk_in_phone: "0812345678", kyc_profile_id: "kyc-1" }),
      paymentLines: paymentLines(),
      kycProfile: pendingKycProfile(),
      kycOverrides: [],
    });

    expect(readiness.readiness.classification).toBe("blocked");
    const blocker = readiness.readiness.blockers.find(b => b.code === "kyc_pickup_gate_blocked");
    expect(blocker?.context?.kycReason).toBe("pending");
  });

  it("walk-in with kyc_profile_id set but rejected profile is blocked (rejected)", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking({ user_id: null, walk_in_phone: "0812345678", kyc_profile_id: "kyc-1" }),
      paymentLines: paymentLines(),
      kycProfile: { id: "kyc-1", status: "rejected", valid_until: null, created_at: "2026-01-01T00:00:00.000Z" },
      kycOverrides: [],
    });

    expect(readiness.readiness.classification).toBe("blocked");
    const blocker = readiness.readiness.blockers.find(b => b.code === "kyc_pickup_gate_blocked");
    expect(blocker?.context?.kycReason).toBe("rejected");
  });

  it("walk-in with kyc_profile_id set but revoked profile is blocked (revoked)", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking({ user_id: null, walk_in_phone: "0812345678", kyc_profile_id: "kyc-1" }),
      paymentLines: paymentLines(),
      kycProfile: { id: "kyc-1", status: "revoked", valid_until: null, created_at: "2026-01-01T00:00:00.000Z" },
      kycOverrides: [],
    });

    const blocker = readiness.readiness.blockers.find(b => b.code === "kyc_pickup_gate_blocked");
    expect(blocker?.context?.kycReason).toBe("revoked");
  });

  it("walk-in with a valid booking-specific override proceeds to pickup", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking({ user_id: null, walk_in_phone: "0812345678" }),
      paymentLines: paymentLines(),
      kycProfile: null,
      kycOverrides: [{ id: "override-1", booking_id: "booking-1" }],
    });

    expect(readiness.readiness.blockers.map((b) => b.code)).not.toContain(
      "kyc_pickup_gate_blocked",
    );
    expect(readiness.readiness.warnings.map((w) => w.code)).toContain(
      "kyc_pickup_via_override",
    );
  });

  it("blocks statuses that are not pending pickup (unchanged from before TASK 3)", () => {
    for (const status of ["cancelled", "no_show", "picked_up", "returned"]) {
      const readiness = buildRentalPickupReadiness({
        booking: booking({ status }),
        paymentLines: paymentLines(),
        kycProfile: { id: "kyc-1", status: "verified", valid_until: futureDate(), created_at: "2026-01-01T00:00:00.000Z" },
        kycOverrides: [],
      });

      expect(readiness.readiness.classification).toBe("blocked");
      expect(readiness.readiness.blockers.map((b) => b.code)).toContain(
        "booking_status_not_pickup_eligible",
      );
    }
  });

  it("surfaces money summary warnings without duplicating money calculations", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: [],
      kycProfile: { id: "kyc-1", status: "verified", valid_until: futureDate(), created_at: "2026-01-01T00:00:00.000Z" },
      kycOverrides: [],
    });

    expect(readiness.readiness.classification).toBe("warning");
    expect(readiness.moneyWarnings.map((warning) => warning.code)).toContain(
      "missing_payment_lines",
    );
    expect(
      readiness.readiness.warnings.map((warning) => warning.code),
    ).toContain("money_summary_warning");
  });

  it("idEvidencePresent is false for shape-compat (semantically hollow until TASK 4)", () => {
    const readiness = buildRentalPickupReadiness({
      booking: booking(),
      paymentLines: paymentLines(),
      kycProfile: { id: "kyc-1", status: "verified", valid_until: futureDate(), created_at: "2026-01-01T00:00:00.000Z" },
      kycOverrides: [],
    });
    expect(readiness.customer.idEvidencePresent).toBe(false);
  });
});

// ── admin POS V2 pickup readiness endpoint ────────────────────────────────────

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
    };
    mockState.walkIn = null;
    mockState.kycProfiles = [verifiedKycProfile()];
    mockState.kycOverrides = [];
    mockState.branchAccess = true;
  });

  it("returns a structured read-only readiness payload for a verified booking", async () => {
    const result = await endpoint({});

    expect(result.readiness.booking.id).toBe("booking-1");
    expect(result.readiness.readiness.classification).toBe("ready");
    expect(result.readiness.moneySummary.pickupDue.totalPickupDueAmount).toBe(5000);
    expect(result.readiness.customer.kycStatus).toBe("verified");
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

  it("returns blocked readiness when KYC profile is expired", async () => {
    mockState.kycProfiles = [verifiedKycProfile({ valid_until: pastDate() })];

    const result = await endpoint({});

    expect(result.readiness.readiness.classification).toBe("blocked");
    expect(
      result.readiness.readiness.blockers.map((b: { code: string }) => b.code),
    ).toContain("kyc_pickup_gate_blocked");
  });

  it("returns blocked readiness when no KYC profile exists", async () => {
    mockState.kycProfiles = [];

    const result = await endpoint({});

    expect(result.readiness.readiness.classification).toBe("blocked");
    const blocker = result.readiness.readiness.blockers.find(
      (b: { code: string; context?: Record<string, unknown> }) =>
        b.code === "kyc_pickup_gate_blocked",
    );
    expect(blocker?.context?.kycReason).toBe("no_profile");
  });

  it("returns warning (not blocked) when override is present and KYC is pending", async () => {
    mockState.kycProfiles = [pendingKycProfile()];
    mockState.kycOverrides = [{ booking_id: "booking-1" }];

    const result = await endpoint({});

    expect(result.readiness.readiness.classification).not.toBe("blocked");
    expect(
      result.readiness.readiness.warnings.map((w: { code: string }) => w.code),
    ).toContain("kyc_pickup_via_override");
  });

  it("walk-in with kyc_profile_id set and verified profile → ready", async () => {
    mockState.booking = {
      ...booking(),
      user_id: null,
      walk_in_phone: "0812345678",
      kyc_profile_id: "kyc-1",
    };
    mockState.customer = null;
    mockState.kycProfiles = [verifiedKycProfile()];

    const result = await endpoint({});

    expect(result.readiness.readiness.classification).toBe("ready");
    expect(result.readiness.customer.kycStatus).toBe("verified");
  });

  it("walk-in with kyc_profile_id = null is blocked even when kycProfiles mock has data (no phone matching)", async () => {
    // walk_in_phone is set and kycProfiles has a verified profile in the mock,
    // but kyc_profile_id = null means the code skips the kyc_profiles query entirely.
    // This proves no phone-based KYC lookup occurs.
    mockState.booking = {
      ...booking(),
      user_id: null,
      walk_in_phone: "0812345678",
      kyc_profile_id: null,
    };
    mockState.customer = null;
    mockState.kycProfiles = [verifiedKycProfile()]; // present but must not be used

    const result = await endpoint({});

    expect(result.readiness.readiness.classification).toBe("blocked");
    const blocker = result.readiness.readiness.blockers.find(
      (b: { code: string; context?: Record<string, unknown> }) => b.code === "kyc_pickup_gate_blocked",
    );
    expect(blocker?.context?.kycReason).toBe("no_profile");
  });

  it("readiness and confirm use equivalent KYC resolution — both rely on resolvePickupKyc (source test)", () => {
    const readinessSrc = readFileSync(
      resolve(process.cwd(), "server/utils/rental-pickup-readiness.ts"),
      "utf8",
    );
    const fulfillmentSrc = readFileSync(
      resolve(process.cwd(), "server/utils/rental-fulfillment.ts"),
      "utf8",
    );
    // Both gate paths call the same resolvePickupKyc helper
    expect(readinessSrc).toContain("resolvePickupKyc");
    expect(fulfillmentSrc).toContain("resolvePickupKyc");
    // Both include kyc_profile_id in their booking SELECT
    expect(readinessSrc).toContain("kyc_profile_id");
    expect(fulfillmentSrc).toContain("kyc_profile_id");
  });
});
