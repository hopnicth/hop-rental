/**
 * Tests: server/utils/customer-rental-booking-draft.ts
 *         + server/api/user/rental-bookings/drafts.post.ts (contract)
 *
 * Covers (mock DB client at the util boundary + route source inspection):
 *  1. happy path — valid asset + dates → draft row with asset_id set,
 *     server-computed rental_total, status draft, user_id from session
 *  2. missing asset (asset lookup returns null) → 404
 *  3. bad dates — returnDate before startDate (422), startDate in the past
 *     (422), missing startDate (422), missing assetId (422)
 *  4. never trusts client amounts (pricing derived from the asset)
 *  5. route enforces auth (serverSupabaseUser + 401) and no longer inserts
 *     into rental_bookings directly
 *  6. client (useBooking.addBooking) calls the endpoint, not a direct insert
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createCustomerRentalBookingDraft,
  type CustomerRentalDraftInput,
} from "../../server/utils/customer-rental-booking-draft";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const USER = "11111111-1111-4111-8111-111111111111";
const ASSET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// A start date always in the future (Bangkok-local), stable across runs.
const FUTURE_START = "2099-01-10";
const FUTURE_RETURN = "2099-01-12"; // inclusive → 3 rental days

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET,
    code: "AST-1",
    slug: "test-asset",
    name_th: "สินทรัพย์ทดสอบ",
    name_en: "Test Asset",
    thumbnail_url: "https://example.test/a.jpg",
    brand: "Brand",
    category_keys: ["others"],
    daily_rate: 500,
    weekly_rate: 3000,
    monthly_rate: 10000,
    deposit_amount: 2000,
    min_rental_days: 1,
    max_rental_days: 30,
    buffer_days: 0,
    currency_code: "THB",
    daily_enabled: true,
    weekly_enabled: true,
    monthly_enabled: true,
    status: "active",
    is_hidden: false,
    storage_branch_id: "branch-hq",
    ...overrides,
  };
}

/**
 * Minimal Supabase-like mock supporting:
 *  from("assets").select().eq().eq().eq().maybeSingle()
 *  from("rental_bookings").insert().select().single()
 */
function makeClient(opts: {
  assetRow?: Record<string, unknown> | null;
  assetError?: unknown;
  insertError?: { code?: string; message?: string } | null;
}) {
  const inserted: Record<string, unknown>[] = [];
  function builder(table: string) {
    let payload: Record<string, unknown> | null = null;
    const api: Record<string, unknown> = {
      select() {
        return api;
      },
      eq() {
        return api;
      },
      async maybeSingle() {
        if (table === "assets") {
          return { data: opts.assetRow ?? null, error: opts.assetError ?? null };
        }
        return { data: null, error: null };
      },
      insert(p: Record<string, unknown>) {
        payload = p;
        return api;
      },
      async single() {
        if (opts.insertError) return { data: null, error: opts.insertError };
        if (payload) {
          const row = { ...payload };
          inserted.push(row);
          return { data: row, error: null };
        }
        return { data: null, error: null };
      },
    };
    return api;
  }
  return { client: { from: builder } as never, inserted };
}

function baseInput(
  overrides: Partial<CustomerRentalDraftInput> = {},
): CustomerRentalDraftInput {
  return {
    assetId: ASSET,
    startDate: FUTURE_START,
    returnDate: FUTURE_RETURN,
    bookerName: "Local Customer",
    bookerPhone: "0800000001",
    ...overrides,
  };
}

