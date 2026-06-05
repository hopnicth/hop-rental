/**
 * Integration tests: GET /api/admin/kyc/documents/:id/download with REAL h3.
 *
 * Unlike kyc-document-download-api.spec.ts (which mocks the h3 module), this
 * spec runs the endpoint inside a REAL h3 app on a REAL node:http server.
 * Only the admin auth guard and the Supabase client are mocked.
 *
 * Proof targets (docs/kyc-phase-2-download-spec.md §5):
 *  1. The blob.stream() return path streams EXACT bytes over a real socket
 *     through the installed h3 version (canary: an h3 upgrade that breaks
 *     ReadableStream returns fails this loudly).
 *  2. Wire-level headers: Cache-Control no-store, allowlisted Content-Type,
 *     nosniff, attachment with the opaque filename — and NO Content-Length
 *     (streamed/chunked delivery, Decision D impact 1).
 *  3. No storage path / bucket / URL appears in any response header.
 *  4. Real staff request → uniform 403 over the wire for uuid-shaped AND
 *     malformed ids (same status + statusMessage), with zero kyc_documents /
 *     storage side effects.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  client: null as any,
  platformRole: "super_admin" as string,
}));

// ONLY the auth guard is mocked — h3 is the real module.
vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({
    adminClient: mockState.client,
    userId: "admin-user-1",
    platformRole: mockState.platformRole,
  }),
}));

const { createApp, createRouter, toNodeListener } = await import("h3");
const handler = (
  await import("../../server/api/admin/kyc/documents/[id]/download.get")
).default;

const DOC_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROFILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SAFE_PATH = "kyc/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg";
// Deterministic pseudo-random bytes — integrity is byte-for-byte verifiable.
const FILE_BYTES = Buffer.alloc(64 * 1024 + 17).map((_, i) => (i * 31 + 7) % 256);

function makeClient() {
  const calls = {
    documentQueries: 0,
    storageDownloads: [] as string[],
    logInserts: [] as Array<Record<string, unknown>>,
  };
  const client = {
    from(table: string) {
      if (table === "kyc_documents") {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => {
            calls.documentQueries += 1;
            return {
              data: {
                id: DOC_ID,
                kyc_profile_id: PROFILE_ID,
                document_type: "id_card",
                mime_type: "image/jpeg",
                file_size_bytes: FILE_BYTES.byteLength,
                storage_path: SAFE_PATH,
              },
              error: null,
            };
          },
        };
        return chain;
      }
      if (table === "kyc_document_access_log") {
        return {
          insert: (payload: Record<string, unknown>) => {
            calls.logInserts.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    storage: {
      from() {
        return {
          download: async (path: string) => {
            calls.storageDownloads.push(path);
            return { data: new Blob([FILE_BYTES]), error: null };
          },
        };
      },
    },
  };
  return { client, calls };
}

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = createApp();
  const router = createRouter();
  router.get("/api/admin/kyc/documents/:id/download", handler);
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
  mockState.platformRole = "super_admin";
  calls = made.calls;
});

function downloadUrl(id: string): string {
  return `${baseUrl}/api/admin/kyc/documents/${encodeURIComponent(id)}/download`;
}

describe("real h3 proxy download", () => {
  it(
    "streams exact bytes over the wire with the safe header set and NO Content-Length",
    async () => {
      const res = await fetch(downloadUrl(DOC_ID));
      expect(res.status).toBe(200);
      const body = Buffer.from(await res.arrayBuffer());
      expect(body.byteLength).toBe(FILE_BYTES.byteLength);
      expect(body.equals(FILE_BYTES)).toBe(true);

      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-disposition")).toBe(
        `attachment; filename="kyc-${DOC_ID}.jpg"`,
      );
      // Streamed delivery: the handler never sets Content-Length and the
      // platform must not be able to derive one from a stream.
      expect(res.headers.get("content-length")).toBeNull();

      // No storage path / bucket / URL in ANY response header.
      const allHeaders = JSON.stringify(Object.fromEntries(res.headers));
      expect(allHeaders).not.toContain(SAFE_PATH);
      expect(allHeaders).not.toContain("kyc-profile-documents");
      expect(allHeaders).not.toContain("signedUrl");

      // Fail-closed allowed row was written; fetch happened once.
      expect(calls.logInserts.some((l) => l.result === "allowed")).toBe(true);
      expect(calls.storageDownloads).toEqual([SAFE_PATH]);
    },
    15_000,
  );

  it(
    "real staff request gets a uniform 403 for uuid-shaped AND malformed ids with zero row/storage access",
    async () => {
      mockState.platformRole = "staff";

      const shaped = await fetch(downloadUrl(DOC_ID));
      const malformed = await fetch(downloadUrl("not-a-uuid"));
      expect(shaped.status).toBe(403);
      expect(malformed.status).toBe(403);

      // Same statusMessage over the wire — no existence/validity oracle.
      const shapedBody = (await shaped.json()) as any;
      const malformedBody = (await malformed.json()) as any;
      expect(shapedBody.statusMessage).toBe("Super admin access required");
      expect(malformedBody.statusMessage).toBe(shapedBody.statusMessage);

      expect(calls.documentQueries).toBe(0);
      expect(calls.storageDownloads).toHaveLength(0);
      // Both denials logged best-effort with Decision G vocabulary.
      expect(calls.logInserts.map((l) => l.reason)).toEqual([
        "not_super_admin",
        "not_super_admin_malformed_id",
      ]);
      expect(calls.logInserts[1]!.document_id).toBeNull();
    },
    15_000,
  );
});
