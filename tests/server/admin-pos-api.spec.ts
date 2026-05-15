import { describe, expect, it, vi, beforeEach } from "vitest";

type MockClient = {
  from?: (table: string) => unknown;
  rpc?: (
    name: string,
    params?: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>;
} | null;

type QueryChain<T = unknown> = {
  select: (...args: unknown[]) => QueryChain<T>;
  in: (...args: unknown[]) => QueryChain<T>;
  eq: (...args: unknown[]) => QueryChain<T>;
  order: (...args: unknown[]) => QueryChain<T>;
  limit: (...args: unknown[]) => QueryChain<T>;
  gte: (...args: unknown[]) => QueryChain<T>;
  lte: (...args: unknown[]) => QueryChain<T>;
  lt: (...args: unknown[]) => QueryChain<T>;
  gt: (...args: unknown[]) => QueryChain<T>;
  not: (...args: unknown[]) => QueryChain<T>;
  or: (...args: unknown[]) => QueryChain<T>;
  then: (resolve: (value: T) => unknown) => Promise<unknown>;
};

const mockState = vi.hoisted(() => ({
  superAdminClient: null as MockClient,
  platformAdminClient: null as MockClient,
  body: {} as Record<string, unknown>,
  query: {} as Record<string, unknown>,
  routerParams: {} as Record<string, string>,
  headers: [] as Array<{ name: string; value: string }>,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: async () => mockState.body,
  getQuery: () => mockState.query,
  getRouterParam: (_event: unknown, name: string) =>
    mockState.routerParams[name],
  setHeader: (_event: unknown, name: string, value: string) => {
    mockState.headers.push({ name, value });
  },
  createError: (opts: { statusMessage?: string; statusCode?: number }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("~~/server/utils/admin", () => ({
  requireSuperAdmin: async () => ({
    adminClient: mockState.superAdminClient,
    userId: "admin-1",
  }),
  requirePlatformAdmin: async () => ({
    adminClient: mockState.platformAdminClient,
    userId: "staff-1",
    platformRole: "staff",
  }),
  requirePlatformAdminReadAccess: async () => ({
    adminClient: mockState.platformAdminClient,
    userId: "staff-1",
    platformRole: "staff",
  }),
}));

const branchAccessGet = (
  await import("../../server/api/admin/pos/branch-access.get")
).default;
const branchAccessPatch = (
  await import("../../server/api/admin/pos/branch-access.patch")
).default;
const posSalePost = (await import("../../server/api/admin/pos/sales.post"))
  .default;
const posBookingPost = (
  await import("../../server/api/admin/pos/bookings.post")
).default;
const accountingExportGet = (
  await import("../../server/api/admin/pos/accounting-export.get")
).default;
const historyGet = (await import("../../server/api/admin/pos/history.get"))
  .default;
const historyCancelPost = (
  await import("../../server/api/admin/pos/history/cancel.post")
).default;
const depositPatch = (
  await import("../../server/api/admin/rental-bookings/[id]/deposit.patch")
).default;
const catalogGet = (await import("../../server/api/admin/pos/catalog.get"))
  .default;
const { posMediaGalleryPrimaryUrl } =
  await import("../../server/utils/admin-pos");

function queryResult<T>(result: T): QueryChain<T> {
  const chain: QueryChain<T> = {
    select: () => chain,
    in: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    gte: () => chain,
    lte: () => chain,
    lt: () => chain,
    gt: () => chain,
    not: () => chain,
    or: () => chain,
    then: (resolve: (value: T) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return chain;
}

const branchRow = {
  id: "b1",
  code: "BKK",
  name_th: "กรุงเทพ",
  name_en: "Bangkok",
  is_active: true,
};

describe("admin POS catalog API", () => {
  it("reads ready catalog thumbnails from media gallery variants", () => {
    expect(
      posMediaGalleryPrimaryUrl([
        {
          status: "ready",
          variants: {
            thumbnail: { url: "https://cdn.example/thumb.webp" },
            card: { url: "https://cdn.example/card.webp" },
          },
        },
      ]),
    ).toBe("https://cdn.example/card.webp");
  });

  it("does not send non-UUID rental searches to the assets UUID id filter", async () => {
    const orClauses: string[] = [];
    mockState.query = {
      mode: "rental",
      search: "สว่าน",
      branchId: "branch-hq",
    };
    const result = { data: [], error: null };
    const query: QueryChain<typeof result> = {
      select: () => query,
      eq: () => query,
      gt: () => query,
      order: () => query,
      limit: () => query,
      or: (clause: string) => {
        orClauses.push(clause);
        return query;
      },
      then: (resolve: (value: typeof result) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    mockState.platformAdminClient = { from: () => query };

    await expect(catalogGet({})).resolves.toEqual({ items: [] });
    expect(orClauses[0]).not.toContain("id.eq.");
    expect(orClauses[0]).toContain("name_th.ilike.*สว่าน*");
  });
});

describe("admin POS history API", () => {
  it("returns branch-scoped sale and rental transactions with daily summary", async () => {
    mockState.query = { date: "2026-05-10", branchId: "branch-hq" };
    mockState.platformAdminClient = {
      from: (table: string) =>
        queryResult(
          table === "admin_user_branch_access"
            ? { data: [{ branch_id: "branch-hq" }], error: null }
            : table === "orders"
              ? {
                  data: [
                    {
                      id: "order-1",
                      order_number: "HOP-001",
                      created_at: "2026-05-10T04:00:00.000Z",
                      walk_in_phone: "0812345678",
                      address_snapshot: { contactName: "Walk In A" },
                      grand_total: 1200,
                      pos_paid_amount: 1200,
                      pos_payment_method: "cash",
                      payment_status: "paid",
                      pos_branch_id: "branch-hq",
                      pos_branch_name: "HQ",
                    },
                  ],
                  error: null,
                }
              : {
                  data: [
                    {
                      id: "booking-1",
                      created_at: "2026-05-10T05:00:00.000Z",
                      walk_in_phone: "0899999999",
                      booker_name: "Walk In B",
                      status: "confirmed",
                      rental_total: 500,
                      checkout_paid_amount: 700,
                      checkout_payment_method: "qr_transfer",
                      deposit_payment_status: "paid",
                      deposit_refund_status: "pending",
                      deposit_refund_amount: 150,
                      pos_branch_id: "branch-hq",
                      pos_branch_name: "HQ",
                    },
                  ],
                  error: null,
                },
        ),
    };

    const result = await historyGet({});

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      type: "rental",
      amount: 700,
      status: "confirmed",
      depositRefundStatus: "pending",
      depositRefundAmount: 150,
    });
    expect(result.summary).toMatchObject({
      totalAmount: 1900,
      totalSales: 1200,
      totalRentals: 700,
      transactionCount: 2,
    });
    expect(result.summary.paymentBreakdown.cash).toEqual({
      count: 1,
      amount: 1200,
    });
    expect(result.summary.paymentBreakdown.qr_transfer).toEqual({
      count: 1,
      amount: 700,
    });
  });
});

describe("admin POS history cancel API", () => {
  it("cancels POS sales as super admin and restocks applied inventory", async () => {
    const rpcCalls: unknown[] = [];
    mockState.body = { type: "sale", id: "order-1" };
    mockState.superAdminClient = {
      rpc: async (name: string, params: unknown) => {
        rpcCalls.push({ name, params });
        return {
          data: {
            ok: true,
            status: "cancelled",
            inventoryWasApplied: true,
            inventoryAlreadyReversed: false,
            inventoryRestocked: true,
            restockedQuantity: 2,
          },
          error: null,
        };
      },
    };

    const result = await historyCancelPost({});

    expect(result).toMatchObject({
      ok: true,
      status: "cancelled",
      inventoryWasApplied: true,
      inventoryRestocked: true,
      restockedQuantity: 2,
      inventoryReversalRequired: false,
    });
    expect(rpcCalls).toEqual([
      { name: "f_cancel_pos_sale", params: { p_order_id: "order-1" } },
    ]);
  });
});

beforeEach(() => {
  mockState.body = {};
  mockState.query = {};
  mockState.routerParams = {};
  mockState.headers = [];
  mockState.superAdminClient = null;
  mockState.platformAdminClient = null;
});

describe("admin rental booking deposit API", () => {
  it("updates deposit amount and writes an audit log", async () => {
    const updates: Record<string, unknown>[] = [];
    const logs: Record<string, unknown>[] = [];
    let rentalBookingCall = 0;
    mockState.routerParams = { id: "booking-1" };
    mockState.body = {
      depositPaidAmount: 300,
      depositPaymentMethod: "cash",
      depositNotes: "manual override",
      reason: "staff correction",
    };
    mockState.platformAdminClient = {
      from: (table: string) => {
        if (table === "rental_booking_deposit_action_logs") {
          return {
            insert: async (payload: Record<string, unknown>) => {
              logs.push(payload);
              return { error: null };
            },
          };
        }
        rentalBookingCall += 1;
        if (rentalBookingCall === 1) {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: "booking-1",
                    rental_total: 500,
                    deposit_amount: 200,
                    deposit_paid_amount: 200,
                    deposit_payment_method: "qr_transfer",
                    deposit_payment_status: "paid",
                    checkout_total_amount: 700,
                    checkout_paid_amount: 700,
                    checkout_payment_method: "qr_transfer",
                    pos_branch_id: "b1",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          update: (payload: Record<string, unknown>) => {
            updates.push(payload);
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: {
                      id: "booking-1",
                      deposit_amount: 200,
                      deposit_paid_amount: 300,
                      deposit_payment_method: "cash",
                      deposit_payment_status: "paid",
                      deposit_notes: "manual override",
                      checkout_total_amount: 800,
                      checkout_paid_amount: 800,
                      checkout_payment_method: "cash",
                    },
                    error: null,
                  }),
                }),
              }),
            };
          },
        };
      },
    };

    await expect(depositPatch({})).resolves.toMatchObject({
      log: { action: "manual_update" },
    });
    expect(updates[0]).toMatchObject({
      deposit_paid_amount: 300,
      checkout_total_amount: 800,
      checkout_paid_amount: 800,
    });
    expect(logs[0]).toMatchObject({
      booking_id: "booking-1",
      staff_user_id: "staff-1",
      branch_id: "b1",
      action: "manual_update",
      reason: "staff correction",
    });
    expect(logs[0].old_values.depositPaidAmount).toBe(200);
    expect(logs[0].new_values.depositPaidAmount).toBe(300);
  });
});

