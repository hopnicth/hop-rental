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
  update(payload: unknown): MockBuilder;
  eq(column: string, value: unknown): MockBuilder;
}

const mockState = vi.hoisted(() => ({
  authUser: { id: "user-1" } as Record<string, unknown> | null,
  parts: [] as MultipartPart[],
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
          update(payload: unknown) {
            this.payload = payload;
            return this;
          },
          eq(column: string, value: unknown) {
            this.filters.push([column, value]);
            return this;
          },
        };
        mockState.builders.push(builder);
        return builder;
      },
    };
  },
}));

function filePart(overrides: Partial<MultipartPart> = {}): MultipartPart {
  return {
    name: "file",
    filename: "id-card.png",
    type: "image/png",
    data: Buffer.from("png"),
    ...overrides,
  };
}

describe("user KYC ID card upload API", () => {
  beforeEach(() => {
    mockState.authUser = { id: "user-1" };
    mockState.parts = [filePart()];
    mockState.serviceRoleCalled = false;
    mockState.storageBucket = "";
    mockState.storageUploads = [];
    mockState.builders = [];
  });

  it("rejects unauthenticated uploads", async () => {
    mockState.authUser = null;
    const handler = (await import("../../server/api/user/kyc/id-card.post"))
      .default;

    await expect(handler({})).rejects.toMatchObject({ statusCode: 401 });
    expect(mockState.serviceRoleCalled).toBe(false);
  });

  it("rejects invalid MIME types", async () => {
    mockState.parts = [filePart({ type: "text/plain" })];
    const handler = (await import("../../server/api/user/kyc/id-card.post"))
      .default;

    await expect(handler({})).rejects.toMatchObject({ statusCode: 415 });
    expect(mockState.serviceRoleCalled).toBe(false);
  });

  it("rejects files larger than 5MB", async () => {
    mockState.parts = [filePart({ data: Buffer.alloc(5 * 1024 * 1024 + 1) })];
    const handler = (await import("../../server/api/user/kyc/id-card.post"))
      .default;

    await expect(handler({})).rejects.toMatchObject({ statusCode: 413 });
    expect(mockState.serviceRoleCalled).toBe(false);
  });

  it("uploads through service role and returns safe private metadata only", async () => {
    const handler = (await import("../../server/api/user/kyc/id-card.post"))
      .default;

    const response = (await handler({})) as { file: Record<string, unknown> };

    expect(mockState.serviceRoleCalled).toBe(true);
    expect(mockState.storageBucket).toBe("kyc-documents");
    expect(mockState.storageUploads[0].path).toMatch(
      /^users\/user-1\/id-card\/.+\.png$/,
    );
    expect(mockState.storageUploads[0].options).toMatchObject({
      contentType: "image/png",
      upsert: false,
    });
    expect(response.file).toMatchObject({
      storageBucket: "kyc-documents",
      mimeType: "image/png",
      fileSize: 3,
    });
    expect(response.file).not.toHaveProperty("publicUrl");
    expect(response.file).not.toHaveProperty("storagePath");
    expect(response.file).not.toHaveProperty("fileName");
  });

  it("updates only the authenticated user's KYC fields", async () => {
    mockState.parts = [
      { name: "userId", data: Buffer.from("user-2") },
      filePart({ type: "application/pdf", filename: "id-card.pdf" }),
    ];
    const handler = (await import("../../server/api/user/kyc/id-card.post"))
      .default;

    await handler({});

    expect(mockState.builders[0].table).toBe("users");
    expect(mockState.builders[0].filters).toEqual([["id", "user-1"]]);
    expect(mockState.builders[0].payload).toMatchObject({
      id_card_url: expect.stringMatching(/^users\/user-1\/id-card\/.+\.pdf$/),
      kyc_status: "pending",
    });
  });
});
