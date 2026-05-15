import { beforeEach, describe, expect, it, vi } from "vitest";

type BuilderResult = {
  data?: Record<string, unknown> | null;
  error?: { message: string; code?: string } | null;
};

interface MockBuilder {
  table: string;
  action: string;
  payload: unknown;
  selectColumns: string;
  filters: Array<[string, unknown]>;
  select(columns: string): MockBuilder;
  update(payload: unknown): MockBuilder;
  insert(payload: unknown): MockBuilder;
  eq(column: string, value: unknown): MockBuilder;
  maybeSingle(): Promise<BuilderResult>;
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
  return {
    table,
    action: "",
    payload: undefined,
    selectColumns: "",
    filters: [],
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
    insert(payload: unknown) {
      this.action = "insert";
      this.payload = payload;
      return this;
    },
    eq(column: string, value: unknown) {
      this.filters.push([column, value]);
      return this;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
    single() {
      return Promise.resolve(result);
    },
  };
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

describe("user profile API", () => {
  beforeEach(() => {
    mockState.authUser = { id: "user-1" };
    mockState.body = {};
    mockState.client = null;
  });

  it("GET returns only the authenticated user's profile", async () => {
    const client = makeClient([
      { data: { id: "user-1", full_name: "Jane", created_at: "2026-01-01" }, error: null },
    ]);
    mockState.client = client;
    const handler = (await import("../../server/api/user/index.get")).default;

    const response = (await handler({})) as { profile: { id: string } };

    expect(response.profile.id).toBe("user-1");
    expect(client.builders[0].filters).toEqual([["id", "user-1"]]);
    expect(client.builders[0].selectColumns).toContain("account_status");
  });

  it("PUT updates only the authenticated user's profile fields", async () => {
    const client = makeClient([
      { data: { id: "user-1" }, error: null },
      { data: { id: "user-1", full_name: "Jane Doe", phone: "0812345678" }, error: null },
    ]);
    mockState.client = client;
    mockState.body = { fullName: " Jane Doe ", phone: " 0812345678 ", id: "user-2" };
    const handler = (await import("../../server/api/user/index.put")).default;

    await handler({});

    expect(client.builders[1].action).toBe("update");
    expect(client.builders[1].filters).toEqual([["id", "user-1"]]);
    expect(client.builders[1].payload).toMatchObject({
      full_name: "Jane Doe",
      phone: "0812345678",
    });
    expect(client.builders[1].payload).not.toHaveProperty("id");
  });

  it("PUT creates the current user's profile row when missing", async () => {
    const client = makeClient([
      { data: null, error: null },
      { data: { id: "user-1", full_name: "Jane" }, error: null },
    ]);
    mockState.client = client;
    mockState.body = { fullName: "Jane" };
    const handler = (await import("../../server/api/user/index.put")).default;

    await handler({});

    expect(client.builders[1].action).toBe("insert");
    expect(client.builders[1].payload).toMatchObject({
      id: "user-1",
      full_name: "Jane",
    });
  });
});