describe("admin POS branch access API", () => {
  it("returns staff users with assigned POS branches", async () => {
    mockState.superAdminClient = {
      from: (table: string) =>
        queryResult(
          table === "users"
            ? {
                data: [
                  {
                    id: "u1",
                    full_name: "Staff",
                    phone: "081",
                    platform_role: "staff",
                  },
                ],
                error: null,
              }
            : table === "store_branches"
              ? { data: [branchRow], error: null }
              : {
                  data: [{ user_id: "u1", branch_id: "b1", can_pos: true }],
                  error: null,
                },
        ),
    };

    const result = await branchAccessGet({});

    expect(result.users[0]).toMatchObject({ id: "u1", branchIds: ["b1"] });
    expect(result.branches[0]).toMatchObject({ id: "b1", code: "BKK" });
  });

  it("replaces branch grants for a staff user", async () => {
    const inserted: unknown[] = [];
    mockState.body = { userId: "u1", branchIds: ["b1"] };
    mockState.superAdminClient = {
      from: (table: string) => {
        if (table === "users")
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  maybeSingle: async () => ({
                    data: { id: "u1", platform_role: "staff" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        if (table === "store_branches")
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({ data: [{ id: "b1" }], error: null }),
              }),
            }),
          };
        return {
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async (rows: unknown[]) => {
            inserted.push(...rows);
            return { error: null };
          },
        };
      },
    };

    await expect(branchAccessPatch({})).resolves.toMatchObject({ ok: true });
    expect(inserted).toEqual([
      {
        user_id: "u1",
        branch_id: "b1",
        can_pos: true,
        created_by_user_id: "admin-1",
      },
    ]);
  });
});

