/**
 * Tests: server/utils/rental-deposit-slip-evidence.ts
 *
 * Covers:
 *  1. sniffRentalDepositSlipMime — JPEG/PNG/PDF magic accepted; SVG/text/empty/
 *     truncated rejected; client-declared MIME never trusted
 *  2. rentalDepositSlipExtensionForMime — allowlist mapping, fail-closed
 *  3. buildRentalDepositSlipStorageKey — private path shape, embeds bookingId,
 *     random per call, extension follows MIME
 *  4. asUuidOrNull — strict uuid classification
 *  5. sanitizeRentalDepositSlipFilename — strips directories/control chars,
 *     fallback, length cap; never used to build the path
 *  6. toSafeRentalDepositSlip + RENTAL_DEPOSIT_SLIP_SAFE_SELECT — never expose
 *     storage_path / storage_bucket / any URL
 *  7. uploadRentalDepositSlipEvidence — invalid MIME (415), oversize (413),
 *     empty (422), bad booking id (400) rejected; happy path uploads to the
 *     PRIVATE bucket, inserts status 'pending_review', returns metadata with NO
 *     public URL / storage path; never confirms / mutates money
 *  8. createRentalDepositSlipSignedUrl — returns signed URL; throws on failure
 */
import { describe, it, expect, vi } from "vitest";
import {
  RENTAL_DEPOSIT_SLIP_BUCKET,
  RENTAL_DEPOSIT_SLIP_MAX_FILE_BYTES,
  RENTAL_DEPOSIT_SLIP_SAFE_SELECT,
  asUuidOrNull,
  buildRentalDepositSlipStorageKey,
  createRentalDepositSlipSignedUrl,
  rentalDepositSlipExtensionForMime,
  sanitizeRentalDepositSlipFilename,
  sniffRentalDepositSlipMime,
  toSafeRentalDepositSlip,
  uploadRentalDepositSlipEvidence,
  type RentalDepositSlipClient,
} from "../../server/utils/rental-deposit-slip-evidence";

// ── byte helpers ──────────────────────────────────────────────────────────────

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

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

// ── mock client ────────────────────────────────────────────────────────────────

