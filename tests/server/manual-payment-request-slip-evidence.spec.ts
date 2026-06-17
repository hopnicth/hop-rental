/**
 * Tests: server/utils/manual-payment-request-slip-evidence.ts
 *
 * Covers:
 *  1. MIME sniff (JPEG/PNG/PDF accepted; SVG/text/truncated/empty rejected)
 *  2. storage key shape (private, request-scoped, random)
 *  3. asUuidOrNull strictness
 *  4. filename sanitization (path strip, control chars, fallback, length cap)
 *  5. safe mapper/SELECT never expose storage path/bucket/URL
 *  6. upload: invalid MIME (415), oversize (413), empty (422), bad id (400);
 *     happy path uploads to the PRIVATE bucket, status pending_review, sha256
 *     recorded, no public URL
 *  7. signed URL returns/throws correctly
 */
import { describe, it, expect, vi } from "vitest";
import {
  MANUAL_PAYMENT_SLIP_BUCKET,
  MANUAL_PAYMENT_SLIP_MAX_FILE_BYTES,
  MANUAL_PAYMENT_SLIP_SAFE_SELECT,
  asUuidOrNull,
  buildManualPaymentSlipStorageKey,
  createManualPaymentSlipSignedUrl,
  sanitizeManualPaymentSlipFilename,
  sniffManualPaymentSlipMime,
  toSafeManualPaymentSlip,
  uploadManualPaymentRequestSlipEvidence,
  type ManualPaymentSlipClient,
} from "../../server/utils/manual-payment-request-slip-evidence";

function jpegBytes(size = 64): Buffer {
  const buf = Buffer.alloc(size);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
function pngBytes(size = 64): Buffer {
  const buf = Buffer.alloc(size);
  PNG_SIGNATURE.forEach((b, i) => {
    buf[i] = b;
  });
  return buf;
}
function pdfBytes(size = 64): Buffer {
  const buf = Buffer.alloc(size);
  Buffer.from("%PDF-1.7").copy(buf);
  return buf;
}

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function mockClient(
  opts: {
    uploadError?: { message: string } | null;
    insertError?: { message: string } | null;
    signedUrl?: string | null;
    signedUrlError?: { message: string } | null;
  } = {},
) {
  const calls = {
    uploadBucket: null as string | null,
    uploadUpsert: undefined as boolean | undefined,
    insertTable: null as string | null,
    insertPayload: null as Record<string, unknown> | null,
    signedBucket: null as string | null,
    signedTtl: null as number | null,
  };
  const client: ManualPaymentSlipClient = {
    storage: {
      from(bucket: string) {
        return {
          async upload(
            _path: string,
            _body: Buffer | Uint8Array,
            options?: { contentType?: string; upsert?: boolean },
          ) {
            calls.uploadBucket = bucket;
            calls.uploadUpsert = options?.upsert;
            return { error: opts.uploadError ?? null };
          },
          async createSignedUrl(_path: string, expiresIn: number) {
            calls.signedBucket = bucket;
            calls.signedTtl = expiresIn;
            if (opts.signedUrlError)
              return { data: null, error: opts.signedUrlError };
            return {
              data: opts.signedUrl ? { signedUrl: opts.signedUrl } : null,
              error: null,
            };
          },
        };
      },
    },
    from(table: string) {
      calls.insertTable = table;
      return {
        insert(payload: Record<string, unknown>) {
          calls.insertPayload = payload;
          return {
            select(_columns: string) {
              return {
                async single() {
                  if (opts.insertError)
                    return { data: null, error: opts.insertError };
                  return {
                    data: {
                      id: "slip-1",
                      payment_request_id: payload.payment_request_id,
                      original_filename: payload.original_filename,
                      mime_type: payload.mime_type,
                      file_size_bytes: payload.file_size_bytes,
                      status: payload.status,
                      uploaded_at: "2026-06-18T00:00:00.000Z",
                      reviewed_at: null,
                      rejected_at: null,
                      rejected_reason: null,
                    } as Record<string, unknown>,
                    error: null,
                  };
                },
              };
            },
          };
        },
      } as never;
    },
  };
  return { client, calls };
}

describe("sniffManualPaymentSlipMime", () => {
  it("accepts JPEG/PNG/PDF", () => {
    expect(sniffManualPaymentSlipMime(jpegBytes())).toBe("image/jpeg");
    expect(sniffManualPaymentSlipMime(pngBytes())).toBe("image/png");
    expect(sniffManualPaymentSlipMime(pdfBytes())).toBe("application/pdf");
  });
  it("rejects svg/text/truncated/empty", () => {
    expect(sniffManualPaymentSlipMime(Buffer.from("<svg/>"))).toBeNull();
    expect(sniffManualPaymentSlipMime(Buffer.from("hi"))).toBeNull();
    expect(sniffManualPaymentSlipMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffManualPaymentSlipMime(Buffer.alloc(0))).toBeNull();
  });
});

describe("buildManualPaymentSlipStorageKey", () => {
  const RE =
    /^payment-request-slips\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|pdf)$/;
  it("private request-scoped random key", () => {
    expect(buildManualPaymentSlipStorageKey(REQUEST_ID, "image/jpeg")).toMatch(
      RE,
    );
  });
  it("random per call", () => {
    const a = buildManualPaymentSlipStorageKey(REQUEST_ID, "image/png");
    const b = buildManualPaymentSlipStorageKey(REQUEST_ID, "image/png");
    expect(a).not.toBe(b);
  });
});