describe("admin POS sale API", () => {
  it("creates a paid walk-in sale and applies branch inventory", async () => {
    const rpcCalls: unknown[] = [];
    mockState.body = {
      walkInPhone: "0812345678",
      branchId: "b1",
      paymentMethod: "cash",
      paidAmount: 200,
      items: [{ skuId: "sku-1", quantity: 2 }],
    };
    mockState.platformAdminClient = {
      rpc: async (name: string, params: unknown) => {
        rpcCalls.push({ name, params });
        return { error: null };
      },
      from: (table: string) => {
        if (table === "walk_in_customers")
          return { upsert: async () => ({ error: null }) };
        if (table === "store_branches")
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: branchRow, error: null }),
                }),
              }),
            }),
          };
        if (table === "product_skus")
          return {
            select: () => ({
              in: async () => ({
                data: [
                  {
                    id: "sku-1",
                    product_id: "p1",
                    label_th: "Cable",
                    sku_code: "CBL",
                    price: 100,
                    original_price: 100,
                    currency_code: "THB",
                    stock: 10,
                    products: { name_th: "Cable", is_hidden: false },
                  },
                ],
                error: null,
              }),
            }),
          };
        if (table === "sku_branch_inventory")
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  in: async () => ({
                    data: [{ sku_id: "sku-1", available: 5 }],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        if (table === "orders")
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: "o1", order_number: "HOP-1", grand_total: 200 },
                  error: null,
                }),
              }),
            }),
            delete: () => ({ eq: async () => ({ error: null }) }),
          };
        return { insert: async () => ({ error: null }) };
      },
    };

    const result = await posSalePost({});

    expect(result.appliedInventory).toBe(true);
    expect(rpcCalls).toEqual([
      { name: "f_apply_order_inventory", params: { p_order_id: "o1" } },
    ]);
  });

  it("allows paid POS sales without customer information", async () => {
    const insertedOrders: Record<string, unknown>[] = [];
    mockState.body = {
      branchId: "b1",
      paymentMethod: "cash",
      paidAmount: 100,
      items: [{ skuId: "sku-1", quantity: 1 }],
    };
    mockState.platformAdminClient = {
      rpc: async () => ({ error: null }),
      from: (table: string) => {
        if (table === "store_branches")
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: branchRow, error: null }),
                }),
              }),
            }),
          };
        if (table === "product_skus")
          return {
            select: () => ({
              in: async () => ({
                data: [
                  {
                    id: "sku-1",
                    product_id: "p1",
                    label_th: "Cable",
                    price: 100,
                    original_price: 100,
                    currency_code: "THB",
                    products: { name_th: "Cable", is_hidden: false },
                  },
                ],
                error: null,
              }),
            }),
          };
        if (table === "sku_branch_inventory")
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  in: async () => ({
                    data: [{ sku_id: "sku-1", available: 5 }],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        if (table === "orders")
          return {
            insert: (payload: Record<string, unknown>) => {
              insertedOrders.push(payload);
              return {
                select: () => ({
                  single: async () => ({
                    data: { id: "o1", order_number: "HOP-1", grand_total: 100 },
                    error: null,
                  }),
                }),
              };
            },
            delete: () => ({ eq: async () => ({ error: null }) }),
          };
        return { insert: async () => ({ error: null }) };
      },
    };

    await expect(posSalePost({})).resolves.toMatchObject({
      appliedInventory: true,
    });
    expect(insertedOrders[0]).toMatchObject({
      user_id: null,
      walk_in_phone: null,
    });
  });

  it("rejects POS sales that are not fully paid before stock deduction", async () => {
    mockState.body = {
      branchId: "b1",
      paymentMethod: "cash",
      paidAmount: 50,
      items: [{ skuId: "sku-1", quantity: 1 }],
    };
    mockState.platformAdminClient = {
      from: (table: string) => {
        if (table === "store_branches")
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: branchRow, error: null }),
                }),
              }),
            }),
          };
        if (table === "product_skus")
          return {
            select: () => ({
              in: async () => ({
                data: [
                  {
                    id: "sku-1",
                    product_id: "p1",
                    label_th: "Cable",
                    price: 100,
                    original_price: 100,
                    currency_code: "THB",
                    products: { name_th: "Cable", is_hidden: false },
                  },
                ],
                error: null,
              }),
            }),
          };
        if (table === "sku_branch_inventory")
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  in: async () => ({
                    data: [{ sku_id: "sku-1", available: 5 }],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        if (table === "orders") throw new Error("order should not be created");
        return { insert: async () => ({ error: null }) };
      },
    };

    await expect(posSalePost({})).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe("admin POS rental booking API", () => {
  it("stores same-day customer return dates as one-day exclusive DB ranges", async () => {
    const insertedBookings: Record<string, unknown>[] = [];
    mockState.body = {
      walkInPhone: "0812345678",
      bookerName: "Walk In",
      assetId: "asset-1",
      branchId: "b1",
      startDate: "2026-05-21",
      endDate: "2026-05-21",
      depositPaidAmount: 3000,
      depositPaymentMethod: "cash",
    };
    mockState.platformAdminClient = {
      from: (table: string) => {
        if (table === "store_branches")
          return {
            select: () => {
              const chain = {
                eq: () => chain,
                single: async () => ({ data: branchRow, error: null }),
              };
              return chain;
            },
          };
        if (table === "assets")
          return {
            select: () => {
              const chain = {
                eq: () => chain,
                maybeSingle: async () => ({
                  data: {
                    id: "asset-1",
                    code: "CAM",
                    slug: "camera",
                    name_th: "Camera",
                    name_en: "Camera",
                    thumbnail_url: "thumb.jpg",
                    status: "active",
                    is_hidden: false,
                    currency_code: "THB",
                    daily_rate: 100,
                    weekly_rate: 0,
                    monthly_rate: 0,
                    daily_enabled: true,
                    weekly_enabled: false,
                    monthly_enabled: false,
                    deposit_amount: 3000,
                    min_rental_days: 1,
                    max_rental_days: 0,
                    matches: [],
                  },
                  error: null,
                }),
              };
              return chain;
            },
          };
        if (table === "walk_in_customers")
          return { upsert: async () => ({ error: null }) };
        if (table === "rental_booking_payment_lines")
          return { insert: async () => ({ error: null }) };
        if (table === "rental_bookings")
          return {
            select: (select: string) => {
              const chain = {
                in: () => chain,
                lt: () => chain,
                gt: () => chain,
                limit: () => chain,
                eq: () => chain,
                is: () => chain,
                neq: () => chain,
                then: (resolve: (value: unknown) => unknown) =>
                  Promise.resolve(
                    select === "id"
                      ? { data: [], error: null }
                      : {
                          data: [
                            {
                              ...insertedBookings[0],
                              asset: {
                                storage_branch_id: "b1",
                                store_branches: branchRow,
                              },
                            },
                          ],
                          error: null,
                        },
                  ).then(resolve),
              };
              return chain;
            },
            insert: async (payload: Record<string, unknown>) => {
              insertedBookings.push(payload);
              return { error: null };
            },
          };
        return { insert: async () => ({ error: null }) };
      },
    };

    const result = await posBookingPost({});

    expect(insertedBookings[0]).toMatchObject({
      start_date: "2026-05-21",
      end_date: "2026-05-22",
      rental_days: 1,
      rental_total: 100,
    });
    expect(result.booking.rentalDays).toBe(1);
  });
});

