import { createError } from "h3";
import sharp from "sharp";

export const CATALOG_MEDIA_BUCKET = "catalog-media";
const VARIANT_WIDTHS = { thumbnail: 300, card: 800, large: 1600 } as const;
const DEFAULT_FIT = "contain";

type MediaFit = "contain" | "cover";
type MediaStatus = "processing" | "ready" | "failed";
type MediaLinkKind = "youtube" | "external_video";
type DocumentKind = "manual" | "catalog" | "datasheet" | "guide" | "other";

type CatalogMediaTarget =
  | { kind: "product"; productId: string }
  | { kind: "sku"; productId: string; skuId: string };

function fail422(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown) {
  const normalized = asString(value);
  return normalized.length > 0 ? normalized : null;
}

function asUrl(value: unknown, field: string) {
  const normalized = asString(value);
  if (!normalized) fail422(`${field} is required`);
  if (!/^https?:\/\//i.test(normalized))
    fail422(`${field} must be an absolute URL`);
  return normalized;
}

function asFit(value: unknown): MediaFit {
  return value === "cover" ? "cover" : DEFAULT_FIT;
}

function sanitizeMediaItem(item: unknown, index: number) {
  if (!isRecord(item)) fail422("mediaGallery items must be objects");
  const id = asString(item.id);
  if (!id) fail422("mediaGallery item id is required");

  const status =
    item.status === "failed" || item.status === "processing"
      ? item.status
      : "ready";

  return {
    id,
    kind: "image",
    title: optionalString(item.title),
    altText: optionalString(item.altText),
    fit: asFit(item.fit),
    status: status as MediaStatus,
    position: Number.isFinite(Number(item.position))
      ? Number(item.position)
      : index,
    originalFilename: optionalString(item.originalFilename),
    error: optionalString(item.error),
    uploadedAt: optionalString(item.uploadedAt) ?? new Date().toISOString(),
    updatedAt: optionalString(item.updatedAt) ?? new Date().toISOString(),
    variants: isRecord(item.variants) ? item.variants : {},
  };
}

export function normalizeCatalogMediaGallery(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail422("mediaGallery must be a JSON array");
  return value.map(sanitizeMediaItem).sort((a, b) => a.position - b.position);
}

export function normalizeCatalogMediaLinks(value: unknown) {
  if (value == null) return [];

  if (!Array.isArray(value)) fail422("mediaLinks must be a JSON array");

  return value.map((item, index) => {
    if (!isRecord(item)) fail422("mediaLinks items must be objects");
    const id = asString(item.id);
    if (!id) fail422("mediaLinks item id is required");
    const kind: MediaLinkKind =
      item.kind === "external_video" ? "external_video" : "youtube";

    return {
      id,
      kind,
      title: asString(item.title) || `Video ${index + 1}`,
      url: asUrl(item.url, "mediaLinks.url"),
      thumbnailUrl: optionalString(item.thumbnailUrl),
      createdAt: optionalString(item.createdAt) ?? new Date().toISOString(),
    };
  });
}

export function normalizeCatalogDocuments(value: unknown) {
  if (value == null) return [];

  if (!Array.isArray(value)) fail422("documents must be a JSON array");

  return value.map((item, index) => {
    if (!isRecord(item)) fail422("documents items must be objects");
    const id = asString(item.id);
    if (!id) fail422("documents item id is required");

    return {
      id,
      kind: (["manual", "catalog", "datasheet", "guide"].includes(
        asString(item.kind),
      )
        ? asString(item.kind)
        : "other") as DocumentKind,
      title: asString(item.title) || `Document ${index + 1}`,
      url: asUrl(item.url, "documents.url"),
      createdAt: optionalString(item.createdAt) ?? new Date().toISOString(),
    };
  });
}

export function createProcessingCatalogMediaItem(input: {
  mediaId: string;
  position: number;
  title?: string | null;
  altText?: string | null;
  fit?: string | null;
  originalFilename?: string | null;
}) {
  const now = new Date().toISOString();
  return {
    id: input.mediaId,
    kind: "image",
    title: optionalString(input.title),
    altText: optionalString(input.altText),
    fit: asFit(input.fit),
    status: "processing" as MediaStatus,
    position: input.position,
    originalFilename: optionalString(input.originalFilename),
    error: null,
    uploadedAt: now,
    updatedAt: now,
    variants: {},
  };
}

export function upsertCatalogMediaGalleryItem(
  mediaGallery: unknown,
  item: Record<string, unknown>,
) {
  const existing = normalizeCatalogMediaGallery(mediaGallery);
  const next = existing.filter((entry) => entry.id !== item.id);
  next.push(sanitizeMediaItem(item, next.length));
  return next.sort((a, b) => a.position - b.position);
}

export async function syncCatalogTargetMediaGallery(input: {
  adminClient: any;
  target: CatalogMediaTarget;
  mediaGallery: unknown;
  useProductImages?: boolean;
}) {
  const mediaGallery = normalizeCatalogMediaGallery(input.mediaGallery);

  if (input.target.kind === "product") {
    const { error } = await input.adminClient
      .from("products")
      .update({
        media_gallery: mediaGallery,
      })
      .eq("id", input.target.productId);

    if (error) throw error;
    return;
  }

  const useProductImages = input.useProductImages !== false;
  const { error } = await input.adminClient
    .from("product_skus")
    .update({
      media_gallery: mediaGallery,
      use_product_images: useProductImages,
    })
    .eq("product_id", input.target.productId)
    .eq("id", input.target.skuId);

  if (error) throw error;
}

async function uploadVariant(adminClient: any, path: string, buffer: Buffer) {
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

export async function processCatalogImageUpload(input: {
  adminClient: any;
  target: CatalogMediaTarget;
  mediaId: string;
  buffer: Buffer;
  title?: string | null;
  altText?: string | null;
  fit?: string | null;
  originalFilename?: string | null;
}) {
  const fit = asFit(input.fit);
  const basePath =
    input.target.kind === "product"
      ? `products/${input.target.productId}/${input.mediaId}`
      : `products/${input.target.productId}/skus/${input.target.skuId}/${input.mediaId}`;
  const image = sharp(input.buffer).rotate();
  const variants: Record<string, unknown> = {};

  for (const [key, width] of Object.entries(VARIANT_WIDTHS)) {
    const { data, info } = await image
      .clone()
      .resize({
        width,
        height: width,
        fit,
        withoutEnlargement: true,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .webp({ quality: key === "thumbnail" ? 78 : 82 })
      .toBuffer({ resolveWithObject: true });

    const path = `${basePath}/${key}.webp`;
    const url = await uploadVariant(input.adminClient, path, data);
    variants[key] = {
      path,
      url,
      width: info.width ?? width,
      height: info.height ?? width,
      format: "webp",
    };
  }

  return {
    id: input.mediaId,
    kind: "image",
    title: optionalString(input.title),
    altText: optionalString(input.altText),
    fit,
    status: "ready" as MediaStatus,
    originalFilename: optionalString(input.originalFilename),
    error: null,
    uploadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    variants,
  };
}
