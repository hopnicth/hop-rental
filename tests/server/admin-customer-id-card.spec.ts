/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  adminError: null as Error | null,
  client: null as any,
  parts: [] as any[],
  query: {} as Record<string, unknown>,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: any) => handler,
  readMultipartFormData: async () => mockState.parts,
  getQuery: () => mockState.query,
  createError: (opts: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => {
    if (mockState.adminError) throw mockState.adminError;
    return {
      adminClient: mockState.client,
      userId: "staff-1",
      platformRole: "staff",
    };
  },
}));

const idCardPost = (
  await import("../../server/api/admin/customers/id-card.post")
).default;
const signedUrlGet = (
  await import("../../server/api/admin/customers/id-card/signed-url.get")
).default;

function authError(statusCode: number, statusMessage: string) {
  return Object.assign(new Error(statusMessage), { statusCode, statusMessage });
}

function textPart(name: string, value: string) {
  return { name, data: Buffer.from(value) };
}

function filePart(type = "image/png") {
  return {
    name: "file",
    filename: "id-card.png",
    type,
    data: Buffer.from("fake-image"),
  };
}

function createUploadClient() {
  const uploads: any[] = [];
  const userUpdates: any[] = [];
  const walkInUpserts: any[] = [];
  let getPublicUrlCalled = false;

  return {
    uploads,
    userUpdates,
    walkInUpserts,
    getPublicUrlCalled: () => getPublicUrlCalled,
    client: {
      storage: {
        from: (bucket: string) => ({
          upload: async (path: string, _buffer: Buffer, options: any) => {
            uploads.push({ bucket, path, options });
            return { error: null };
          },
          getPublicUrl: () => {
            getPublicUrlCalled = true;
            return {
              data: { publicUrl: "https://public.example/id-card.png" },
            };
          },
        }),
      },
      from: (table: string) => {
        if (table === "users") {
          return {
            update: (payload: any) => ({
              eq: async (column: string, value: string) => {
                userUpdates.push({ payload, column, value });
                return { error: null };
              },
            }),
          };
        }
        return {
          upsert: async (payload: any, options: any) => {
            walkInUpserts.push({ payload, options });
            return { error: null };
          },
        };
      },
    },
  };
}

function createSignedUrlClient(path: string | null) {
  const signedRequests: any[] = [];
  return {
    signedRequests,
    client: {
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (storagePath: string, ttl: number) => {
            signedRequests.push({ bucket, storagePath, ttl });
            return {
              data: { signedUrl: "https://signed.example/id-card" },
              error: null,
            };
          },
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: path ? { id_card_url: path } : null,
              error: null,
            }),
          }),
        }),
      }),
    },
  };
}

describe("admin customer ID card secure upload", () => {
  beforeEach(() => {
    mockState.adminError = null;
    mockState.client = null;
    mockState.parts = [];
    mockState.query = {};
  });

  it("rejects unauthenticated uploads", async () => {
    mockState.adminError = authError(401, "Authentication required");

    await expect(idCardPost({})).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects non-admin uploads", async () => {
    mockState.adminError = authError(403, "Admin access required");

    await expect(idCardPost({})).rejects.toMatchObject({ statusCode: 403 });
  });

  it("accepts valid admin uploads into private KYC storage only", async () => {
    const upload = createUploadClient();
    mockState.client = upload.client;
    mockState.parts = [
      filePart(),
      textPart("userId", "user-1"),
      textPart("phone", "0812345678"),
      textPart("fullName", "Customer One"),
    ];

    const result = await idCardPost({});

    expect(upload.uploads).toHaveLength(1);
    expect(upload.uploads[0].bucket).toBe("kyc-documents");
    expect(upload.uploads[0].bucket).not.toBe("catalog-media");
    expect(upload.uploads[0].path).toMatch(/^users\/user-1\/id-card\//);
    expect(upload.userUpdates[0].payload).toMatchObject({
      id_card_url: upload.uploads[0].path,
      kyc_status: "pending",
      phone: "0812345678",
      full_name: "Customer One",
    });
    expect(upload.walkInUpserts[0].payload).toMatchObject({
      id_card_url: upload.uploads[0].path,
      id_card_storage_path: upload.uploads[0].path,
    });
    expect(upload.getPublicUrlCalled()).toBe(false);
    expect(result).toMatchObject({
      ok: true,
      hasIdCardDocument: true,
      file: { storageBucket: "kyc-documents", mimeType: "image/png" },
    });
    expect(result).not.toHaveProperty("idCardUrl");
    expect(result).not.toHaveProperty("storagePath");
    expect(JSON.stringify(result)).not.toContain("https://public");
  });
});

describe("admin customer ID card signed URL", () => {
  beforeEach(() => {
    mockState.adminError = null;
    mockState.client = null;
    mockState.parts = [];
    mockState.query = {};
  });

  it("requires an authenticated admin", async () => {
    mockState.adminError = authError(401, "Authentication required");

    await expect(signedUrlGet({})).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects normal users", async () => {
    mockState.adminError = authError(403, "Admin access required");

    await expect(signedUrlGet({})).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns a short-lived signed URL for a private account ID-card path", async () => {
    const signed = createSignedUrlClient("users/user-1/id-card/private.png");
    mockState.client = signed.client;
    mockState.query = { userId: "user-1" };

    const result = await signedUrlGet({});

    expect(signed.signedRequests).toEqual([
      {
        bucket: "kyc-documents",
        storagePath: "users/user-1/id-card/private.png",
        ttl: 60,
      },
    ]);
    expect(result).toEqual({
      signedUrl: "https://signed.example/id-card",
      expiresIn: 60,
    });
  });
});