describe("admin POS accounting CSV export", () => {
  it("exports sale and rental rows with accounting headers", async () => {
    mockState.platformAdminClient = {
      from: (table: string) =>
        queryResult(
          table === "orders"
            ? {
                data: [
                  {
                    id: "o1",
                    order_number: "HOP-1",
                    created_at: "2026-05-01T00:00:00Z",
                    walk_in_phone: "081",
                    grand_total: 107,
                    pos_paid_amount: 107,
                    pos_payment_method: "cash",
                    pos_branch_name: "BKK",
                    order_items: [
                      {
                        sku_id: "sku-1",
                        name: "Cable",
                        quantity: 1,
                        unit_price: 107,
                        line_total: 107,
                      },
                    ],
                  },
                ],
                error: null,
              }
            : {
                data: [
                  {
                    id: "r1",
                    created_at: "2026-05-02T00:00:00Z",
                    walk_in_phone: "082",
                    asset_code: "CAM",
                    asset_name: "Camera",
                    rental_days: 1,
                    rental_total: 214,
                    checkout_total_amount: 214,
                    checkout_paid_amount: 214,
                    checkout_payment_method: "qr_transfer",
                    deposit_refund_status: "refunded",
                    deposit_refund_amount: 100,
                    pos_branch_name: "BKK",
                  },
                ],
                error: null,
              },
        ),
    };

    const csv = await accountingExportGet({});

    expect(mockState.headers.some((h) => h.value.includes("text/csv"))).toBe(
      true,
    );
    expect(csv).toContain("Date,Branch,Document Type");
    expect(csv).toContain("POS Sale");
    expect(csv).toContain("POS Rental");
    expect(csv).toContain("Refund Status,Refund Amount");
    expect(csv).toContain("refunded,100.00");
    expect(csv).toContain("7.00");
  });
});
