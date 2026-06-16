/**
 * Tests: server/utils/sale-order-payment-slip-evidence.ts
 *
 * Covers (parallel to the rental deposit-slip util):
 *  1. MIME sniff (JPEG/PNG/PDF accepted; SVG/text/truncated/empty rejected)
 *  2. extension mapping fail-closed
 *  3. storage key shape (private, order-scoped, random)
 *  4. asUuidOrNull strictness
 *  5. filename sanitization (path strip, control chars, fallback, length cap)
 *  6. safe mapper/SELECT never expose storage path/bucket/URL
 *  7. upload: invalid MIME (415), oversize (413), empty (422), bad order id (400)
 *     rejected; happy path uploads to the PRIVATE bucket, status pending_review,
 *     no public URL; never marks order paid
 *  8. signed URL returns/throws correctly
 */
import { describe, it, expect, vi } from "vitest";
import {
  SALE_ORDER_PAYMENT_SLIP_BUCKET,
  SALE_ORDER_PAYMENT_SLIP_MAX_FILE_BYTES,
  SALE_ORDER_PAYMENT_SLIP_SAFE_SELECT,
  asUuidOrNull,
  buildSaleOrderPaymentSlipStorageKey,
  createSaleOrderPaymentSlipSignedUrl,
  saleOrderPaymentSlipExtensionForMime,
  sanitizeSaleOrderPaymentSlipFilename,
  sniffSaleOrderPaymentSlipMime,
  toSafeSaleOrderPaymentSlip,
  uploadSaleOrderPaymentSlipEvidence,
  type SaleOrderPaymentSlipClient,
} from "../../server/utils/sale-order-payment-slip-evidence";

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

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
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
    uploadContentType: undefined as string | undefined,
    insertTable: null as string | null,
    insertPayload: null as Record<string, unknown> | null,
    signedBucket: null as string | null,
    signedTtl: null as number | null,
  };
  const client: SaleOrderPaymentSlipClient = {
    storage: {
      from(bucket: string) {
        return {
          async upload(
            _path: string,
            _body: Buffer | Uint8Array,
            options?: { contentType?: string; upsert?: boolean },
          ) {
            calls.uploadBucket = bucket;
            calls.uploadContentType = options?.contentType;
            calls.uploadUpsert = options?.upsert;
            return { error: opts.uploadError ?? null };
          },
          async createSignedUrl(_path: string, expiresIn: number) {
            calls.signedBucket = bucket;
            calls.signedTtl = expiresIn;
            if (opts.signedUrlError) return { data: null, error: opts.signedUrlError };
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
                  if (opts.insertError) return { data: null, error: opts.insertError };
                  return {
                    data: {
                      id: "slip-1",
                      order_id: payload.order_id,
                      original_filename: payload.original_filename,
                      mime_type: payload.mime_type,
                      file_size_bytes: payload.file_size_bytes,
                      status: payload.status,
                      uploaded_at: "2026-06-17T00:00:00.000Z",
                      reviewed_at: null,
                      review_note: null,
                    } as Record<string, unknown>,
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

describe("sniffSaleOrderPaymentSlipMime", () => {
  it("accepts JPEG/PNG/PDF", () => {
    expect(sniffSaleOrderPaymentSlipMime(jpegBytes())).toBe("image/jpeg");
    expect(sniffSaleOrderPaymentSlipMime(pngBytes())).toBe("image/png");
    expect(sniffSaleOrderPaymentSlipMime(pdfBytes())).toBe("application/pdf");
  });
  it("rejects svg/text/truncated/empty", () => {
    expect(sniffSaleOrderPaymentSlipMime(Buffer.from("<svg/>"))).toBeNull();
    expect(sniffSaleOrderPaymentSlipMime(Buffer.from("hi"))).toBeNull();
    expect(sniffSaleOrderPaymentSlipMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffSaleOrderPaymentSlipMime(Buffer.alloc(0))).toBeNull();
  });
});

describe("saleOrderPaymentSlipExtensionForMime", () => {
  it("maps + fails closed", () => {
    expect(saleOrderPaymentSlipExtensionForMime("image/png")).toBe("png");
    expect(saleOrderPaymentSlipExtensionForMime("image/gif")).toBeNull();
    expect(saleOrderPaymentSlipExtensionForMime(null)).toBeNull();
  });
});

describe("buildSaleOrderPaymentSlipStorageKey", () => {
  const RE =
    /^order-payment-slips\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|pdf)$/;
  it("private order-scoped random key", () => {
    expect(buildSaleOrderPaymentSlipStorageKey(ORDER_ID, "image/jpeg")).toMatch(RE);
    expect(
      buildSaleOrderPaymentSlipStorageKey(ORDER_ID, "application/pdf"),
    ).toContain(`order-payment-slips/${ORDER_ID}/`);
  });
  it("random per call", () => {
    const a = buildSaleOrderPaymentSlipStorageKey(ORDER_ID, "image/png");
    const b = buildSaleOrderPaymentSlipStorageKey(ORDER_ID, "image/png");
    expect(a).not.toBe(b);
  });
});

describe("asUuidOrNull", () => {
  it("accepts uuid, rejects junk", () => {
    expect(asUuidOrNull(ORDER_ID.toUpperCase())).toBe(ORDER_ID);
    expect(asUuidOrNull("nope")).toBeNull();
    expect(asUuidOrNull(null)).toBeNull();
  });
});

describe("sanitizeSaleOrderPaymentSlipFilename", () => {
  it("strips directories", () => {
    expect(sanitizeSaleOrderPaymentSlipFilename("../../x/slip.png")).toBe(
      "slip.png",
    );
  });
  it("strips control chars", () => {
    expect(
      sanitizeSaleOrderPaymentSlipFilename(
        "a" + String.fromCharCode(0) + "b" + String.fromCharCode(31) + "c.jpg",
      ),
    ).toBe("abc.jpg");
  });
  it("fallback + length cap", () => {
    expect(sanitizeSaleOrderPaymentSlipFilename("")).toBe("slip");
    expect(sanitizeSaleOrderPaymentSlipFilename(null)).toBe("slip");
    expect(
      sanitizeSaleOrderPaymentSlipFilename("x".repeat(500)).length,
    ).toBeLessThanOrEqual(200);
  });
});

describe("toSafeSaleOrderPaymentSlip + SAFE_SELECT", () => {
  it("never exposes storage path/bucket/URL", () => {
    expect(SALE_ORDER_PAYMENT_SLIP_SAFE_SELECT).not.toContain("storage_path");
    expect(SALE_ORDER_PAYMENT_SLIP_SAFE_SELECT).not.toContain("storage_bucket");
    const serialized = JSON.stringify(
      toSafeSaleOrderPaymentSlip({
        id: "s1",
        order_id: ORDER_ID,
        original_filename: "slip.jpg",
        mime_type: "image/jpeg",
        file_size_bytes: 10,
        status: "pending_review",
        uploaded_at: "2026-06-17T00:00:00.000Z",
        reviewed_at: null,
        review_note: null,
        storage_path: "order-payment-slips/x/secret.jpg",
        storage_bucket: SALE_ORDER_PAYMENT_SLIP_BUCKET,
        signed_url: "https://example.com/s",
      }),
    );
    expect(serialized).not.toContain("storage_path");
    expect(serialized).not.toContain("secret.jpg");
    expect(serialized).not.toContain("http");
  });
});

describe("uploadSaleOrderPaymentSlipEvidence", () => {
  const base = {
    orderId: ORDER_ID,
    uploadedBy: USER_ID,
    fileBytes: jpegBytes(),
    originalFilename: "slip.jpg",
  };
  it("rejects unsupported MIME (415), no insert", async () => {
    const { client, calls } = mockClient();
    await expect(
      uploadSaleOrderPaymentSlipEvidence(client, {
        ...base,
        fileBytes: Buffer.from("<svg/>"),
      }),
    ).rejects.toMatchObject({ statusCode: 415 });
    expect(calls.insertPayload).toBeNull();
  });
  it("rejects oversize (413)", async () => {
    const { client } = mockClient();
    await expect(
      uploadSaleOrderPaymentSlipEvidence(client, {
        ...base,
        fileBytes: jpegBytes(SALE_ORDER_PAYMENT_SLIP_MAX_FILE_BYTES + 1),
      }),
    ).rejects.toMatchObject({ statusCode: 413 });
  });
  it("rejects empty (422)", async () => {
    const { client } = mockClient();
    await expect(
      uploadSaleOrderPaymentSlipEvidence(client, {
        ...base,
        fileBytes: Buffer.alloc(0),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
  it("rejects invalid order id (400)", async () => {
    const { client } = mockClient();
    await expect(
      uploadSaleOrderPaymentSlipEvidence(client, { ...base, orderId: "x" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("uploads to PRIVATE bucket, status pending_review, no public URL", async () => {
    const { client, calls } = mockClient();
    const result = await uploadSaleOrderPaymentSlipEvidence(client, base);
    expect(calls.uploadBucket).toBe(SALE_ORDER_PAYMENT_SLIP_BUCKET);
    expect(calls.uploadUpsert).toBe(false);
    expect(calls.insertTable).toBe("sale_order_payment_slips");
    expect(calls.insertPayload?.status).toBe("pending_review");
    expect(result.status).toBe("pending_review");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("http");
    expect(serialized).not.toContain("storage_path");
    expect(serialized).not.toContain("order-payment-slips/");
  });
});

describe("createSaleOrderPaymentSlipSignedUrl", () => {
  it("returns signed url", async () => {
    const { client, calls } = mockClient({ signedUrl: "https://local/s?t=1" });
    const url = await createSaleOrderPaymentSlipSignedUrl(client, "x/y.jpg", 60);
    expect(url).toBe("https://local/s?t=1");
    expect(calls.signedBucket).toBe(SALE_ORDER_PAYMENT_SLIP_BUCKET);
    expect(calls.signedTtl).toBe(60);
  });
  it("throws 500 on failure", async () => {
    const { client } = mockClient({ signedUrlError: { message: "no" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      createSaleOrderPaymentSlipSignedUrl(client, "x/y.jpg"),
    ).rejects.toMatchObject({ statusCode: 500 });
    spy.mockRestore();
  });
});
