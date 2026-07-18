/**
 * POST /api/admin/rental-bookings/:id/return-settlement
 *
 * T2 return WITH settlement (decisions.md §b addendum). Staff enter only
 * penalties (amount + note each), optional special discount (+ mandatory
 * note), signatures, and — when money moves — the transfer slip. The RPC
 * (migration 125) is the writer authority for all amounts; this endpoint
 * validates shape, stores evidence in the PRIVATE rental-deposit-slips
 * bucket, and orchestrates via settleRentalBookingReturn (which keeps
 * completeRentalBookingFulfillment byte-unchanged).
 *
 * Auth:  requirePlatformAdmin (staff + super_admin) — returns are a staff
 *        counter operation.
 * Input: multipart/form-data
 *   penaltyLines            — JSON array of { amount, note } (may be [])
 *   specialDiscountAmount?  — number ≥ 0 (note REQUIRED when > 0)
 *   specialDiscountNote?    — text
 *   refundBankAccountRef?   — REQUIRED by the RPC when a refund results
 *   notes?                  — free text for the fulfillment log
 *   customerSignature       — PNG data URL (required)
 *   staffSignature          — PNG data URL (required)
 *   slip?                   — JPEG/PNG/PDF by MAGIC BYTES (required by the
 *                             RPC whenever refund/collection > 0)
 *
 * Returns: { settlement, fulfillment } (see rental-return-settlement.ts)
 * Errors:  400 | 401 | 403 | 404 | 413 | 415 | 422 | 500
 */
import {
  createError,
  defineEventHandler,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { settleRentalBookingReturn } from "~~/server/utils/rental-return-settlement";
import {
  RENTAL_DEPOSIT_SLIP_BUCKET,
  RENTAL_DEPOSIT_SLIP_MAX_FILE_BYTES,
  rentalDepositSlipExtensionForMime,
  sniffRentalDepositSlipMime,
} from "~~/server/utils/rental-deposit-slip-evidence";

const SIGNATURE_PREFIX = "data:image/png;base64,";
const MAX_SIGNATURE_BYTES = 1 * 1024 * 1024;

function textPart(
  parts: Awaited<ReturnType<typeof readMultipartFormData>>,
  name: string,
): string {
  return (
    parts
      ?.find((p) => p.name === name && !p.filename)
      ?.data?.toString("utf8")
      .trim() ?? ""
  );
}

function decodeSignature(name: string, value: string): Buffer {
  if (!value.startsWith(SIGNATURE_PREFIX)) {
    throw createError({
      statusCode: 422,
      statusMessage: `${name} must be a PNG data URL`,
    });
  }
  const buffer = Buffer.from(value.slice(SIGNATURE_PREFIX.length), "base64");
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_SIGNATURE_BYTES) {
    throw createError({
      statusCode: 422,
      statusMessage: `${name} is empty or too large`,
    });
  }
  return buffer;
}

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } =
    await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const parts = await readMultipartFormData(event);

  // Penalty lines: shape-validated here for a friendly 422; the RPC and the
  // fail-loud f_penalty_lines_total re-validate authoritatively.
  let penaltyLines: Array<{ amount: number; note: string }>;
  try {
    const parsed = JSON.parse(textPart(parts, "penaltyLines") || "[]");
    if (!Array.isArray(parsed)) throw new Error("not array");
    penaltyLines = parsed.map((line: Record<string, unknown>) => {
      const amount = Number(line?.amount);
      const note = typeof line?.note === "string" ? line.note.trim() : "";
      if (!Number.isFinite(amount) || amount <= 0 || note.length === 0) {
        throw new Error("bad line");
      }
      return { amount: Math.round(amount * 100) / 100, note };
    });
  } catch {
    throw createError({
      statusCode: 422,
      statusMessage: "SETTLEMENT_PENALTY_LINES_INVALID",
    });
  }

  const specialDiscountAmount = Math.max(
    0,
    Number(textPart(parts, "specialDiscountAmount") || 0),
  );
  const specialDiscountNote = textPart(parts, "specialDiscountNote") || null;
  if (specialDiscountAmount > 0 && !specialDiscountNote) {
    throw createError({
      statusCode: 422,
      statusMessage: "SETTLEMENT_DISCOUNT_NOTE_REQUIRED",
    });
  }
  const refundBankAccountRef = textPart(parts, "refundBankAccountRef") || null;
  const notes = textPart(parts, "notes") || null;

  const customerSignatureDataUrl = textPart(parts, "customerSignature");
  const staffSignatureDataUrl = textPart(parts, "staffSignature");
  const customerSigBuffer = decodeSignature(
    "customerSignature",
    customerSignatureDataUrl,
  );
  const staffSigBuffer = decodeSignature("staffSignature", staffSignatureDataUrl);

  // Optional slip — REQUIRED by the RPC whenever refund/collection > 0.
  const slipFile = parts?.find((p) => p.name === "slip" && p.filename && p.data);
  let slipStoragePath: string | null = null;
  if (slipFile?.data) {
    const buffer = Buffer.from(slipFile.data);
    if (buffer.byteLength > RENTAL_DEPOSIT_SLIP_MAX_FILE_BYTES) {
      throw createError({ statusCode: 413, statusMessage: "FILE_TOO_LARGE" });
    }
    const sniffedMime = sniffRentalDepositSlipMime(buffer);
    const extension = rentalDepositSlipExtensionForMime(sniffedMime);
    if (!sniffedMime || !extension) {
      throw createError({
        statusCode: 415,
        statusMessage: "UNSUPPORTED_FILE_TYPE",
      });
    }
    slipStoragePath = `return-settlement/${bookingId}/slip-${crypto.randomUUID()}.${extension}`;
    const { error: slipError } = await adminClient.storage
      .from(RENTAL_DEPOSIT_SLIP_BUCKET)
      .upload(slipStoragePath, buffer, {
        contentType: sniffedMime,
        upsert: false,
      });
    if (slipError) {
      throw createError({ statusCode: 500, statusMessage: slipError.message });
    }
  }

  // Signatures also live in the PRIVATE bucket (settlement evidence).
  const customerSignaturePath = `return-settlement/${bookingId}/customer-signature-${crypto.randomUUID()}.png`;
  const staffSignaturePath = `return-settlement/${bookingId}/staff-signature-${crypto.randomUUID()}.png`;
  for (const [path, buffer] of [
    [customerSignaturePath, customerSigBuffer],
    [staffSignaturePath, staffSigBuffer],
  ] as const) {
    const { error: sigError } = await adminClient.storage
      .from(RENTAL_DEPOSIT_SLIP_BUCKET)
      .upload(path, buffer, { contentType: "image/png", upsert: false });
    if (sigError) {
      throw createError({ statusCode: 500, statusMessage: sigError.message });
    }
  }

  return await settleRentalBookingReturn({
    adminClient,
    userId,
    platformRole,
    bookingId,
    penaltyLines,
    specialDiscountAmount,
    specialDiscountNote,
    customerSignatureDataUrl,
    customerSignaturePath,
    staffSignaturePath,
    slipStoragePath,
    refundBankAccountRef,
    branchId: null,
    notes,
  });
});