describe("asUuidOrNull", () => {
  it("accepts uuid, rejects junk", () => {
    expect(asUuidOrNull(REQUEST_ID.toUpperCase())).toBe(REQUEST_ID);
    expect(asUuidOrNull("nope")).toBeNull();
    expect(asUuidOrNull(null)).toBeNull();
  });
});

describe("sanitizeManualPaymentSlipFilename", () => {
  it("strips directories, control chars, fallback + cap", () => {
    expect(sanitizeManualPaymentSlipFilename("../../x/slip.png")).toBe(
      "slip.png",
    );
    expect(sanitizeManualPaymentSlipFilename("")).toBe("slip");
    expect(sanitizeManualPaymentSlipFilename(null)).toBe("slip");
    expect(
      sanitizeManualPaymentSlipFilename("x".repeat(500)).length,
    ).toBeLessThanOrEqual(200);
  });
});

describe("toSafeManualPaymentSlip + SAFE_SELECT", () => {
  it("never exposes storage path/bucket/URL", () => {
    expect(MANUAL_PAYMENT_SLIP_SAFE_SELECT).not.toContain("storage_path");
    expect(MANUAL_PAYMENT_SLIP_SAFE_SELECT).not.toContain("storage_bucket");
    const serialized = JSON.stringify(
      toSafeManualPaymentSlip({
        id: "s1",
        payment_request_id: REQUEST_ID,
        original_filename: "slip.jpg",
        mime_type: "image/jpeg",
        file_size_bytes: 10,
        status: "pending_review",
        uploaded_at: "2026-06-18T00:00:00.000Z",
        storage_path: "payment-request-slips/x/secret.jpg",
        storage_bucket: MANUAL_PAYMENT_SLIP_BUCKET,
        signed_url: "https://example.com/s",
      }),
    );
    expect(serialized).not.toContain("storage_path");
    expect(serialized).not.toContain("secret.jpg");
    expect(serialized).not.toContain("http");
  });
});

describe("uploadManualPaymentRequestSlipEvidence", () => {
  const base = {
    paymentRequestId: REQUEST_ID,
    uploadedBy: USER_ID,
    fileBytes: jpegBytes(),
    originalFilename: "slip.jpg",
  };
  it("rejects unsupported MIME (415), no insert", async () => {
    const { client, calls } = mockClient();
    await expect(
      uploadManualPaymentRequestSlipEvidence(client, {
        ...base,
        fileBytes: Buffer.from("<svg/>"),
      }),
    ).rejects.toMatchObject({ statusCode: 415 });
    expect(calls.insertPayload).toBeNull();
  });
  it("rejects oversize (413)", async () => {
    const { client } = mockClient();
    await expect(
      uploadManualPaymentRequestSlipEvidence(client, {
        ...base,
        fileBytes: jpegBytes(MANUAL_PAYMENT_SLIP_MAX_FILE_BYTES + 1),
      }),
    ).rejects.toMatchObject({ statusCode: 413 });
  });
  it("rejects empty (422)", async () => {
    const { client } = mockClient();
    await expect(
      uploadManualPaymentRequestSlipEvidence(client, {
        ...base,
        fileBytes: Buffer.alloc(0),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
  it("rejects invalid request id (400)", async () => {
    const { client } = mockClient();
    await expect(
      uploadManualPaymentRequestSlipEvidence(client, {
        ...base,
        paymentRequestId: "x",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("uploads to PRIVATE bucket, status pending_review, sha256, no public URL", async () => {
    const { client, calls } = mockClient();
    const result = await uploadManualPaymentRequestSlipEvidence(client, base);
    expect(calls.uploadBucket).toBe(MANUAL_PAYMENT_SLIP_BUCKET);
    expect(calls.uploadUpsert).toBe(false);
    expect(calls.insertTable).toBe("manual_payment_request_slips");
    expect(calls.insertPayload?.status).toBe("pending_review");
    expect(typeof calls.insertPayload?.sha256_hash).toBe("string");
    expect(result.status).toBe("pending_review");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("http");
    expect(serialized).not.toContain("payment-request-slips/");
  });
});

describe("createManualPaymentSlipSignedUrl", () => {
  it("returns signed url", async () => {
    const { client, calls } = mockClient({ signedUrl: "https://local/s?t=1" });
    const url = await createManualPaymentSlipSignedUrl(client, "x/y.jpg", 60);
    expect(url).toBe("https://local/s?t=1");
    expect(calls.signedBucket).toBe(MANUAL_PAYMENT_SLIP_BUCKET);
    expect(calls.signedTtl).toBe(60);
  });
  it("throws 500 on failure", async () => {
    const { client } = mockClient({ signedUrlError: { message: "no" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      createManualPaymentSlipSignedUrl(client, "x/y.jpg"),
    ).rejects.toMatchObject({ statusCode: 500 });
    spy.mockRestore();
  });
});
