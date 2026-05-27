/**
 * Tests for GET /api/branches — public storefront branch list.
 *
 * After migration 102, only branches with is_active=true AND is_public=true
 * should be returned. The canonical LKB branch (branch-e12b7a81) is the only
 * public branch. Admin/POS helpers (resolveActiveStoreBranch) must NOT be
 * restricted by is_public.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Shared mutable state (hoisted before vi.mock calls) ───────────────────────
const mockState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  capturedFilters: [] as Array<[string, unknown]>,
  capturedTable: "" as string,
}));

// ── Mock h3 ───────────────────────────────────────────────────────────────────
vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  createError: (opts: { statusMessage?: string; statusCode?: number }) =>
    Object.assign(new Error(opts.statusMessage ?? "error"), opts),
}));

// ── Mock Supabase service-role client ─────────────────────────────────────────
vi.mock("#supabase/server", () => ({
  serverSupabaseServiceRole: () => ({
    from: (table: string) => {
      mockState.capturedTable = table;
      mockState.capturedFilters = [];
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          mockState.capturedFilters.push([col, val]);
          return builder;
        },
        order: () => builder,
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve(resolve({ data: mockState.rows, error: null })).then(
            resolve,
          ),
      };
      // Make builder thenable so await works on it directly
      (builder as unknown as Promise<unknown>)[Symbol.for("nodejs.rejection")] =
        undefined;
      return {
        ...builder,
        // The handler awaits the full chain; return a real promise
        select: () =>
          new Proxy(builder, {
            get(target, prop) {
              if (prop === "then") {
                return (
                  resolve: (v: { data: unknown; error: null }) => unknown,
                ) => Promise.resolve({ data: mockState.rows, error: null }).then(resolve);
              }
              return (target as Record<string, unknown>)[prop as string];
            },
          }),
      };
    },
  }),
}));

// ── Import handler after mocks ────────────────────────────────────────────────
const branchesGet = (await import("../../server/api/branches.get")).default;

// ── Branch fixture rows ───────────────────────────────────────────────────────
const CANONICAL_BRANCH = {
  id: "branch-e12b7a81",
  code: "LKB",
  name_th: "สาขาหน้านิคมลาดกระบัง",
  name_en: "Lat Krabang Industrial Estate",
  address_th: null,
  address_en: null,
  phone: null,
  email: null,
  latitude: null,
  longitude: null,
  notes: null,
  is_active: true,
  is_public: true,
  sort_order: 0,
  created_at: "2026-05-15T13:36:22.612949+00:00",
  updated_at: "2026-05-15T13:36:22.612949+00:00",
};

const DUPLICATE_BRANCH = {
  ...CANONICAL_BRANCH,
  id: "store-nikhom-lkb",
  code: "NLKB",
  is_active: false,
  is_public: false,
  sort_order: 30,
};

describe("GET /api/branches — public storefront branch list", () => {
  beforeEach(() => {
    mockState.capturedFilters = [];
    mockState.capturedTable = "";
    mockState.rows = [CANONICAL_BRANCH];
  });

  it("queries store_branches with is_active=true AND is_public=true filters", async () => {
    await branchesGet({} as never);

    expect(mockState.capturedTable).toBe("store_branches");
    expect(mockState.capturedFilters).toContainEqual(["is_active", true]);
    expect(mockState.capturedFilters).toContainEqual(["is_public", true]);
  });

  it("returns branch-e12b7a81 with the canonical Thai name", async () => {
    const result = await branchesGet({} as never);

    expect((result as { items: unknown[] }).items).toHaveLength(1);
    const first = (result as { items: Array<Record<string, unknown>> }).items[0];
    expect(first.id).toBe("branch-e12b7a81");
    expect(first.nameTh).toBe("สาขาหน้านิคมลาดกระบัง");
    expect(first.nameEn).toBe("Lat Krabang Industrial Estate");
    expect(first.code).toBe("LKB");
  });

  it("does NOT return store-nikhom-lkb (duplicate, archived)", async () => {
    // Simulate DB returning only the public branch (duplicate is filtered by DB)
    mockState.rows = [CANONICAL_BRANCH];

    const result = await branchesGet({} as never);
    const ids = (result as { items: Array<{ id: string }> }).items.map(
      (b) => b.id,
    );
    expect(ids).not.toContain("store-nikhom-lkb");
  });

  it("returns an empty list when no public branches exist", async () => {
    mockState.rows = [];

    const result = await branchesGet({} as never);
    expect((result as { items: unknown[] }).items).toHaveLength(0);
  });
});

describe("resolveActiveStoreBranch — admin helper is NOT restricted by is_public", () => {
  it("resolves a branch by id + is_active only, no is_public check", async () => {
    // Import the admin utility — its query must NOT include an is_public filter
    const { resolveActiveStoreBranch } = await import(
      "../../server/utils/admin-branches"
    );

    const capturedFilters: Array<[string, unknown]> = [];
    const fakeClient = {
      from: () => ({
        select: () => ({
          eq: (col: string, val: unknown) => {
            capturedFilters.push([col, val]);
            return {
              eq: (col2: string, val2: unknown) => {
                capturedFilters.push([col2, val2]);
                return {
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: "branch-e12b7a81",
                        code: "LKB",
                        name_th: "สาขาหน้านิคมลาดกระบัง",
                        name_en: "Lat Krabang Industrial Estate",
                        address_th: null,
                        address_en: null,
                        phone: null,
                        email: null,
                        latitude: null,
                        longitude: null,
                        notes: null,
                        is_active: true,
                        sort_order: 0,
                        created_at: "2026-05-15T13:36:22Z",
                        updated_at: "2026-05-15T13:36:22Z",
                      },
                      error: null,
                    }),
                };
              },
            };
          },
        }),
      }),
    } as Parameters<typeof resolveActiveStoreBranch>[0];

    const branch = await resolveActiveStoreBranch(fakeClient, "branch-e12b7a81");

    expect(branch.branchId).toBe("branch-e12b7a81");
    expect(branch.branchCode).toBe("LKB");
    // Admin helper must not filter by is_public
    const filterCols = capturedFilters.map(([col]) => col);
    expect(filterCols).not.toContain("is_public");
    expect(filterCols).toContain("is_active");
    expect(filterCols).toContain("id");
  });
});
