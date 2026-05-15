import {
  createError,
  defineEventHandler,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { CATALOG_MEDIA_BUCKET } from "~~/server/utils/catalog-media";
import { getAdminRefundDetail, linkRefundProof } from "~~/server/utils/admin-refunds";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 10 * 1024 * 1024;

function readText(parts: Awaited<ReturnType<typeof readMultipartFormData>>, name: string) {
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
  const refundId = getRouterParam(event, "id");
  if (!refundId) throw createError({ statusCode: 400, statusMessage: "Refund id is required" });
  const detail = await getAdminRefundDetail(adminClient, refundId);
  const bookingId = detail.booking?.id;
  if (!bookingId) throw createError({ statusCode: 409, statusMessage: "Refund booking is missing" });
  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.filename && part.data);
  if (!file?.data) throw createError({ statusCode: 400, statusMessage: "Refund proof file is required" });
  if (!ALLOWED_MIME.has(file.type || "")) throw createError({ statusCode: 415, statusMessage: "Only image/PDF proof files are supported" });
  const buffer = Buffer.from(file.data);
  if (buffer.byteLength > MAX_BYTES) throw createError({ statusCode: 413, statusMessage: "Refund proof must be 10MB or smaller" });
  const path = `deposit-proofs/${bookingId}/refund-${crypto.randomUUID()}.${extFromMime(file.type || "")}`;
  const { error: uploadError } = await adminClient.storage.from(CATALOG_MEDIA_BUCKET).upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) throw createError({ statusCode: 500, statusMessage: uploadError.message });
  const fileUrl = adminClient.storage.from(CATALOG_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  const { data, error } = await adminClient.from("rental_booking_deposit_proofs").insert({ booking_id: bookingId, proof_kind: "refund", amount: detail.refundAmount, payment_method: readText(parts, "paymentMethod") || "bank_transfer", file_url: fileUrl, storage_bucket: CATALOG_MEDIA_BUCKET, storage_path: path, mime_type: file.type || null, file_size_bytes: buffer.byteLength, notes: readText(parts, "notes") || null, created_by_user_id: userId }).select("id").maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  return linkRefundProof({ client: adminClient, refundId, proofId: String((data as { id?: string } | null)?.id ?? ""), adminUserId: userId });
});