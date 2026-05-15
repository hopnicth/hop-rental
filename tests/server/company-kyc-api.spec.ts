import { beforeEach, describe, expect, it, vi } from "vitest";

type MultipartPart = {
  name?: string;
  filename?: string;
  type?: string;
  data?: Buffer;
};

interface MockBuilder {
  table: string;
  payload: unknown;
  filters: Array<[string, unknown]>;
  selectColumns: string;
  select(columns: string): MockBuilder;
  update(payload: unknown): MockBuilder;
  eq(column: string, value: unknown): MockBuilder;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
}

const mockState = vi.hoisted(() => ({
  authUser: { id: "user-1" } as Record<string, unknown> | null,
  parts: [] as MultipartPart[],
  membership: { id: "member-1", role: "b2b_admin" } as Record<string, unknown> | null,
  company: { id: "company-1", kyc_documents: [] } as Record<string, unknown> | null,
  serviceRoleCalled: false,
  storageBucket: "",
  storageUploads: [] as Array<{
    path: string;
    bytes: number;
    options: Record<string, unknown>;
  }>,
  builders: [] as MockBuilder[],
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readMultipartFormData: async () => mockState.parts,
  createError: (opts: { statusMessage?: string; statusCode?: number }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("#supabase/server", () => ({
  serverSupabaseUser: async () => mockState.authUser,
  serverSupabaseServiceRole: () => {
    mockState.serviceRoleCalled = true;
    return {
      storage: {
        from(bucket: string) {
          mockState.storageBucket = bucket;
          return {
            upload: async (
              path: string,
              buffer: Buffer,
              options: Record<string, unknown>,
            ) => {
              mockState.storageUploads.push({
                path,
                bytes: buffer.byteLength,
                options,
              });
              return { error: null };
            },
          };
        },
      },
      from(table: string) {
        const builder: MockBuilder = {
          table,
          payload: undefined,
          filters: [],
          selectColumns: "",
          select(columns: string) {
            this.selectColumns = columns;
            return this;
          },
          update(payload: unknown) {
            this.payload = payload;
            return this;
          },
          eq(column: string, value: unknown) {
            this.filters.push([column, value]);
            return this;
          },
          async maybeSingle() {
            if (table === "company_members") {
              return { data: mockState.membership, error: null };
            }
            return { data: mockState.company, error: null };
          },
        };
        mockState.builders.push(builder);
        return builder;
      },
    };
  },
}));

function textPart(name: string, value: string): MultipartPart {
  return { name, data: Buffer.from(value) };
}

function filePart(overrides: Partial<MultipartPart> = {}): MultipartPart {
  return {
    name: "file",
    filename: "vat.pdf",
    type: "application/pdf",
    data: Buffer.from("pdf"),
    ...overrides,
  };
}

function validParts(overrides: Partial<MultipartPart> = {}) {
  return [
    textPart("companyId", "company-1"),
    textPart("documentType", "vat"),
    filePart(overrides),
  ];
}

describe("Company KYC document upload API", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.authUser = { id: "user-1" };
    mockState.parts = validParts();
    mockState.membership = { id: "member-1", role: "b2b_admin" };
    mockState.company = { id: "company-1", kyc_documents: [] };
    mockState.serviceRoleCalled = false;
    mockState.storageBucket = "";
    mockState.storageUploads = [];
    mockState.builders = [];
  });

  it("rejects unauthenticated uploads", async () => {
    mockState.authUser = null;
    const handler = (await import("../../server/api/company/kyc/document.post"))
      .default;

    await expect(handler({})).rejects.toMatchObject({ statusCode: 401 });
    expect(mockState.serviceRoleCalled).toBe(false);
  });

  it("rejects non-company members", async () => {
    mockState.membership = null;
    const handler = (await import("../../server/api/company/kyc/document.post"))
      .default;

    await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
    expect(mockState.storageUploads).toHaveLength(0);
  });

  it("rejects company members without admin permission", async () => {
    mockState.membership = { id: "member-1", role: "b2b_user" };
    const handler = (await import("../../server/api/company/kyc/document.post"))
      .default;

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: "Company admin access required",
    });
    expect(mockState.storageUploads).toHaveLength(0);
  });

  it("accepts valid company admin uploads", async () => {
    const handler = (await import("../../server/api/company/kyc/document.post"))
      .default;

    const response = (await handler({})) as { document: Record<string, unknown> };

    expect(mockState.serviceRoleCalled).toBe(true);
    expect(mockState.storageBucket).toBe("kyc-documents");
    expect(mockState.storageUploads[0]).toMatchObject({
      path: "company-kyc/company-1/vat",
      bytes: 3,
      options: { contentType: "application/pdf", upsert: true },
    });
    expect(response.document).toMatchObject({
      name: "vat",
      mimeType: "application/pdf",
      fileSize: 3,
    });
  });

  it("rejects invalid MIME types", async () => {
    mockState.parts = validParts({ type: "text/plain" });
    const handler = (await import("../../server/api/company/kyc/document.post"))
      .default;

    await expect(handler({})).rejects.toMatchObject({ statusCode: 415 });
    expect(mockState.serviceRoleCalled).toBe(false);
  });

  it("rejects files larger than 5MB", async () => {
    mockState.parts = validParts({ data: Buffer.alloc(5 * 1024 * 1024 + 1) });
    const handler = (await import("../../server/api/company/kyc/document.post"))
      .default;

    await expect(handler({})).rejects.toMatchObject({ statusCode: 413 });
    expect(mockState.serviceRoleCalled).toBe(false);
  });

  it("does not return public URLs or private storage paths", async () => {
    const handler = (await import("../../server/api/company/kyc/document.post"))
      .default;

    const response = (await handler({})) as {
      document: Record<string, unknown>;
      file: Record<string, unknown>;
    };

    expect(response.document).not.toHaveProperty("publicUrl");
    expect(response.document).not.toHaveProperty("storagePath");
    expect(response.document).not.toHaveProperty("url");
    expect(response.file).not.toHaveProperty("publicUrl");
    expect(response.file).not.toHaveProperty("storagePath");
  });
});