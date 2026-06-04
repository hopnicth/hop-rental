/**
 * Integration tests: POST /api/admin/kyc/profiles/:id/documents with REAL h3.
 *
 * Unlike kyc-document-upload-api.spec.ts (which mocks the h3 module), this
 * spec runs the endpoint inside a REAL h3 app on a REAL node:http server and
 * sends REAL multipart bodies over a socket. Only the admin auth guard and the
 * Supabase client are mocked.
 *
 * This is the PROOF for the raw-body handoff design:
 *  1. `readRawBodyWithHardLimit` fully consumes the request socket, then the
 *     capped buffer is handed to h3's `readMultipartFormData` via the
 *     `event.node.req.rawBody` pre-read fallback. The happy-path test fails
 *     (vitest timeout — h3 would wait forever on the consumed socket, so no
 *     response ever arrives) if a future h3 version stops honoring that slot.
 *  2. An explicit source canary asserts the installed h3 still implements the
 *     `event.node.req.rawBody` fallback chain in readRawBody.
 *  3. An over-limit REAL chunked upload (no Content-Length) is stopped by the
 *     hard byte cap BEFORE multipart parsing: the outcome is 413 or a destroyed
 *     socket — never a 400 multipart-validation error, and never any storage/DB
 *     side effect.
 *  4. A REAL >10MB file inside an under-cap multipart body parses through real
 *     h3 and is rejected with a clean 413 (FILE_TOO_LARGE) — proving the parser
 *     works on the capped buffer even for large bodies.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { createServer, request as httpRequest, type Server } from "node:http";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  client: null as any,
}));

// ONLY the auth guard is mocked — h3 is the real module.
vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({
    adminClient: mockState.client,
    userId: "admin-user-1",
    platformRole: "staff",
  }),
}));

const { createApp, createRouter, toNodeListener } = await import("h3");
const handler = (
  await import("../../server/api/admin/kyc/profiles/[id]/documents.post")
).default;
const { KYC_DOCUMENT_MAX_FILE_BYTES, KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES } =
  await import("../../server/utils/kyc-documents");

const PROFILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function jpegBytes(size = 256): Buffer {
  const buf = Buffer.alloc(size);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

// ── Mock Supabase admin client (records side effects) ────────────────────────

function makeClient() {
  const calls = {
    storageUploads: [] as Array<{ bucket: string; path: string; bytes: Buffer }>,
    documentInserts: [] as Array<Record<string, unknown>>,
    logInserts: [] as Array<Record<string, unknown>>,
  };
  const client = {
    from(table: string) {
      if (table === "kyc_profiles") {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({
            data: {
              id: PROFILE_ID,
              customer_type: "individual",
              identity_type: "national_id",
            },
            error: null,
          }),
        };
        return chain;
      }
      if (table === "kyc_documents") {
        let payload: Record<string, unknown> | null = null;
        const chain: any = {
          insert: (p: Record<string, unknown>) => {
            payload = p;
            calls.documentInserts.push(p);
            return chain;
          },
          select: () => chain,
          single: async () => ({
            data: {
              id: "doc-1",
              kyc_profile_id: payload?.kyc_profile_id,
              document_type: payload?.document_type,
              mime_type: payload?.mime_type,
              file_size_bytes: payload?.file_size_bytes,
              uploaded_at: "2026-06-04T00:00:00.000Z",
              created_at: "2026-06-04T00:00:00.000Z",
            },
            error: null,
          }),
        };
        return chain;
      }
      if (table === "kyc_document_access_log") {
        return {
          insert: (p: Record<string, unknown>) => {
            calls.logInserts.push(p);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (path: string, bytes: Buffer) => {
            calls.storageUploads.push({ bucket, path, bytes });
            return { error: null };
          },
          remove: async () => ({ error: null }),
        };
      },
    },
  };
  return { client, calls };
}

// ── Real h3 app + real HTTP server ───────────────────────────────────────────

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = createApp();
  const router = createRouter();
  router.post("/api/admin/kyc/profiles/:id/documents", handler);
  app.use(router);
  server = createServer(toNodeListener(app));
  await new Promise<void>((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("server did not bind to a port");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(
  () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
);

let calls: ReturnType<typeof makeClient>["calls"];

beforeEach(() => {
  const made = makeClient();
  mockState.client = made.client;
  calls = made.calls;
});

function uploadUrl(): string {
  return `${baseUrl}/api/admin/kyc/profiles/${PROFILE_ID}/documents`;
}

// ── Proof tests ──────────────────────────────────────────────────────────────

describe("real h3 raw-body handoff", () => {
  it(
    "REAL multipart body parses after readRawBodyWithHardLimit consumed the socket (handoff works)",
    async () => {
      const fileBytes = jpegBytes(256);
      const fd = new FormData();
      fd.append("file", new Blob([fileBytes], { type: "image/jpeg" }), "doc.jpg");
      fd.append("documentType", "id_card");

      const res = await fetch(uploadUrl(), { method: "POST", body: fd });
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.document.id).toBe("doc-1");
      expect(json.document.mimeType).toBe("image/jpeg");
      expect(json.document.fileSizeBytes).toBe(256);
      // Exact byte round-trip: the REAL h3 parser extracted the file from the
      // capped buffer that our limiter consumed off the socket.
      expect(calls.storageUploads).toHaveLength(1);
      expect(Buffer.from(calls.storageUploads[0]!.bytes).equals(fileBytes)).toBe(
        true,
      );
      // The text field round-tripped through the real parser too.
      expect(calls.documentInserts[0]!.document_type).toBe("id_card");
      // And the response never leaks the storage key or any URL.
      const serialized = JSON.stringify(json);
      expect(serialized).not.toContain(calls.storageUploads[0]!.path);
      expect(serialized).not.toContain("storage");
      expect(serialized).not.toContain("http");
    },
    15_000,
  );

  it("h3 upgrade canary: installed h3 readRawBody still honors the req.rawBody pre-read fallback", () => {
    const h3Source = readFileSync(
      resolve(process.cwd(), "node_modules/h3/dist/index.mjs"),
      "utf8",
    );
    // h3 1.15.x: const _rawBody = event._requestBody || ... || event.node.req.rawBody || ...
    expect(h3Source).toContain("event.node.req.rawBody");
  });

  it(
    "REAL multipart validation through real h3: SVG rejected with 415",
    async () => {
      const fd = new FormData();
      fd.append(
        "file",
        new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], {
          type: "image/svg+xml",
        }),
        "evil.svg",
      );
      fd.append("documentType", "id_card");
      const res = await fetch(uploadUrl(), { method: "POST", body: fd });
      expect(res.status).toBe(415);
      expect(calls.storageUploads).toHaveLength(0);
      expect(calls.documentInserts).toHaveLength(0);
    },
    15_000,
  );

  it(
    "REAL >10MB file inside an under-cap multipart body parses and gets a clean 413 (FILE_TOO_LARGE)",
    async () => {
      // File is 10MB+1 (over the file limit) but the whole multipart body is
      // still under the stream hard cap — so the capped buffer is handed to the
      // REAL parser, which must succeed before the exact file-size check fires.
      const oversize = jpegBytes(KYC_DOCUMENT_MAX_FILE_BYTES + 1);
      const fd = new FormData();
      fd.append("file", new Blob([oversize], { type: "image/jpeg" }), "doc.jpg");
      fd.append("documentType", "id_card");
      const res = await fetch(uploadUrl(), { method: "POST", body: fd });
      expect(res.status).toBe(413);
      expect(calls.storageUploads).toHaveLength(0);
      expect(calls.documentInserts).toHaveLength(0);
    },
    20_000,
  );

  it(
    "over-limit REAL chunked upload (no Content-Length) is stopped by the hard cap BEFORE parsing",
    async () => {
      const boundary = "----vitest-int-boundary";
      const outcome = await new Promise<{ status?: number; error?: Error }>(
        (resolveOutcome) => {
          const req = httpRequest(
            uploadUrl(),
            {
              method: "POST",
              headers: {
                "content-type": `multipart/form-data; boundary=${boundary}`,
                "transfer-encoding": "chunked", // no Content-Length at all
              },
            },
            (res) => {
              res.resume();
              resolveOutcome({ status: res.statusCode });
            },
          );
          req.on("error", (error) => resolveOutcome({ error }));
          // Stream well past the hard cap in 1 MiB chunks of garbage (NOT
          // valid multipart): if parsing ran first, this would be a 400 —
          // a 413 / destroyed socket proves the byte cap fired first.
          const chunk = Buffer.alloc(1024 * 1024);
          const target = KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES + 2 * chunk.length;
          for (let written = 0; written < target; written += chunk.length) {
            req.write(chunk);
          }
          req.end();
        },
      );

      if (outcome.status !== undefined) {
        // Server managed to deliver the error response: must be the byte-cap
        // 413, never a 400 multipart-validation error (parse never ran).
        expect(outcome.status).toBe(413);
      } else {
        // Server destroyed the request socket mid-stream — also a hard stop.
        expect(outcome.error).toBeTruthy();
      }
      expect(calls.storageUploads).toHaveLength(0);
      expect(calls.documentInserts).toHaveLength(0);
      expect(calls.logInserts).toHaveLength(0);
    },
    20_000,
  );
});
