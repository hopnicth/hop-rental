import {
  createError,
  defineEventHandler,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  BOOKING_DOCS_BUCKET,
  buildBookingDocumentPath,
  loadBookingOpsPayload,
} from "~~/server/utils/admin-bookings-ops";
import type {
  AdminBookingOpsPayload,
  AssetDocumentVisibility,
  RentalBookingDocumentType,
} from "~~/app/types/admin-booking-ops";

const ALLOWED_TYPES = new Set<RentalBookingDocumentType>([
  "repair",
  "fine",
  "damage_evidence",
  "handover",
  "other",
]);
const ALLOWED_VIS = new Set<AssetDocumentVisibility>([
  "public",
  "customer_after_booking",
  "internal",
]);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_BYTES = 30 * 1024 * 1024;

function readTextPart(
  parts: Awaited<ReturnType<typeof readMultipartFormData>>,
  name: string,
): string {
  const raw = parts?.find((part) => part.name === name)?.data;
  return raw ? Buffer.from(raw).toString("utf8").trim() : "";
}

function extFromMime(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

export default defineEventHandler(
  async (event): Promise<AdminBookingOpsPayload> => {
    const { adminClient, userId } = await requirePlatformAdmin(event);
    const bookingId = getRouterParam(event, "id");
    if (!bookingId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Booking id is required",
      });
    }

    const { data: booking, error: bookingErr } = await adminClient
      .from("rental_bookings")
      .select("id, asset_id, currency_code")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingErr) {
      throw createError({ statusCode: 500, statusMessage: bookingErr.message });
    }
    if (!booking) {
      throw createError({
        statusCode: 404,
        statusMessage: "Booking not found",
      });
    }

    const parts = await readMultipartFormData(event);
    const file = parts?.find((part) => part.filename && part.data);
    if (!file?.data) {
      throw createError({
        statusCode: 400,
        statusMessage: "Document file is required",
      });
    }
    if (!ALLOWED_MIME.has(file.type || "")) {
      throw createError({
        statusCode: 415,
        statusMessage: "Only PDF or JPEG/PNG/WebP images are supported",
      });
    }
    const buffer = Buffer.from(file.data);
    if (buffer.byteLength > MAX_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: "Document must be 30MB or smaller",
      });
    }

    const documentTypeRaw = readTextPart(parts, "documentType") || "other";
    const visibilityRaw = readTextPart(parts, "visibility") || "internal";
    const documentType = (
      ALLOWED_TYPES.has(documentTypeRaw as RentalBookingDocumentType)
        ? documentTypeRaw
        : "other"
    ) as RentalBookingDocumentType;
    const visibility = (
      ALLOWED_VIS.has(visibilityRaw as AssetDocumentVisibility)
        ? visibilityRaw
        : "internal"
    ) as AssetDocumentVisibility;
    const titleInput = readTextPart(parts, "title");
    const description = readTextPart(parts, "description") || null;
    const amountText = readTextPart(parts, "amount");
    const amount =
      amountText && Number.isFinite(Number(amountText))
        ? Number(amountText)
        : null;
    const issuedAtText = readTextPart(parts, "issuedAt");
    const issuedAt = issuedAtText || null;
    const checklistId = readTextPart(parts, "bookingChecklistId") || null;

    const filename = file.filename || "document";
    const fallbackTitle = filename.replace(/\.[^.]+$/, "") || "Document";
    const title = titleInput.length > 0 ? titleInput : fallbackTitle;

    const docId = crypto.randomUUID();
    const ext = extFromMime(file.type || "");
    const path = buildBookingDocumentPath(bookingId, docId, ext);

    const { error: uploadErr } = await adminClient.storage
      .from(BOOKING_DOCS_BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });
    if (uploadErr) {
      throw createError({ statusCode: 500, statusMessage: uploadErr.message });
    }
    const fileUrl = adminClient.storage
      .from(BOOKING_DOCS_BUCKET)
      .getPublicUrl(path).data.publicUrl;

    const assetId = (booking as { asset_id: string | null }).asset_id ?? null;
    const currency =
      (booking as { currency_code?: string }).currency_code || "THB";

    const { error: insertErr } = await adminClient
      .from("rental_booking_documents")
      .insert({
        id: docId,
        booking_id: bookingId,
        booking_checklist_id: checklistId,
        asset_id: assetId,
        document_type: documentType,
        visibility,
        title,
        description,
        file_url: fileUrl,
        file_name: filename,
        mime_type: file.type || null,
        file_size_bytes: buffer.byteLength,
        amount,
        currency_code: currency,
        issued_at: issuedAt,
        storage_bucket: BOOKING_DOCS_BUCKET,
        storage_path: path,
        created_by_user_id: userId,
      });
    if (insertErr) {
      await adminClient.storage.from(BOOKING_DOCS_BUCKET).remove([path]);
      throw createError({ statusCode: 500, statusMessage: insertErr.message });
    }

    return await loadBookingOpsPayload(adminClient, bookingId, assetId);
  },
);