function mockClient(
  opts: {
    uploadError?: { message: string } | null;
    insertError?: { message: string } | null;
    insertedRow?: Record<string, unknown> | null;
    signedUrl?: string | null;
    signedUrlError?: { message: string } | null;
  } = {},
) {
  const calls = {
    uploadBucket: null as string | null,
    uploadPath: null as string | null,
    uploadContentType: undefined as string | undefined,
    uploadUpsert: undefined as boolean | undefined,
    insertTable: null as string | null,
    insertPayload: null as Record<string, unknown> | null,
    selectColumns: null as string | null,
    signedBucket: null as string | null,
    signedPath: null as string | null,
    signedTtl: null as number | null,
  };
  const client: RentalDepositSlipClient = {
    storage: {
      from(bucket: string) {
        return {
          async upload(
            path: string,
            _body: Buffer | Uint8Array,
            options?: { contentType?: string; upsert?: boolean },
          ) {
            calls.uploadBucket = bucket;
            calls.uploadPath = path;
            calls.uploadContentType = options?.contentType;
            calls.uploadUpsert = options?.upsert;
            return { error: opts.uploadError ?? null };
          },
          async createSignedUrl(path: string, expiresIn: number) {
            calls.signedBucket = bucket;
            calls.signedPath = path;
            calls.signedTtl = expiresIn;
            if (opts.signedUrlError) {
              return { data: null, error: opts.signedUrlError };
            }
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
            select(columns: string) {
              calls.selectColumns = columns;
              return {
                async single() {
                  if (opts.insertError) {
                    return { data: null, error: opts.insertError };
                  }
                  const row =
                    opts.insertedRow ??
                    ({
                      id: "slip-1",
                      rental_booking_id: payload.rental_booking_id,
                      original_filename: payload.original_filename,
                      mime_type: payload.mime_type,
                      file_size_bytes: payload.file_size_bytes,
                      status: payload.status,
                      uploaded_at: "2026-06-16T00:00:00.000Z",
                      reviewed_at: null,
                      review_note: null,
                    } as Record<string, unknown>);
                  return { data: row, error: null };
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

// ── 1. sniff ───────────────────────────────────────────────────────────────────

describe("sniffRentalDepositSlipMime", () => {
  it("sniffs JPEG/PNG/PDF magic", () => {
    expect(sniffRentalDepositSlipMime(jpegBytes())).toBe("image/jpeg");
    expect(sniffRentalDepositSlipMime(pngBytes())).toBe("image/png");
    expect(sniffRentalDepositSlipMime(pdfBytes())).toBe("application/pdf");
  });
  it("rejects SVG, text, GIF, ZIP, truncated, empty", () => {
    expect(sniffRentalDepositSlipMime(Buffer.from("<svg/>"))).toBeNull();
    expect(sniffRentalDepositSlipMime(Buffer.from("hello"))).toBeNull();
    expect(
      sniffRentalDepositSlipMime(Buffer.from([0x47, 0x49, 0x46, 0x38])),
    ).toBeNull();
    expect(
      sniffRentalDepositSlipMime(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
    ).toBeNull();
    expect(sniffRentalDepositSlipMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffRentalDepositSlipMime(Buffer.alloc(0))).toBeNull();
  });
  it("rejects a truncated PNG signature (needs full 8 bytes)", () => {
    expect(
      sniffRentalDepositSlipMime(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    ).toBeNull();
  });
});

// ── 2. extension ─────────────────────────────────────────────────────────────

describe("rentalDepositSlipExtensionForMime", () => {
  it("maps allowlist mimes", () => {
    expect(rentalDepositSlipExtensionForMime("image/jpeg")).toBe("jpg");
    expect(rentalDepositSlipExtensionForMime("image/png")).toBe("png");
    expect(rentalDepositSlipExtensionForMime("application/pdf")).toBe("pdf");
  });
  it("fails closed", () => {
    expect(rentalDepositSlipExtensionForMime("image/gif")).toBeNull();
    expect(rentalDepositSlipExtensionForMime(null)).toBeNull();
    expect(rentalDepositSlipExtensionForMime(undefined)).toBeNull();
  });
});

// ── 3. storage key ───────────────────────────────────────────────────────────

describe("buildRentalDepositSlipStorageKey", () => {
  const RE =
    /^booking-deposit-slips\/[0-9a-f-]{36}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|pdf)$/;
  it("produces a private booking-scoped key", () => {
    expect(buildRentalDepositSlipStorageKey(BOOKING_ID, "image/jpeg")).toMatch(
      RE,
    );
  });
  it("embeds the booking id and follows the MIME extension", () => {
    const key = buildRentalDepositSlipStorageKey(BOOKING_ID, "application/pdf");
    expect(key).toContain(`booking-deposit-slips/${BOOKING_ID}/`);
    expect(key.endsWith(".pdf")).toBe(true);
  });
  it("is random per call", () => {
    const keys = new Set(
      Array.from({ length: 25 }, () =>
        buildRentalDepositSlipStorageKey(BOOKING_ID, "image/png"),
      ),
    );
    expect(keys.size).toBe(25);
  });
});

// ── 4. asUuidOrNull ──────────────────────────────────────────────────────────

describe("asUuidOrNull", () => {
  it("accepts and lowercases a uuid", () => {
    expect(asUuidOrNull(BOOKING_ID.toUpperCase())).toBe(BOOKING_ID);
  });
  it("rejects non-uuids", () => {
    expect(asUuidOrNull("../../etc")).toBeNull();
    expect(asUuidOrNull("")).toBeNull();
    expect(asUuidOrNull(null)).toBeNull();
    expect(asUuidOrNull(42)).toBeNull();
  });
});

// ── 5. filename sanitization ─────────────────────────────────────────────────

describe("sanitizeRentalDepositSlipFilename", () => {
  it("strips directory components", () => {
    expect(sanitizeRentalDepositSlipFilename("../../etc/passwd.jpg")).toBe(
      "passwd.jpg",
    );
    expect(sanitizeRentalDepositSlipFilename("C:\\secret\\slip.png")).toBe(
      "slip.png",
    );
  });
  it("strips control characters", () => {
    expect(sanitizeRentalDepositSlipFilename("a" + String.fromCharCode(0) + "b" + String.fromCharCode(31) + "c.jpg")).toBe(
      "abc.jpg",
    );
  });
  it("falls back to 'slip' when empty / non-string", () => {
    expect(sanitizeRentalDepositSlipFilename("")).toBe("slip");
    expect(sanitizeRentalDepositSlipFilename("   ")).toBe("slip");
    expect(sanitizeRentalDepositSlipFilename(null)).toBe("slip");
    expect(sanitizeRentalDepositSlipFilename(undefined)).toBe("slip");
  });
  it("caps length at 200 chars", () => {
    expect(
      sanitizeRentalDepositSlipFilename("x".repeat(500)).length,
    ).toBeLessThanOrEqual(200);
  });
});

// ── 6. safe view ─────────────────────────────────────────────────────────────

describe("toSafeRentalDepositSlip + safe select", () => {
  it("SAFE_SELECT never includes storage path/bucket", () => {
    expect(RENTAL_DEPOSIT_SLIP_SAFE_SELECT).not.toContain("storage_path");
    expect(RENTAL_DEPOSIT_SLIP_SAFE_SELECT).not.toContain("storage_bucket");
  });
  it("never exposes storage path/bucket or URLs even if present on the row", () => {
    const dirty = {
      id: "s1",
      rental_booking_id: BOOKING_ID,
      original_filename: "slip.jpg",
      mime_type: "image/jpeg",
      file_size_bytes: 123,
      status: "pending_review",
      uploaded_at: "2026-06-16T00:00:00.000Z",
      reviewed_at: null,
      review_note: null,
      storage_path: "booking-deposit-slips/x/secret.jpg",
      storage_bucket: RENTAL_DEPOSIT_SLIP_BUCKET,
      signed_url: "https://example.com/signed",
    };
    const serialized = JSON.stringify(toSafeRentalDepositSlip(dirty));
    expect(serialized).not.toContain("storage_path");
    expect(serialized).not.toContain("storagePath");
    expect(serialized).not.toContain("storage_bucket");
    expect(serialized).not.toContain("secret.jpg");
    expect(serialized).not.toContain("http");
  });
});

// ── 7. upload orchestration ──────────────────────────────────────────────────

describe("uploadRentalDepositSlipEvidence", () => {
  const baseInput = {
    bookingId: BOOKING_ID,
    uploadedBy: USER_ID,
    fileBytes: jpegBytes(),
    originalFilename: "my slip.jpg",
  };

  it("rejects unsupported MIME (415) without inserting", async () => {
    const { client, calls } = mockClient();
    await expect(
      uploadRentalDepositSlipEvidence(client, {
        ...baseInput,
        fileBytes: Buffer.from("<svg/>"),
      }),
    ).rejects.toMatchObject({ statusCode: 415 });
    expect(calls.insertPayload).toBeNull();
    expect(calls.uploadPath).toBeNull();
  });

  it("rejects oversize files (413)", async () => {
    const { client } = mockClient();
    const big = jpegBytes(RENTAL_DEPOSIT_SLIP_MAX_FILE_BYTES + 1);
    await expect(
      uploadRentalDepositSlipEvidence(client, { ...baseInput, fileBytes: big }),
    ).rejects.toMatchObject({ statusCode: 413 });
  });

  it("rejects empty files (422)", async () => {
    const { client } = mockClient();
    await expect(
      uploadRentalDepositSlipEvidence(client, {
        ...baseInput,
        fileBytes: Buffer.alloc(0),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects an invalid booking id (400)", async () => {
    const { client } = mockClient();
    await expect(
      uploadRentalDepositSlipEvidence(client, {
        ...baseInput,
        bookingId: "not-a-uuid",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("uploads to the PRIVATE bucket and records status pending_review", async () => {
    const { client, calls } = mockClient();
    const result = await uploadRentalDepositSlipEvidence(client, baseInput);
    expect(calls.uploadBucket).toBe(RENTAL_DEPOSIT_SLIP_BUCKET);
    expect(calls.uploadUpsert).toBe(false);
    expect(calls.uploadContentType).toBe("image/jpeg");
    expect(calls.insertTable).toBe("rental_booking_deposit_slips");
    expect(calls.insertPayload?.status).toBe("pending_review");
    expect(calls.insertPayload?.storage_bucket).toBe(
      RENTAL_DEPOSIT_SLIP_BUCKET,
    );
    expect(calls.insertPayload?.uploaded_by).toBe(USER_ID);
    expect(result.status).toBe("pending_review");
  });

  it("returns NO public URL and NO storage path in the response", async () => {
    const { client } = mockClient();
    const result = await uploadRentalDepositSlipEvidence(client, baseInput);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("http");
    expect(serialized).not.toContain("storage_path");
    expect(serialized).not.toContain("storagePath");
    expect(serialized).not.toContain("booking-deposit-slips/");
  });

  it("propagates a storage upload failure as 500 without inserting", async () => {
    const { client, calls } = mockClient({
      uploadError: { message: "boom" },
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      uploadRentalDepositSlipEvidence(client, baseInput),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(calls.insertPayload).toBeNull();
    errSpy.mockRestore();
  });
});

// ── 8. signed url ────────────────────────────────────────────────────────────

describe("createRentalDepositSlipSignedUrl", () => {
  it("returns the signed URL for a stored path", async () => {
    const { client, calls } = mockClient({
      signedUrl: "https://local/signed?token=abc",
    });
    const url = await createRentalDepositSlipSignedUrl(client, "x/y.jpg", 60);
    expect(url).toBe("https://local/signed?token=abc");
    expect(calls.signedBucket).toBe(RENTAL_DEPOSIT_SLIP_BUCKET);
    expect(calls.signedTtl).toBe(60);
  });
  it("throws 500 when signing fails", async () => {
    const { client } = mockClient({ signedUrlError: { message: "no" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      createRentalDepositSlipSignedUrl(client, "x/y.jpg"),
    ).rejects.toMatchObject({ statusCode: 500 });
    errSpy.mockRestore();
  });
});
