import { beforeEach, describe, expect, it, vi } from "vitest";

type MockError = { message: string; code?: string };
type BuilderResult = { data?: unknown; error?: MockError | null };

interface MockBuilder {
  table: string;
  action: string;
  payload: unknown;
  selectColumns: string;
  filters: Array<[string, unknown]>;
  select(columns: string): MockBuilder;
  update(payload: unknown): MockBuilder;
  eq(column: string, value: unknown): MockBuilder;
  single(): Promise<BuilderResult>;
}

interface MockClient {
  builders: MockBuilder[];
  from(table: string): MockBuilder;
}

const mockState = vi.hoisted(() => ({
  authUser: { id: "user-1" } as Record<string, unknown> | null,
  body: {} as Record<string, unknown>,
  client: null as MockClient | null,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: async () => mockState.body,
  createError: (opts: { statusMessage?: string; statusCode?: number }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("#supabase/server", () => ({
  serverSupabaseUser: async () => mockState.authUser,
  serverSupabaseServiceRole: () => mockState.client,
}));

function makeBuilder(table: string, result: BuilderResult): MockBuilder {
  const builder = {
    table,
    action: "",
    payload: undefined as unknown,
    selectColumns: "",
    filters: [] as Array<[string, unknown]>,
    select(columns: string) {
      this.action = this.action || "select";
      this.selectColumns = columns;
      return this;
    },
    update(payload: unknown) {
      this.action = "update";
      this.payload = payload;
      return this;
    },
    eq(column: string, value: unknown) {
      this.filters.push([column, value]);
      return this;
    },
    single() {
      return Promise.resolve(result);
    },
  };
  return builder;
}

function makeClient(results: BuilderResult[]): MockClient {
  const builders: MockBuilder[] = [];
  return {
    builders,
    from(table: string) {
      const result = results.shift() ?? { data: null, error: null };
      const builder = makeBuilder(table, result);
      builders.push(builder);
      return builder;
    },
  };
}

describe("user lifecycle API", () => {
  beforeEach(() => {
    mockState.authUser = { id: "user-1" };
    mockState.body = {};
    mockState.client = null;
  });

  it("deactivates only the authenticated user's profile", async () => {
    const client = makeClient([
      { data: { id: "user-1", account_status: "active" }, error: null },
      { data: { id: "user-1", account_status: "deactivated" }, error: null },
    ]);
    mockState.client = client;
    mockState.body = { action: "deactivate", userId: "user-2" };
    const handler = (await import("../../server/api/user/lifecycle.put"))
      .default;

    const response = (await handler({})) as {
      profile: { account_status: string };
    };

    expect(response.profile.account_status).toBe("deactivated");
    expect(client.builders[1].table).toBe("users");
    expect(client.builders[1].filters).toEqual([["id", "user-1"]]);
    expect(client.builders[1].payload).toMatchObject({
      account_status: "deactivated",
      lifecycle_updated_by: "user-1",
    });
    expect(client.builders[1].payload).toHaveProperty(
      "deactivation_requested_at",
    );
  });

  it("records PDPA deletion request without hard deleting the user", async () => {
    const client = makeClient([
      { data: { id: "user-1", account_status: "active" }, error: null },
      {
        data: { id: "user-1", account_status: "deletion_requested" },
        error: null,
      },
    ]);
    mockState.client = client;
    mockState.body = { action: "request_deletion" };
    const handler = (await import("../../server/api/user/lifecycle.put"))
      .default;

    await handler({});

    expect(client.builders[1].action).toBe("update");
    expect(client.builders[1].payload).toMatchObject({
      account_status: "deletion_requested",
      lifecycle_updated_by: "user-1",
      lifecycle_note:
        "Customer requested PDPA deletion from Account Settings. Transaction and tax records remain retained by legal policy.",
    });
    expect(client.builders[1].payload).toHaveProperty("deletion_requested_at");
    expect(client.builders[1].payload).toHaveProperty("lifecycle_updated_at");
    expect(client.builders[1].payload).not.toHaveProperty("platform_role");
  });

  it("rejects invalid lifecycle actions", async () => {
    mockState.client = makeClient([]);
    mockState.body = { action: "deleted" };
    const handler = (await import("../../server/api/user/lifecycle.put"))
      .default;

    await expect(handler({})).rejects.toMatchObject({ statusCode: 422 });
  });
});
