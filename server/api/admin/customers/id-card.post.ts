import { createError, defineEventHandler, readMultipartFormData } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

const KYC_DOCUMENTS_BUCKET = "kyc-documents";
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_BYTES = 5 * 1024 * 1024;

function readText(
  parts: Awaited<ReturnType<typeof readMultipartFormData>>,
  name: string,
) {
  const raw = parts?.find((part) => part.name === name)?.data;
  return raw ? Buffer.from(raw).toString("utf8").trim() : "";
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "application/pdf") return "pdf";
  return "jpg";
}

function normalizeStorageKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9+_.-]/g, "_").slice(0, 80) || "unknown";
}

export default defineEventHandler(async (event) => {
  const { adminClient, userId: adminUserId } =
    await requirePlatformAdmin(event);
  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.filename && part.data);
  const profileUserId = readText(parts, "userId");
  const phone = readText(parts, "phone");
  const fullName = readText(parts, "fullName");
  const notes = readText(parts, "notes");

  if (!profileUserId && !phone) {
    throw createError({
      statusCode: 400,
      statusMessage: "userId or phone is required",
    });
  }
  if (!file?.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "ID card file is required",
    });
  }
  if (!ALLOWED_MIME.has(file.type || "")) {
    throw createError({
      statusCode: 415,
      statusMessage: "Only JPEG, PNG, or PDF files are supported",
    });
  }
  const buffer = Buffer.from(file.data);
  if (buffer.byteLength > MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "ID card file must be 5MB or smaller",
    });
  }

  const ownerKey = normalizeStorageKey(profileUserId || phone);
  const targetPrefix = profileUserId
    ? `users/${profileUserId}/id-card`
    : `walk-in-customers/${ownerKey}/id-card`;
  const path = `${targetPrefix}/admin-${Date.now()}-${crypto.randomUUID()}.${extFromMime(file.type || "")}`;
  const { error: uploadError } = await adminClient.storage
    .from(KYC_DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (uploadError)
    throw createError({ statusCode: 500, statusMessage: uploadError.message });

  if (profileUserId) {
    const update: Record<string, unknown> = {
      id_card_url: path,
      kyc_status: "pending",
    };
    if (phone) update.phone = phone;
    if (fullName) update.full_name = fullName;
    const { error } = await adminClient
      .from("users")
      .update(update)
      .eq("id", profileUserId);
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
  }

  if (phone) {
    const { error } = await adminClient.from("walk_in_customers").upsert(
      {
        phone,
        full_name: fullName || null,
        linked_user_id: profileUserId || null,
        id_card_url: path,
        id_card_storage_path: path,
        notes: notes || null,
        created_by_user_id: adminUserId,
        updated_by_user_id: adminUserId,
      },
      { onConflict: "phone" },
    );
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return {
    ok: true,
    hasIdCardDocument: true,
    file: {
      storageBucket: KYC_DOCUMENTS_BUCKET,
      mimeType: file.type,
      fileSize: buffer.byteLength,
    },
  };
});
