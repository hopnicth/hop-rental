import { describe, expect, it } from "vitest";
import { fetchAdminSaleOrderQueue } from "../../server/utils/admin-order-queue";
import type { AdminSaleOrderQueueFilterParams } from "../../app/types/admin-order";

type Row = Record<string, unknown>;

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const userC = "00000000-0000-4000-8000-000000000003";

function splitOrClauses(clause: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of clause) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

class Chain {
  private filters: Array<(row: Row) => boolean> = [];
  private head = false;
  private countExact = false;
  private rangeBounds: [number, number] | null = null;
  private orderColumn: string | null = null;
  private ascending = true;

  constructor(
    private db: Record<string, Row[]>,
    private table: string,
  ) {}

  select(_columns: string, opts?: { count?: string; head?: boolean }) {
    this.head = opts?.head === true;
    this.countExact = opts?.count === "exact";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  not(column: string, op: string, value: string) {
    if (op === "in") {
      const values = value
        .replace(/^\(|\)$/g, "")
        .split(",")
        .filter(Boolean);
      this.filters.push((row) => !values.includes(String(row[column] ?? "")));
    }
    return this;
  }

  gte(column: string, value: string) {
    this.filters.push((row) => String(row[column] ?? "") >= value);
    return this;
  }

  lte(column: string, value: string) {
    this.filters.push((row) => String(row[column] ?? "") <= value);
    return this;
  }

  or(clause: string) {
    const clauses = splitOrClauses(clause);
    this.filters.push((row) =>
      clauses.some((part) => {
        if (part.includes(".ilike.")) {
          const [column, pattern] = part.split(".ilike.");
          const needle = pattern.replace(/\*/g, "").toLowerCase();
          return String(row[column] ?? "")
            .toLowerCase()
            .includes(needle);
        }
        if (part.includes(".in.(")) {
          const [column, valuesPart] = part.split(".in.");
          const values = valuesPart.replace(/^\(|\)$/g, "").split(",");
          return values.includes(String(row[column] ?? ""));
        }
        return false;
      }),
    );
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderColumn = column;
    this.ascending = opts?.ascending !== false;
    return this;
  }

  range(start: number, end: number) {
    this.rangeBounds = [start, end];
    return this;
  }

  then(
    resolve: (value: {
      data: Row[] | null;
      error: null;
      count: number | null;
    }) => void,
    reject: (reason?: unknown) => void,
  ) {
    this.exec().then(resolve, reject);
  }

  private async exec() {
    let rows = [...(this.db[this.table] ?? [])].filter((row) =>
      this.filters.every((fn) => fn(row)),
    );
    const count = this.countExact ? rows.length : null;
    if (this.orderColumn) {
      const column = this.orderColumn;
      const multiplier = this.ascending ? 1 : -1;
      rows.sort((a, b) =>
        String(a[column] ?? "") > String(b[column] ?? "")
          ? multiplier
          : -multiplier,
      );
    }
    if (this.rangeBounds) {
      rows = rows.slice(this.rangeBounds[0], this.rangeBounds[1] + 1);
    }
    return { data: this.head ? null : rows, error: null, count };
  }
}

function client(database: Record<string, Row[]>) {
  return { from: (table: string) => new Chain(database, table) };
}

function order(patch: Partial<Row>): Row {
  return {
    id: patch.id,
    order_number: patch.order_number,
    user_id: patch.user_id,
    status: patch.status ?? "confirmed",
    payment_status: patch.payment_status ?? "paid",
    fulfillment_status: patch.fulfillment_status ?? "unfulfilled",
    shipping_mode: Object.prototype.hasOwnProperty.call(patch, "shipping_mode")
      ? patch.shipping_mode
      : "delivery",
    pickup_branch_id: patch.pickup_branch_id ?? null,
    grand_total: patch.grand_total ?? 100,
    currency_code: "THB",
    address_snapshot: patch.address_snapshot ?? { title: "Home" },
    created_at: patch.created_at,
    updated_at: patch.updated_at ?? patch.created_at,
    order_items: [{ count: patch.itemCount ?? 1 }],
  };
}

function db() {
  return {
    orders: [
      order({
        id: "o-delivery",
        order_number: "HOP-DELIVERY",
        user_id: userA,
        shipping_mode: "delivery",
        created_at: "2026-05-10T10:00:00.000Z",
      }),
      order({
        id: "o-pickup",
        order_number: "HOP-PICKUP",
        user_id: userB,
        shipping_mode: "pickup",
        pickup_branch_id: "branch-1",
        fulfillment_status: "ready_for_carrier_pickup",
        created_at: "2026-05-10T09:00:00.000Z",
      }),
      order({
        id: "o-awaiting",
        order_number: "HOP-AWAITING",
        user_id: userA,
        payment_status: "awaiting_payment",
        created_at: "2026-05-10T08:00:00.000Z",
      }),
      order({
        id: "o-review",
        order_number: "HOP-REVIEW",
        user_id: userC,
        payment_status: "pending_review",
        shipping_mode: "pickup",
        created_at: "2026-05-10T07:00:00.000Z",
      }),
      order({
        id: "o-completed",
        order_number: "HOP-COMPLETE",
        user_id: userA,
        status: "completed",
        created_at: "2026-05-10T06:00:00.000Z",
      }),
      order({
        id: "o-shipped",
        order_number: "HOP-SHIPPED",
        user_id: userB,
        fulfillment_status: "shipped",
        created_at: "2026-05-10T05:00:00.000Z",
      }),
      order({
        id: "o-legacy",
        order_number: "HOP-LEGACY",
        user_id: userC,
        shipping_mode: null,
        fulfillment_status: "preparing",
        created_at: "2026-05-10T04:00:00.000Z",
      }),
    ],
    users: [
      { id: userA, full_name: "Alice Admin", phone: "0811111111" },
      { id: userB, full_name: "Bob Buyer", phone: "0822222222" },
      { id: userC, full_name: "Charlie Customer", phone: "0833333333" },
    ],
    store_branches: [
      {
        id: "branch-1",
        code: "BKK",
        name_th: "สาขากรุงเทพ",
        name_en: "Bangkok",
      },
    ],
  } as Record<string, Row[]>;
}

async function fetchQueue(
  database: Record<string, Row[]>,
  filters: AdminSaleOrderQueueFilterParams,
  page = 0,
  pageSize = 20,
  searchUserIds: Set<string> | null = null,
) {
  return fetchAdminSaleOrderQueue({
    adminClient: client(database) as never,
    filters,
    page,
    pageSize,
    searchUserIds,
  });
}

describe("admin sale order operations queue", () => {
  it("defaults queue semantics to action_required when queue is omitted", async () => {
    const result = await fetchQueue(db(), {}, 0, 2);

    expect(result.items.map((item) => item.id)).toEqual([
      "o-delivery",
      "o-pickup",
    ]);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(true);
    expect(result.summary).toEqual({
      actionRequired: 3,
      delivery: 1,
      pickup: 1,
      awaitingPayment: 2,
      all: 7,
    });
  });

  it("filters awaiting_payment queue to unpaid and pending-review active orders", async () => {
    const result = await fetchQueue(db(), { queue: "awaiting_payment" });

    expect(result.items.map((item) => item.id)).toEqual([
      "o-awaiting",
      "o-review",
    ]);
    expect(result.total).toBe(2);
  });

  it("filters delivery and pickup queues using authoritative shipping_mode", async () => {
    const delivery = await fetchQueue(db(), { queue: "delivery" });
    const pickup = await fetchQueue(db(), { queue: "pickup" });

    expect(delivery.items.map((item) => item.id)).toEqual(["o-delivery"]);
    expect(delivery.items[0].fulfillmentMethod).toBe("delivery");
    expect(pickup.items.map((item) => item.id)).toEqual(["o-pickup"]);
    expect(pickup.items[0].pickupBranch).toEqual({
      id: "branch-1",
      name: "สาขากรุงเทพ",
    });
  });

  it("returns all sale orders in all queue with order-level pagination", async () => {
    const result = await fetchQueue(db(), { queue: "all" }, 1, 3);

    expect(result.items.map((item) => item.id)).toEqual([
      "o-review",
      "o-completed",
      "o-shipped",
    ]);
    expect(result.total).toBe(7);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(3);
    expect(result.hasMore).toBe(true);
  });

  it("summary counts respect search/global filters but not active queue", async () => {
    const result = await fetchQueue(
      db(),
      { queue: "delivery", search: "Alice" },
      0,
      20,
      new Set([userA]),
    );

    expect(result.items.map((item) => item.id)).toEqual(["o-delivery"]);
    expect(result.summary).toEqual({
      actionRequired: 1,
      delivery: 1,
      pickup: 0,
      awaitingPayment: 1,
      all: 3,
    });
  });
});
