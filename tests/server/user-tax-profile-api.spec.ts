import { beforeEach, describe, expect, it, vi } from "vitest";

type MockAuthUser = { id: string } | null;
type BuilderResult = {
  data?: unknown;
  error?: { message: string; code?: string } | null;
};

type Builder = {
  table: string;
  action: string;
  payload: unknown;
  selectColumns: string;
  filters: Array<[string, unknown]>;
  orders: Array<[string, Record<string, unknown>]>;
  limitValue: number;
  from: string;
  select(columns: string): Builder;
  update(payload: unknown): Builder;
  insert(payload: unknown): Promise<BuilderResult>;
  eq(column: string, value: unknown): Builder;
  order(column: string, options: Record<string, unknown>): Builder;
  limit(value: number): Promise<BuilderResult>;
  maybeSingle(): Promise<BuilderResult>;
  single(): Promise<BuilderResult>;
  then(
    resolve: (value: BuilderResult) => unknown,
    reject?: (reason: unknown) => unknown,
  ): Promise<unknown>;
};

type MockClient = {
  builders: Builder[];
  from(table: string): Builder;
};

const mockState = vi.hoisted(() => ({
  authUser: { id: "user-1" } as MockAuthUser,
  body: {} as Record<string, unknown>,
  client: null as MockClient | null,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: async () => mockState.body,
  createError: (opts: { statusMessage: string; statusCode?: number }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("#supabase/server", () => ({
  serverSupabaseUser: async () => mockState.authUser,
  serverSupabaseServiceRole: () => mockState.client,
}));

function makeBuilder(table: string, result: BuilderResult) {
  const builder: Builder = {
    table,
    action: "",
    payload: undefined as unknown,
    selectColumns: "",
    filters: [] as Array<[string, unknown]>,
    orders: [] as Array<[string, Record<string, unknown>]>,
    limitValue: 0,
    from: table,
    select(columns: string) {
      this.action = "select";
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
      return Promise.resolve(result);
    },
    eq(column: string, value: unknown) {
      this.filters.push([column, value]);
      return this;
    },
    order(column: string, options: Record<string, unknown>) {
      this.orders.push([column, options]);
      return this;
    },
    limit(value: number) {
      this.limitValue = value;
      return Promise.resolve(result);
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
    single() {
      return Promise.resolve(result);
    },
    then(
      resolve: (value: BuilderResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

function makeClient(results: BuilderResult[]) {
  const builders: Array<ReturnType<typeof makeBuilder>> = [];
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

const savedRow = {
  id: "tax-1",
  customer_kind: "person",
  legal_name: "Jane Doe",
  tax_id: "1234567890123",
  tax_id_normalized: "1234567890123",
  branch_type: "none",
  branch_code: "",
  billing_address: "Bangkok",
  phone: "0812345678",
  email: "jane@example.com",
  review_status: "draft",
  reviewed_at: null,
  rejection_reason: "",
  is_default: true,
  created_at: "2026-05-11T00:00:00.000Z",
  updated_at: "2026-05-11T00:00:00.000Z",
};

describe("user tax profile API", () => {
  beforeEach(() => {
    mockState.authUser = { id: "user-1" };
    mockState.body = {};
    mockState.client = null;
  });

  it("GET returns only the current user's default profile", async () => {
    const client = makeClient([{ data: [savedRow], error: null }]);
    mockState.client = client;
    const handler = (
      await import("../../server/api/user/tax-profile/index.get")
    ).default;

    const response = await handler({});

    expect(response.profile).toMatchObject({ id: "tax-1", isDefault: true });
    expect(client.builders[0].table).toBe("customer_tax_profiles");
    expect(client.builders[0].filters).toEqual([
      ["customer_user_id", "user-1"],
      ["is_default", true],
    ]);
    expect(client.builders[0].limitValue).toBe(1);
  });

  it("PUT inserts only the current user's default profile and ignores foreign owner input", async () => {
    const client = makeClient([
      { data: null, error: null },
      { data: null, error: null },
      { data: savedRow, error: null },
    ]);
    mockState.client = client;
    mockState.body = {
      id: "tax-other",
      customer_user_id: "user-2",
      customerKind: "person",
      legalName: "Jane Doe",
      taxId: "123-456-789-0123",
      branchType: "branch",
      branchCode: "999",
      billingAddress: "Bangkok",
      phone: "0812345678",
      email: "jane@example.com",
    };
    const handler = (
      await import("../../server/api/user/tax-profile/index.put")
    ).default;

    await handler({});

    expect(client.builders[0].filters).toEqual([
      ["customer_user_id", "user-1"],
      ["is_default", true],
    ]);
    expect(client.builders[1].action).toBe("insert");
    expect(client.builders[1].payload).toMatchObject({
      customer_user_id: "user-1",
      walk_in_phone: null,
      company_id: null,
      branch_type: "none",
      branch_code: "",
      review_status: "draft",
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: "",
      is_default: true,
      created_by: "user-1",
      updated_by: "user-1",
    });
    expect(client.builders[1].payload).not.toHaveProperty("id");
  });

  it("PUT updates only the current user's existing default profile and resets review state", async () => {
    const client = makeClient([
      { data: { id: "tax-existing" }, error: null },
      { data: null, error: null },
      { data: savedRow, error: null },
    ]);
    mockState.client = client;
    mockState.body = {
      customerKind: "company",
      legalName: "Hopnic Co., Ltd.",
      taxId: "0105555123456",
      branchType: "head_office",
      branchCode: "",
      billingAddress: "Bangkok",
      phone: "02-000-0000",
      email: "tax@hopnic.test",
    };
    const handler = (
      await import("../../server/api/user/tax-profile/index.put")
    ).default;

    await handler({});

    expect(client.builders[1].action).toBe("update");
    expect(client.builders[1].filters).toEqual([
      ["id", "tax-existing"],
      ["customer_user_id", "user-1"],
      ["is_default", true],
    ]);
    expect(client.builders[1].payload).toMatchObject({
      customer_user_id: "user-1",
      customer_kind: "company",
      branch_type: "head_office",
      review_status: "draft",
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: "",
      is_default: true,
      updated_by: "user-1",
    });
  });
});
