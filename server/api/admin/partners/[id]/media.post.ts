/**
 * POST /api/admin/partners/:id/media
 *
 * Upload a thumbnail or cover image for a partner profile.
 *
 * Multipart form fields:
 *   file  — image file (JPEG / PNG / WebP, max 15 MB)
 *   kind  — "thumbnail" | "cover"
 *
 * Processing:
 *   - thumbnail: 800×800 cover-fit, WebP quality 80
 *   - cover:     1600 px wide, natural height, WebP quality 82
 *
 * Storage path: partner-profiles/{partnerId}/{kind}-{uuid}.webp
 *
 * Returns: { item: AdminPartnerRow, upload: { kind, path, url, width, height } }
 */
import {
  createError,
  defineEventHandler,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PARTNER_DETAIL_SELECT,
  mapAdminPartnerDetail,
} from "~~/server/utils/admin-partners";
import {
  PARTNER_MEDIA_BUCKET,
  asPartnerUploadKind,
  buildPartnerMediaPath,
  processPartnerImageUpload,
  removePartnerMediaByPublicUrl,
  validatePartnerMediaMime,
  validatePartnerMediaSize,
} from "~~/server/utils/partner-media";

function readTextPart(
  parts: Awaited<ReturnType<typeof readMultipartFormData>>,
  name: string,
) {
  const raw = parts?.find((part) => part.name === name)?.data;
  return raw ? Buffer.from(raw).toString("utf8").trim() : "";
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  // ── Parse multipart ────────────────────────────────────────────────────
  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.filename && part.data);

  if (!file?.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "image file is required",
    });
  }

  const kind = asPartnerUploadKind(readTextPart(parts, "kind"));

  // ── Validate file ──────────────────────────────────────────────────────
  validatePartnerMediaMime(file.type || "");
  const uploadBuffer = Buffer.from(file.data);
  validatePartnerMediaSize(uploadBuffer.byteLength);

  // ── Verify partner exists + fetch current image URL for replacement ────
  const { data: existing, error: fetchError } = await adminClient
    .from("partner_profiles")
    .select("id, thumbnail_image_url, cover_image_url")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: fetchError.message });
  }
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: "Partner profile not found",
    });
  }

  // ── Process image with sharp ───────────────────────────────────────────
  const processed = await processPartnerImageUpload({
    buffer: uploadBuffer,
    kind,
  });

  // ── Upload to storage ──────────────────────────────────────────────────
  const path = buildPartnerMediaPath(id, kind);
  const { error: uploadError } = await adminClient.storage
    .from(PARTNER_MEDIA_BUCKET)
    .upload(path, processed.buffer, {
      contentType: processed.contentType,
      upsert: true,
    });

  if (uploadError) {
    throw createError({
      statusCode: 500,
      statusMessage: uploadError.message ?? "Failed to upload image",
    });
  }

  const url = adminClient.storage
    .from(PARTNER_MEDIA_BUCKET)
    .getPublicUrl(path).data.publicUrl;

  // ── Best-effort: remove old file (do not fail request if removal fails) ─
  const oldUrl =
    kind === "thumbnail"
      ? existing.thumbnail_image_url
      : existing.cover_image_url;
  await removePartnerMediaByPublicUrl(adminClient, oldUrl, id);

  // ── Update partner_profiles ────────────────────────────────────────────
  const updateField =
    kind === "thumbnail" ? "thumbnail_image_url" : "cover_image_url";

  const { data: updated, error: updateError } = await adminClient
    .from("partner_profiles")
    .update({ [updateField]: url })
    .eq("id", id)
    .select(ADMIN_PARTNER_DETAIL_SELECT)
    .single();

  if (updateError || !updated) {
    throw createError({
      statusCode: 500,
      statusMessage: updateError?.message ?? "Failed to update partner profile",
    });
  }

  return {
    item: mapAdminPartnerDetail(updated as Record<string, unknown>),
    upload: {
      kind,
      path,
      url,
      width: processed.width,
      height: processed.height,
    },
  };
});
