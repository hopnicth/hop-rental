import { createError, defineEventHandler, readMultipartFormData } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";

const KYC_DOCUMENTS_BUCKET = "kyc-documents";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);

function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "application/pdf") return "pdf";
  return "jpg";
}

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const parts = await readMultipartFormData(event);
  const file =
    parts?.find((part) => part.name === "file" && part.filename && part.data) ??
    parts?.find((part) => part.filename && part.data);

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

  const storagePath = `users/${userId}/id-card/${Date.now()}-${crypto.randomUUID()}.${extensionForMime(file.type || "")}`;
  const client = serverSupabaseServiceRole(event);
  const { error: uploadError } = await client.storage
    .from(KYC_DOCUMENTS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw createError({ statusCode: 500, statusMessage: uploadError.message });
  }

  const { error: updateError } = await client
    .from("users")
    .update({ id_card_url: storagePath, kyc_status: "pending" })
    .eq("id", userId);

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message });
  }

  return {
    file: {
      storageBucket: KYC_DOCUMENTS_BUCKET,
      mimeType: file.type,
      fileSize: buffer.byteLength,
    },
  };
});
