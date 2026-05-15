import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const mockState = vi.hoisted(() => ({
  authUser: { id: "user-1" } as Record<string, unknown> | null,
  routerParams: { paymentAttemptId: "attempt-1" } as Record<string, string>,
  db: null as Record<string, Row[]> | null,
  gatewayResult: {
    gatewayChargeId: "ch_1",
    gatewaySourceId: "src_1",
    status: "paid",
    authorizeUri: null,
    qrImageUrl: "https://qr",
    expiresAt: "2026-05-12T12:03:00.000Z",
    failureCode: null,
    failureMessage: null,
    raw: { id: "ch_1", amount: 25000, currency: "thb", successful: true },
  } as Record<string, unknown>,
  client: null as ReturnType<typeof makeClient> | null,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  getRouterParam: (_event: unknown, name: string) =>
    mockState.routerParams[name],
  createError: (opts: { statusMessage?: string; statusCode?: number }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("#supabase/server", () => ({
  serverSupabaseUser: async () => mockState.authUser,
  serverSupabaseServiceRole: () => mockState.client,
}));

vi.mock("~~/server/utils/omise", () => ({
  retrieveOmiseCharge: async () => mockState.gatewayResult,
}));

const pollPaymentAttempt = (
  await import("../../server/api/payments/poll/[paymentAttemptId].post")
).default;

function matches(row: Row, filters: Array<[string, unknown]>) {
  return filters.every(([column, value]) => row[column] === value);
}

function makeClient(db: Record<string, Row[]>) {
  const rpcCalls: Array<{ name: string; params?: Record<string, unknown> }> =
    [];
  return {
    rpcCalls,
    rpc: async (name: string, params?: Record<string, unknown>) => {
      rpcCalls.push({ name, params });
      return { error: null };
    },
    from(table: string) {
      const rows = db[table] ?? (db[table] = []);
      return {
        select: () => {
          const filters: Array<[string, unknown]> = [];
          return {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return this;
            },
            maybeSingle: async () => ({
              data: rows.find((row) => matches(row, filters)) ?? null,
              error: null,
            }),
          };
        },
        update(payload: Row) {
          const filters: Array<[string, unknown]> = [];
          return {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return this;
            },
            neq(column: string, value: unknown) {
              for (const row of rows) {
                if (matches(row, filters) && row[column] !== value)
                  Object.assign(row, payload);
              }
              return Promise.resolve({ error: null });
            },
            select: () => ({
              single: async () => {
                const row =
                  rows.find((candidate) => matches(candidate, filters)) ?? null;
                if (row) Object.assign(row, payload);
                return { data: row, error: null };
              },
            }),
          };
        },
        insert(payload: Row) {
          rows.push({ ...payload });
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq(column: string, value: unknown) {
              db[table] = rows.filter((row) => row[column] !== value);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

function seed() {
  return {
    payment_attempts: [
      {
        id: "attempt-1",
        order_id: "order-1",
        user_id: "user-1",
        method: "promptpay",
        status: "pending",
        amount: 250,
        currency_code: "THB",
        gateway_charge_id: "ch_1",
        expires_at: "2026-05-12T12:03:00.000Z",
      },
    ],
    orders: [
      {
        id: "order-1",
        user_id: "user-1",
        status: "submitted",
        payment_status: "awaiting_payment",
        grand_total: 250,
        currency_code: "THB",
      },
    ],
    carts: [
      {
        id: "cart-1",
        user_id: "user-1",
        updated_at: "2026-05-12T12:00:00.000Z",
      },
    ],
    cart_items: [{ id: "item-1", cart_id: "cart-1", sku_id: "sku-1" }],
    payment_alerts: [],
  } as Record<string, Row[]>;
}

describe("sale payment poll endpoint", () => {
  beforeEach(() => {
    mockState.authUser = { id: "user-1" };
    mockState.routerParams = { paymentAttemptId: "attempt-1" };
    mockState.gatewayResult = {
      gatewayChargeId: "ch_1",
      gatewaySourceId: "src_1",
      status: "paid",
      authorizeUri: null,
      qrImageUrl: "https://qr",
      expiresAt: "2026-05-12T12:03:00.000Z",
      failureCode: null,
      failureMessage: null,
      raw: { id: "ch_1", amount: 25000, currency: "thb", successful: true },
    };
    mockState.db = seed();
    mockState.client = makeClient(mockState.db);
  });

  it("marks a paid PromptPay attempt paid, confirms the order, applies inventory, and clears the cart", async () => {
    const result = await pollPaymentAttempt({});
    expect(result).toMatchObject({
      paymentAttemptId: "attempt-1",
      status: "paid",
    });
    expect(mockState.db?.payment_attempts[0]).toMatchObject({ status: "paid" });
    expect(mockState.db?.orders[0]).toMatchObject({
      payment_status: "paid",
      status: "confirmed",
    });
    expect(mockState.client?.rpcCalls).toEqual([
      { name: "f_apply_order_inventory", params: { p_order_id: "order-1" } },
    ]);
    expect(mockState.db?.cart_items).toEqual([]);
  });

  it("keeps polling an already-paid attempt idempotent", async () => {
    const database = seed();
    database.orders[0]!.payment_status = "paid";
    database.orders[0]!.status = "confirmed";
    database.payment_attempts[0]!.status = "paid";
    mockState.db = database;
    mockState.client = makeClient(database);

    const result = await pollPaymentAttempt({});

    expect(result).toMatchObject({
      paymentAttemptId: "attempt-1",
      status: "paid",
    });
    expect(mockState.client?.rpcCalls).toEqual([]);
    expect(mockState.db?.orders[0]).toMatchObject({
      payment_status: "paid",
      status: "confirmed",
    });
  });

  it("does not mark paid when the gateway amount mismatches", async () => {
    mockState.gatewayResult = {
      ...mockState.gatewayResult,
      raw: { id: "ch_1", amount: 24000, currency: "thb", successful: true },
    };

    await expect(pollPaymentAttempt({})).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockState.db?.payment_attempts[0]).toMatchObject({
      status: "pending",
    });
    expect(mockState.db?.orders[0]).toMatchObject({
      payment_status: "awaiting_payment",
      status: "submitted",
    });
  });

  it("rejects attempts owned by another user", async () => {
    mockState.authUser = { id: "user-2" };

    await expect(pollPaymentAttempt({})).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
