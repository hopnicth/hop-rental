/**
 * Tests for PATCH /api/rental-bookings/:id/hub
 *
 * Verifies server-side guard that validates is_active + is_public on the
 * submitted branchId before writing hub_id / hub_name to rental_bookings.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Shared mutable state (hoisted) ────────────────────────────────────────────
const mockState = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  body: {} as Record<string, unknown>,
  routerParam: "booking-1" as string | undefined,
  // Per-table response overrides
  branchRow: null as Record<string, unknown> | null,
  branchError: null as { message: string } | null,
  bookingRow: null as Record<string, unknown> | null,
  bookingFetchError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  // Track the UPDATE payload
  lastUpdatePayload: {} as Record<string, unknown>,
}));

// ── Mock h3 ───────────────────────────────────────────────────────────────────
vi.mock("h3", () => ({
  defineEventHandler: (fn: (e: unknown) => unknown) => fn,
  getRouterParam: (_e: unknown, _k: string) => mockState.routerParam,
  readBody: async () => mockState.body,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage ?? "error"), opts),
}));

// ── Mock Supabase ─────────────────────────────────────────────────────────────
vi.mock("#supabase/server", () => ({
  serverSupabaseUser: async () =>
    mockState.userId ? { id: mockState.userId } : null,
  serverSupabaseServiceRole: () => ({
    from: (table: string) => {
      if (table === "store_branches") {
        return buildChain({
          maybeSingle: async () => ({
            data: mockState.branchRow,
            error: mockState.branchError,
          }),
        });
      }
      if (table === "rental_bookings") {
        // Distinguish SELECT (ownership check) from UPDATE by tracking calls
        let isUpdate = false;
        const chain = {
          select: () => chain,
          update: (payload: Record<string, unknown>) => {
            isUpdate = true;
            mockState.lastUpdatePayload = payload;
            return chain;
          },
          eq: () => chain,
          maybeSingle: async () =>
            isUpdate
              ? { data: null, error: null }
              : {
                  data: mockState.bookingRow,
                  error: mockState.bookingFetchError,
                },
          then: (resolve: (v: { data: null; error: null }) => unknown) =>
            Promise.resolve(resolve({ data: null, error: mockState.updateError })),
        };
        return chain;
      }
      return buildChain({ maybeSingle: async () => ({ data: null, error: null }) });
    },
  }),
}));

// ── Mock mixed-checkout util ──────────────────────────────────────────────────
vi.mock("~~/server/utils/mixed-checkout", () => ({
  getMixedCheckoutUserId: (user: { id?: string } | null) => user?.id ?? null,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildChain(overrides: Record<string, unknown>) {
  const base = {
    select: () => base,
    eq: () => base,
    update: () => base,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (v: { data: null; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: null, error: null })),
    ...overrides,
  };
  return base;
}

const CANONICAL_BRANCH = {
  id: "branch-e12b7a81",
  name_th: "สาขาหน้านิคมลาดกระบัง",
  name_en: "Lat Krabang Industrial Estate",
  is_active: true,
  is_public: true,
};

const DRAFT_BOOKING = {
  id: "booking-1",
  user_id: "user-1",
  status: "draft",
};

// ── Import handler after all mocks ────────────────────────────────────────────
const hubPatch = (
  await import("../../server/api/rental-bookings/[id]/hub.patch")
).default;

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("PATCH /api/rental-bookings/:id/hub", () => {
  beforeEach(() => {
    mockState.userId = "user-1";
    mockState.routerParam = "booking-1";
    mockState.body = { branchId: "branch-e12b7a81" };
    mockState.branchRow = CANONICAL_BRANCH;
    mockState.branchError = null;
    mockState.bookingRow = DRAFT_BOOKING;
    mockState.bookingFetchError = null;
    mockState.updateError = null;
    mockState.lastUpdatePayload = {};
  });

  it("updates hub_id and hub_name for a valid public active branch", async () => {
    const result = await hubPatch({} as never);

    expect((result as { booking: Record<string, unknown> }).booking).toMatchObject({
      id: "booking-1",
      hub_id: "branch-e12b7a81",
      hub_name: "สาขาหน้านิคมลาดกระบัง",
    });
    expect(mockState.lastUpdatePayload).toMatchObject({
      hub_id: "branch-e12b7a81",
      hub_name: "สาขาหน้านิคมลาดกระบัง",
    });
  });

  it("rejects archived duplicate branch store-nikhom-lkb (is_active=false)", async () => {
    mockState.body = { branchId: "store-nikhom-lkb" };
    mockState.branchRow = null; // DB returns null because is_active=false filter

    await expect(hubPatch({} as never)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "branchId must reference an active public branch",
    });
  });

  it("rejects an active but non-public branch (is_public=false)", async () => {
    mockState.body = { branchId: "branch-hq" };
    mockState.branchRow = null; // is_public filter excludes it

    await expect(hubPatch({} as never)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "branchId must reference an active public branch",
    });
  });

  it("rejects a non-existent branch id", async () => {
    mockState.body = { branchId: "branch-does-not-exist" };
    mockState.branchRow = null;

    await expect(hubPatch({} as never)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "branchId must reference an active public branch",
    });
  });

  it("rejects unauthenticated requests", async () => {
    mockState.userId = null;

    await expect(hubPatch({} as never)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("rejects when booking does not belong to the authenticated user", async () => {
    // Booking exists but belongs to a different user → ownership query returns null
    mockState.bookingRow = null;

    await expect(hubPatch({} as never)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: "Draft booking not found or not owned by this user",
    });
  });

  it("returns 400 when branchId is missing from body", async () => {
    mockState.body = {};

    await expect(hubPatch({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "branchId is required",
    });
  });
});
