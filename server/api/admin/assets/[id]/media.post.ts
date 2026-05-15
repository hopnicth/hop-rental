import {
  createError,
  defineEventHandler,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import sharp from "sharp";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_ASSET_DETAIL_SELECT,
  mapAssetDetail,
} from "~~/server/utils/admin-asset";
import { CATALOG_MEDIA_BUCKET } from "~~/server/utils/catalog-media";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VARIANT_WIDTHS = { thumbnail: 300, card: 800, large: 1600 } as const;
const MAX_BYTES = 15 * 1024 * 1024;

type StorageAdminClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        buffer: Buffer,
        options: { contentType: string; upsert: boolean },
      ): Promise<{ error: { message?: string } | null }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
};

function readTextPart(
  parts: Awaited<ReturnType<typeof readMultipartFormData>>,
  name: string,
) {
  const raw = parts?.find((part) => part.name === name)?.data;
  return raw ? Buffer.from(raw).toString("utf8").trim() : "";
}

async function uploadVariant(
  adminClient: StorageAdminClient,
  path: string,
  buffer: Buffer,
) {
  const { error } = await adminClient.storage
    .from(CATALOG_MEDIA_BUCKET)
    .upload(path, buffer, {
      contentType: "image/webp",
      upsert: true,
    });
  if (error) throw error;
  return adminClient.storage.from(CATALOG_MEDIA_BUCKET).getPublicUrl(path).data
    .publicUrl;
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.filename && part.data);

  if (!file?.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "image file is required",
    });
  }

  if (!ALLOWED_TYPES.has(file.type || "")) {
    throw createError({
      statusCode: 415,
      statusMessage: "Only JPEG, PNG, or WebP images are supported",
    });
  }

  if (Buffer.from(file.data).byteLength > MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "Image file must be 15MB or smaller",
    });
  }

  const targetField = readTextPart(parts, "target") || "gallery";
  if (targetField !== "gallery" && targetField !== "thumbnail") {
    throw createError({
      statusCode: 422,
      statusMessage: "target must be 'gallery' or 'thumbnail'",
    });
  }
  const setAsCover = readTextPart(parts, "setAsCover") === "true";

  const { data: existing, error: fetchError } = await adminClient
    .from("assets")
    .select("id, thumbnail_url, image_urls")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: fetchError.message });
  }

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: "Asset not found",
    });
  }

  const mediaId = crypto.randomUUID();
  const basePath = `assets/${id}/${mediaId}`;
  const image = sharp(Buffer.from(file.data)).rotate();
  const variants: Record<string, { url: string }> = {};

  for (const [key, width] of Object.entries(VARIANT_WIDTHS)) {
    const { data } = await image
      .clone()
      .resize({
        width,
        height: width,
        fit: "contain",
        withoutEnlargement: true,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .webp({ quality: key === "thumbnail" ? 78 : 82 })
      .toBuffer({ resolveWithObject: true });

    const path = `${basePath}/${key}.webp`;
    const url = await uploadVariant(adminClient, path, data);
    variants[key] = { url };
  }

  const canonicalUrl = variants.large?.url ?? variants.card?.url ?? "";

  const updates: Record<string, unknown> = {};
  const currentGallery = Array.isArray(existing.image_urls)
    ? (existing.image_urls as string[])
    : [];
  if (targetField === "thumbnail") {
    updates.thumbnail_url = canonicalUrl;
    if (!currentGallery.includes(canonicalUrl)) {
      updates.image_urls = [canonicalUrl, ...currentGallery];
    }
  } else if (setAsCover) {
    updates.image_urls = [
      canonicalUrl,
      ...currentGallery.filter((entry) => entry !== canonicalUrl),
    ];
    updates.thumbnail_url = canonicalUrl;
  } else {
    updates.image_urls = [...currentGallery, canonicalUrl];
    if (!existing.thumbnail_url) {
      updates.thumbnail_url = canonicalUrl;
    }
  }

  const { data: updated, error: updateError } = await adminClient
    .from("assets")
    .update(updates)
    .eq("id", id)
    .select(ADMIN_ASSET_DETAIL_SELECT)
    .single();

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message });
  }

  return {
    item: mapAssetDetail(updated as Record<string, unknown>),
    upload: {
      mediaId,
      target: targetField,
      url: canonicalUrl,
      variants,
      originalFilename: file.filename ?? null,
    },
  };
});
