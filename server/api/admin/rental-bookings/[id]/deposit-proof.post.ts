import {
  createError,
  defineEventHandler,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { CATALOG_MEDIA_BUCKET } from "~~/server/utils/catalog-media";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MAX_BYTES = 10 * 1024 * 1024;

function readText(
  parts: Awaited<ReturnType<typeof readMultipartFormData>>,
  name: string,
) {
  const raw = parts?.find((part) => part.name === name)?.data;
  return raw ? Buffer.from(raw).toString("utf8").trim() : "";
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "application/pdf") return "pdf";
  return "jpg";
}

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId)
    throw createError({
      statusCode: 400,
      statusMessage: "Booking id is required",
    });

  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.filename && part.data);
  if (!file?.data)
    throw createError({
      statusCode: 400,
      statusMessage: "Deposit proof file is required",
    });
  if (!ALLOWED_MIME.has(file.type || "")) {
    throw createError({
      statusCode: 415,
      statusMessage: "Only image/PDF proof files are supported",
    });
  }

  const buffer = Buffer.from(file.data);
  if (buffer.byteLength > MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "Deposit proof must be 10MB or smaller",
    });
  }

  const amount = Math.max(0, Number(readText(parts, "amount") || 0));
  const paymentMethod = readText(parts, "paymentMethod") || null;
  const proofKind =
    readText(parts, "proofKind") === "refund" ? "refund" : "payment";
  const notes = readText(parts, "notes") || null;
  const path = `deposit-proofs/${bookingId}/${proofKind}-${crypto.randomUUID()}.${extFromMime(file.type || "")}`;

  const { error: uploadError } = await adminClient.storage
    .from(CATALOG_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError)
    throw createError({ statusCode: 500, statusMessage: uploadError.message });
  const fileUrl = adminClient.storage
    .from(CATALOG_MEDIA_BUCKET)
    .getPublicUrl(path).data.publicUrl;

  const { error: insertError } = await adminClient
    .from("rental_booking_deposit_proofs")
    .insert({
      booking_id: bookingId,
      proof_kind: proofKind,
      amount,
      payment_method: paymentMethod,
      file_url: fileUrl,
      storage_bucket: CATALOG_MEDIA_BUCKET,
      storage_path: path,
      mime_type: file.type || null,
      file_size_bytes: buffer.byteLength,
      notes,
      created_by_user_id: userId,
    });
  if (insertError)
    throw createError({ statusCode: 500, statusMessage: insertError.message });

  if (proofKind === "payment") {
    const { error: updateError } = await adminClient
      .from("rental_bookings")
      .update({
        deposit_paid_amount: amount,
        deposit_payment_method: paymentMethod,
        deposit_payment_status: "paid",
        deposit_paid_at: new Date().toISOString(),
      })
      .eq("id", bookingId);
    if (updateError)
      throw createError({
        statusCode: 500,
        statusMessage: updateError.message,
      });
  }

  return { fileUrl, storageBucket: CATALOG_MEDIA_BUCKET, storagePath: path };
});
