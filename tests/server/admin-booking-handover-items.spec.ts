import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Row = Record<string, unknown>;

const mockState = vi.hoisted(() => ({
  body: {} as Row,
  routerParams: {} as Record<string, string>,
  client: null as ReturnType<typeof makeClient> | null,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  getRouterParam: (_event: unknown, name: string) => mockState.routerParams[name],
  readBody: async () => mockState.body,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({
    adminClient: mockState.client,
    userId: "staff-1",
    platformRole: "staff",
  }),
}));

const listGet = (
  await import("../../server/api/admin/rental-bookings/[id]/handover-items/index.get")
).default;
const createPost = (
  await import("../../server/api/admin/rental-bookings/[id]/handover-items/index.post")
).default;
const updatePatch = (
  await import("../../server/api/admin/rental-bookings/[id]/handover-items/[itemId].patch")
).default;
const deleteItem = (
  await import("../../server/api/admin/rental-bookings/[id]/handover-items/[itemId].delete")
).default;
const generatePost = (
  await import("../../server/api/admin/rental-bookings/[id]/handover-items/generate.post")
).default;

function baseItem(overrides: Row = {}): Row {
  return {
    id: `item-${Math.random()}`,
    booking_id: "booking-1",
    asset_id: null,
    item_name: "สว่าน",
    quantity_prepared: 1,
    sort_order: 0,
    preparation_note: null,
    pickup_checked: false,
    return_status: "pending",
    created_at: "2026-05-12T00:00:00.000Z",
    updated_at: "2026-05-12T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

function makeClient(input: { booking?: Row; items?: Row[] } = {}) {
  const db = {
    booking: input.booking ?? {
      id: "booking-1",
      status: "confirmed",
      asset_id: "asset-1",
      asset_name: "สว่านไฟฟ้า",
      product_name: "Drill",
    },
    items: input.items ? [...input.items] : [],
  };

  return {
    db,
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let insertPayload: Row | null = null;
      let updatePayload: Row | null = null;
      const rows = () =>
        table === "rental_bookings"
          ? [db.booking].filter((row) => row && filters.every((f) => f(row)))
          : db.items.filter((row) => filters.every((f) => f(row)));
      const chain: any = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return chain;
        },
        is: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return chain;
        },
        order: () => chain,
        insert: (payload: Row) => {
          insertPayload = payload;
          return chain;
        },
        update: (payload: Row) => {
          updatePayload = payload;
          return chain;
        },
        maybeSingle: async () => {
          if (updatePayload && table === "rental_booking_handover_items") {
            const row = rows()[0];
            if (!row) return { data: null, error: null };
            Object.assign(row, updatePayload, { updated_at: "2026-05-12T01:00:00.000Z" });
            return { data: row, error: null };
          }
          return { data: rows()[0] ?? null, error: null };
        },
        single: async () => {
          if (insertPayload && table === "rental_booking_handover_items") {
            const row = baseItem({ id: `item-${db.items.length + 1}`, ...insertPayload });
            db.items.push(row);
            return { data: row, error: null };
          }
          return { data: rows()[0] ?? null, error: null };
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: rows(), error: null }).then(resolve),
      };
      return chain;
    },
  };
}

beforeEach(() => {
  mockState.body = {};
  mockState.routerParams = { id: "booking-1", itemId: "item-1" };
  mockState.client = makeClient();
});

describe("rental booking handover items foundation", () => {
  it("adds schema enum, table, checks, indexes, and RLS", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/080_rental_booking_handover_items.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE TYPE public.rental_booking_handover_return_status");
    expect(sql).toContain("CREATE TABLE public.rental_booking_handover_items");
    expect(sql).toContain("quantity_prepared > 0");
    expect(sql).toContain("idx_rental_booking_handover_items_booking_sort");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("creates a handover item before pickup", async () => {
    mockState.body = { itemName: "ดอกสว่าน", quantityPrepared: 3, preparationNote: "ชุด A" };
    const res = await createPost({});
    expect(res.item).toMatchObject({ itemName: "ดอกสว่าน", quantityPrepared: 3 });
    expect(mockState.client!.db.items).toHaveLength(1);
  });

  it("rejects invalid item names and quantities", async () => {
    mockState.body = { itemName: " ", quantityPrepared: 1 };
    await expect(createPost({})).rejects.toMatchObject({ statusCode: 400 });
    mockState.body = { itemName: "สว่าน", quantityPrepared: 0 };
    await expect(createPost({})).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updates a handover item before pickup", async () => {
    mockState.client = makeClient({ items: [baseItem({ id: "item-1" })] });
    mockState.body = { itemName: "สว่านกระแทก", quantityPrepared: 2 };
    const res = await updatePatch({});
    expect(res.item).toMatchObject({ itemName: "สว่านกระแทก", quantityPrepared: 2 });
  });

  it("soft-deletes and list excludes deleted rows", async () => {
    mockState.client = makeClient({
      items: [baseItem({ id: "item-1" }), baseItem({ id: "item-2", item_name: "สายไฟ" })],
    });
    await deleteItem({});
    expect(mockState.client.db.items[0].deleted_at).toBeTruthy();
    const res = await listGet({});
    expect(res.items).toHaveLength(1);
    expect(res.items[0].itemName).toBe("สายไฟ");
  });

  it("generates one default row from booking snapshot", async () => {
    const res = await generatePost({});
    expect(res.status).toBe("created");
    expect(res.item).toMatchObject({ itemName: "สว่านไฟฟ้า", quantityPrepared: 1, assetId: "asset-1" });
  });

  it("does not duplicate generated rows when active rows exist", async () => {
    mockState.client = makeClient({ items: [baseItem({ id: "item-1" })] });
    const res = await generatePost({});
    expect(res.status).toBe("already_exists");
    expect(mockState.client.db.items).toHaveLength(1);
  });

  it("rejects create, update, and delete after pickup", async () => {
    mockState.client = makeClient({
      booking: { id: "booking-1", status: "picked_up", asset_id: "asset-1", asset_name: "Drill" },
      items: [baseItem({ id: "item-1" })],
    });
    mockState.body = { itemName: "สายไฟ", quantityPrepared: 1 };
    await expect(createPost({})).rejects.toMatchObject({ statusCode: 409 });
    await expect(updatePatch({})).rejects.toMatchObject({ statusCode: 409 });
    await expect(deleteItem({})).rejects.toMatchObject({ statusCode: 409 });
  });
});