describe("createCustomerRentalBookingDraft", () => {
  it("happy path — inserts a draft with asset_id set and server-computed total", async () => {
    const { client, inserted } = makeClient({ assetRow: asset() });
    const row = await createCustomerRentalBookingDraft(client, {
      userId: USER,
      input: baseInput(),
    });

    expect(inserted).toHaveLength(1);
    expect(row.asset_id).toBe(ASSET);
    expect(row.user_id).toBe(USER);
    expect(row.status).toBe("draft");
    expect(row.walk_in_phone).toBeNull();
    // 3 inclusive days × ฿500 = ฿1,500, deposit from the asset
    expect(row.rental_days).toBe(3);
    expect(row.rental_total).toBe(1500);
    expect(row.deposit_amount).toBe(2000);
    // end_date is stored exclusive (return + 1 day)
    expect(row.end_date).toBe("2099-01-13");
    expect((row.asset_snapshot as Record<string, unknown>).id).toBe(ASSET);
  });

  it("computes pricing from the asset, ignoring any client-supplied amounts", async () => {
    const { client } = makeClient({ assetRow: asset({ daily_rate: 999 }) });
    const row = await createCustomerRentalBookingDraft(client, {
      userId: USER,
      // even if a client tried to smuggle amounts, the input type has none;
      // this asserts the total comes from the asset's daily_rate
      input: baseInput(),
    });
    expect(row.daily_rate).toBe(999);
    expect(row.rental_total).toBe(2997); // 3 × 999
  });

  it("404 when the asset is not found / not active", async () => {
    const { client } = makeClient({ assetRow: null });
    await expect(
      createCustomerRentalBookingDraft(client, {
        userId: USER,
        input: baseInput(),
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("422 when returnDate is before startDate", async () => {
    const { client } = makeClient({ assetRow: asset() });
    await expect(
      createCustomerRentalBookingDraft(client, {
        userId: USER,
        input: baseInput({ startDate: "2099-01-12", returnDate: "2099-01-10" }),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("422 when startDate is in the past", async () => {
    const { client } = makeClient({ assetRow: asset() });
    await expect(
      createCustomerRentalBookingDraft(client, {
        userId: USER,
        input: baseInput({ startDate: "2000-01-01", returnDate: "2000-01-03" }),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("422 when assetId is missing", async () => {
    const { client } = makeClient({ assetRow: asset() });
    await expect(
      createCustomerRentalBookingDraft(client, {
        userId: USER,
        input: baseInput({ assetId: null }),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("422 when startDate is missing", async () => {
    const { client } = makeClient({ assetRow: asset() });
    await expect(
      createCustomerRentalBookingDraft(client, {
        userId: USER,
        input: baseInput({ startDate: null }),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("422 when the asset has no daily rate", async () => {
    const { client } = makeClient({ assetRow: asset({ daily_rate: 0 }) });
    await expect(
      createCustomerRentalBookingDraft(client, {
        userId: USER,
        input: baseInput(),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("422 when the duration exceeds the asset's max rental days", async () => {
    const { client } = makeClient({ assetRow: asset({ max_rental_days: 1 }) });
    await expect(
      createCustomerRentalBookingDraft(client, {
        userId: USER,
        input: baseInput(),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe("POST /api/user/rental-bookings/drafts — contract", () => {
  const routeSrc = read("server/api/user/rental-bookings/drafts.post.ts");

  it("authenticates via serverSupabaseUser and 401s when unauthenticated", () => {
    expect(routeSrc).toContain("serverSupabaseUser");
    expect(routeSrc).toContain("statusCode: 401");
  });

  it("delegates to the util and never inserts rental_bookings in the route", () => {
    expect(routeSrc).toContain("createCustomerRentalBookingDraft");
    expect(routeSrc).not.toContain('.from("rental_bookings")');
  });

  it("takes user_id from the session, not the request body", () => {
    expect(routeSrc).toContain("userId: String(userId)");
  });
});

describe("client addBooking — no longer writes rental_bookings directly", () => {
  const src = read("app/composables/useBooking.ts");

  it("addBooking posts to the server draft endpoint", () => {
    const addBooking = src.slice(src.indexOf("async function addBooking"));
    expect(addBooking).toContain("/api/user/rental-bookings/drafts");
    expect(addBooking).toContain('method: "POST"');
  });

  it("addBooking does not call the direct-insert schema-fallback path", () => {
    const addBooking = src.slice(
      src.indexOf("async function addBooking"),
      src.indexOf("async function confirmBooking"),
    );
    expect(addBooking).not.toContain("insertBookingWithSchemaFallback");
  });
});
