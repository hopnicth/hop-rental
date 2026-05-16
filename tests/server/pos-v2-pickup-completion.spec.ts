import { beforeEach, describe, expect, it, vi } from "vitest";

const customerId = "11111111-1111-1111-1111-111111111111";

const mockState = vi.hoisted(() => ({
  routerParams: { id: "booking-1" } as Record<string, string>,
  body: {} as Record<string, unknown>,
  platformRole: "staff",
  booking: {} as Record<string, unknown>,
  paymentLines: [] as Array<Record<string, unknown>>,
  customer: {} as Record<string, unknown>,
  walkIn: null as Record<string, unknown> | null,
  checklist: { id: "chk-1", status: "completed" } as Record<
    string,
    unknown
  > | null,
  checklistItems: [] as Array<Record<string, unknown>>,
  fulfillments: [] as Array<Record<string, unknown>>,
  branchAccess: true,
  bookingUpdates: [] as Array<Record<string, unknown>>,
  paymentLineMutations: 0,
  touchedTables: [] as string[],
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  getRouterParam: (_event: unknown, name: string) =>
    mockState.routerParams[name],
  readBody: async () => mockState.body,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

function today() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrow() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function pngSignature() {
  return "data:image/png;base64,iVBORw0KGgo=";
}

function booking(extra: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    user_id: customerId,
    walk_in_phone: null,
    status: "confirmed",
    asset_id: "asset-1",
    asset_code: "CAM-1",
    asset_name: "Camera",
    asset_thumbnail: "thumb.jpg",
    asset_snapshot: {},
    product_id: null,
    sku_id: null,
    product_name: "Camera",
    matched_product_id: null,
    matched_product_name: null,
    thumbnail: "thumb.jpg",
    hub_id: "branch-hq",
    hub_name: "HQ Branch",
    start_date: today(),
    end_date: today(),
    rental_days: 1,
    pricing_model: "daily",
    currency_code: "THB",
    daily_rate: 1000,
    weekly_rate: 0,
    monthly_rate: 0,
    rental_total: 1000,
    deposit_amount: 5000,
    deposit_paid_amount: 0,
    deposit_payment_method: null,
    deposit_payment_status: "unpaid",
    deposit_refund_status: "not_applicable",
    deposit_refund_amount: 0,
    deposit_refund_notes: null,
    checkout_total_amount: 6000,
    checkout_paid_amount: 0,
    checkout_payment_method: null,
    booking_deposit_payment_status: "unpaid",
    booking_deposit_paid_amount: 0,
    booker_name: "Booker",
    booker_phone: "0812345678",
    pos_branch_id: "branch-hq",
    pos_branch_code: "HQ",
    pos_branch_name: "HQ Branch",
    pos_staff_user_id: "staff-1",
    created_at: "2026-05-16T00:00:00.000Z",
    updated_at: "2026-05-16T00:00:00.000Z",
    asset: {
      storage_branch_id: "branch-hq",
      store_branches: { id: "branch-hq", code: "HQ", name_th: "HQ Branch" },
    },
    ...extra,
  };
}

function line(lineType: string, grossAmount: number, extra = {}) {
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
    ...extra,
  };
}

function paymentLines(extra: Array<Record<string, unknown>> = []) {
  return [
    line("rental_fee", 1000),
    line("booking_deposit", 200),
    line("refundable_security_deposit", 4800),
    ...extra,
  ];
}

function tableResult(table: string, filters: Record<string, unknown>) {
  if (table === "rental_bookings")
    return { data: mockState.booking, error: null };
  if (table === "rental_booking_payment_lines") {
    return { data: mockState.paymentLines, error: null };
  }
  if (table === "users") {
    return filters.id
      ? { data: mockState.customer, error: null }
      : { data: [mockState.customer], error: null };
  }
  if (table === "walk_in_customers")
    return { data: mockState.walkIn, error: null };
  if (table === "admin_user_branch_access") {
    return {
      data: mockState.branchAccess ? { user_id: "staff-1" } : null,
      error: null,
    };
  }
  if (table === "rental_booking_checklists") {
    return { data: mockState.checklist, error: null };
  }
  if (table === "rental_booking_checklist_items") {
    return { data: mockState.checklistItems, error: null };
  }
  if (table === "rental_booking_fulfillments") {
    return { data: mockState.fulfillments[0] ?? null, error: null };
  }
  throw new Error(`Unexpected table ${table}`);
}

function query(table: string) {
  mockState.touchedTables.push(table);
  let updatePayload: Record<string, unknown> | null = null;
  const filters: Record<string, unknown> = {};
  const chain: any = {
    select: () => chain,
    eq: (field: string, value: unknown) => {
      filters[field] = value;
      return chain;
    },
    in: (field: string, value: unknown) => {
      filters[field] = value;
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    gt: () => chain,
    maybeSingle: async () => {
      if (table === "rental_bookings" && updatePayload) {
        if (filters.status && mockState.booking.status !== filters.status) {
          return { data: null, error: null };
        }
        mockState.booking = { ...mockState.booking, ...updatePayload };
        mockState.bookingUpdates.push(updatePayload);
        return { data: mockState.booking, error: null };
      }
      return tableResult(table, filters);
    },
    single: async () => tableResult(table, filters),
    update: (payload: Record<string, unknown>) => {
      if (table === "rental_booking_payment_lines")
        mockState.paymentLineMutations++;
      updatePayload = payload;
      return chain;
    },
    insert: async (payload: Record<string, unknown>) => {
      if (table === "rental_booking_payment_lines")
        mockState.paymentLineMutations++;
      if (table === "rental_booking_fulfillments") {
        mockState.fulfillments.push(payload);
      }
      return { data: payload, error: null };
    },
    delete: () => {
      if (table === "rental_booking_payment_lines")
        mockState.paymentLineMutations++;
      return chain;
    },
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(
        table === "users"
          ? { data: [mockState.customer], error: null }
          : tableResult(table, filters),
      ).then(resolve),
  };
  return chain;
}

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({
    adminClient: {
      from: (table: string) => query(table),
      storage: {
        from: () => ({
          upload: async () => ({ error: null }),
          getPublicUrl: () => ({
            data: { publicUrl: "https://cdn.test/sign.png" },
          }),
        }),
      },
    },
    userId: "staff-1",
    platformRole: mockState.platformRole,
  }),
}));

