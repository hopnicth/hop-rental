import { createError, defineEventHandler, readMultipartFormData } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";

const AVATARS_BUCKET = "avatars";
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });
  }

  const parts = await readMultipartFormData(event);
  const file =
    parts?.find((part) => part.name === "file" && part.filename && part.data) ??
    parts?.find((part) => part.filename && part.data);

  if (!file?.data) {
    throw createError({ statusCode: 400, statusMessage: "Avatar file is required" });
  }
  if (!ALLOWED_MIME.has(file.type || "")) {
    throw createError({ statusCode: 415, statusMessage: "Only JPEG, PNG, or WEBP files are supported" });
  }

  const buffer = Buffer.from(file.data);
  if (buffer.byteLength > MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "Avatar file must be 3MB or smaller" });
  }

  const ext = extensionForMime(file.type || "");
  // Use fixed path per user so re-upload replaces the old file automatically.
  const storagePath = `users/${userId}/avatar.${ext}`;

  const client = serverSupabaseServiceRole(event);
  const { error: uploadError } = await client.storage
    .from(AVATARS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    throw createError({ statusCode: 500, statusMessage: uploadError.message });
  }

  // Get public URL (avatars bucket should be public or use signed URL pattern)
  const { data: urlData } = client.storage
    .from(AVATARS_BUCKET)
    .getPublicUrl(storagePath);

  const avatarUrl = urlData.publicUrl;

  const { error: updateError } = await client
    .from("users")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId);

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message });
  }

  return { avatarUrl };
});
