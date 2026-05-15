import { beforeEach, describe, expect, it, vi } from "vitest";

type BuilderResult = {
  data?: Record<string, unknown> | null;
  error?: { message: string; code?: string } | null;
};

interface MockBuilder {
  selectColumns: string;
  filters: Array<[string, unknown]>;
  select(columns: string): MockBuilder;
  eq(column: string, value: unknown): MockBuilder;
  single(): Promise<BuilderResult>;
}

const mockState = vi.hoisted(() => ({
  authUser: { id: "staff-1" } as Record<string, unknown> | null,
  result: { data: { id: "staff-1", platform_role: "staff" }, error: null } as BuilderResult,
  builder: null as MockBuilder | null,
}));

vi.mock("h3", () => ({
  createError: (opts: { statusMessage?: string; statusCode?: number }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("#supabase/server", () => ({
  serverSupabaseUser: async () => mockState.authUser,
  serverSupabaseServiceRole: () => ({
    from: () => {
      const builder: MockBuilder = {
        selectColumns: "",
        filters: [],
        select(columns: string) {
          this.selectColumns = columns;
          return this;
        },
        eq(column: string, value: unknown) {
          this.filters.push([column, value]);
          return this;
        },
        single() {
          return Promise.resolve(mockState.result);
        },
      };
      mockState.builder = builder;
      return builder;
    },
  }),
}));

describe("admin access utilities", () => {
  beforeEach(() => {
    mockState.authUser = { id: "staff-1" };
    mockState.result = {
      data: { id: "staff-1", platform_role: "staff" },
      error: null,
    };
    mockState.builder = null;
  });

  it("accepts Supabase auth users that expose id instead of sub", async () => {
    const { requirePlatformAdmin } = await import("../../server/utils/admin");

    const result = await requirePlatformAdmin({} as never);

    expect(result.userId).toBe("staff-1");
    expect(mockState.builder?.filters).toEqual([["id", "staff-1"]]);
  });

  it("allows staff admin access regardless of PDPA deletion request status", async () => {
    mockState.result = {
      data: {
        id: "staff-1",
        platform_role: "staff",
        account_status: "deletion_requested",
      },
      error: null,
    };
    const { requirePlatformAdmin } = await import("../../server/utils/admin");

    const result = await requirePlatformAdmin({} as never);

    expect(result.platformRole).toBe("staff");
    expect(mockState.builder?.selectColumns).toBe("id, platform_role");
  });

  it("rejects customer profiles", async () => {
    mockState.result = {
      data: { id: "customer-1", platform_role: "customer" },
      error: null,
    };
    const { requirePlatformAdmin } = await import("../../server/utils/admin");

    await expect(requirePlatformAdmin({} as never)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});