const endpoint = (
  await import("../../server/api/admin/pos-v2/rental-bookings/[id]/pickup-complete.post")
).default;

describe("admin POS V2 pickup completion backend", () => {
  beforeEach(() => {
    mockState.routerParams = { id: "booking-1" };
    mockState.body = {
      paymentMethod: "cash",
      collectedAmount: 6000,
      signatureDataUrl: pngSignature(),
    };
    mockState.platformRole = "staff";
    mockState.booking = booking();
    mockState.paymentLines = paymentLines();
    mockState.customer = {
      id: customerId,
      full_name: "Verified Customer",
      phone: "0812345678",
      kyc_status: "verified",
      id_card_url: "id.jpg",
    };
    mockState.walkIn = null;
    mockState.checklist = { id: "chk-1", status: "completed" };
    mockState.checklistItems = [
      { id: "ci-1", is_required: true, checked: true, result_status: "passed" },
    ];
    mockState.fulfillments = [];
    mockState.branchAccess = true;
    mockState.bookingUpdates = [];
    mockState.paymentLineMutations = 0;
    mockState.touchedTables = [];
  });

  it("completes pickup for POS-created unpaid booking and preserves booking deposit unpaid semantics", async () => {
    const result = await endpoint({});

    expect(result.completion).toMatchObject({
      bookingId: "booking-1",
      status: "picked_up",
      pickupCompleted: true,
    });
    expect(mockState.booking).toMatchObject({
      status: "picked_up",
      deposit_paid_amount: 5000,
      deposit_payment_status: "paid",
      deposit_payment_method: "cash",
      deposit_refund_status: "not_refunded",
      checkout_paid_amount: 6000,
      checkout_payment_method: "cash",
      booking_deposit_paid_amount: 0,
      booking_deposit_payment_status: "unpaid",
    });
    expect(mockState.fulfillments).toHaveLength(1);
    expect(mockState.paymentLineMutations).toBe(0);
    expect(mockState.touchedTables).not.toContain("official_documents");
    expect(mockState.touchedTables).not.toContain("payment_allocations");
  });

  it("completes pickup for online booking with real paid Booking Deposit credit", async () => {
    mockState.booking = booking({
      booking_deposit_payment_status: "paid",
      booking_deposit_paid_amount: 200,
      booking_deposit_paid_at: "2026-05-15T00:00:00.000Z",
      deposit_paid_amount: 200,
      deposit_payment_status: "paid",
      checkout_total_amount: 5800,
    });
    mockState.body = {
      paymentMethod: "qr_transfer",
      collectedAmount: 5800,
      signatureDataUrl: pngSignature(),
    };

    const result = await endpoint({});

    expect(result.payment).toMatchObject({
      paymentMethod: "qr_transfer",
      collectedAmount: 5800,
      rentalFeeDueAmount: 1000,
      remainingSecurityDepositDueAmount: 4800,
      refundableSecurityDepositHeldAmount: 5000,
      bookingDepositPaidAmount: 200,
      bookingDepositPaymentStatus: "paid",
    });
    expect(mockState.booking).toMatchObject({
      status: "picked_up",
      deposit_paid_amount: 5000,
      checkout_paid_amount: 5800,
      booking_deposit_paid_amount: 200,
      booking_deposit_payment_status: "paid",
    });
  });

  it("rejects when readiness is blocked", async () => {
    mockState.customer = { ...mockState.customer, kyc_status: "pending" };

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 422 });
    expect(mockState.bookingUpdates).toHaveLength(0);
  });

  it("rejects future pickup date completion", async () => {
    mockState.booking = booking({ start_date: tomorrow() });

    await expect(endpoint({})).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: expect.stringContaining("Future pickup date"),
    });
    expect(mockState.bookingUpdates).toHaveLength(0);
  });

  it("rejects amount mismatch", async () => {
    mockState.body = { ...mockState.body, collectedAmount: 5999 };

    await expect(endpoint({})).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: expect.stringContaining("Collected amount"),
    });
    expect(mockState.bookingUpdates).toHaveLength(0);
  });

  it("rejects invalid payment method", async () => {
    mockState.body = { ...mockState.body, paymentMethod: "coupon" };

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 422 });
    expect(mockState.bookingUpdates).toHaveLength(0);
  });

  it("rejects material money warning cases", async () => {
    mockState.paymentLines = paymentLines([line("rental_fee", 100)]);

    await expect(endpoint({})).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: expect.stringContaining("money summary warnings"),
    });
    expect(mockState.bookingUpdates).toHaveLength(0);
  });

  it("rejects missing or incomplete pickup checklist before payment mutation", async () => {
    mockState.checklist = null;

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 422 });
    expect(mockState.bookingUpdates).toHaveLength(0);
  });

  it("rejects invalid signature before payment mutation", async () => {
    mockState.body = { ...mockState.body, signatureDataUrl: "not-a-png" };

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 422 });
    expect(mockState.bookingUpdates).toHaveLength(0);
  });

  it("rejects already picked-up duplicate completion without re-recording payment", async () => {
    mockState.booking = booking({
      status: "picked_up",
      checkout_paid_amount: 6000,
    });
    mockState.fulfillments = [{ id: "fulfillment-1", event_type: "pickup" }];

    await expect(endpoint({})).rejects.toMatchObject({ statusCode: 422 });
    expect(mockState.bookingUpdates).toHaveLength(0);
  });
});
