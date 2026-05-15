import { createError } from "h3";
import sharp from "sharp";
import { CATALOG_MEDIA_BUCKET } from "./catalog-media";

export const CONTENT_MEDIA_BUCKET = CATALOG_MEDIA_BUCKET;
export const CONTENT_MEDIA_PREFIX = "content-pages";
export type ContentUploadKind = "image" | "file";
type StorageAdminClient = {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<{ error: unknown }>;
    };
  };
};

function fail422(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message });
}

export function asContentUploadKind(value: unknown): ContentUploadKind {
  if (value === "image" || value === "file") return value;
  fail422("kind must be image or file");
}

export function buildContentMediaPath(input: {
  kind: ContentUploadKind;
  extension: "webp" | "pdf";
}) {
  const dateKey = new Date().toISOString().slice(0, 10);
  return `${CONTENT_MEDIA_PREFIX}/${input.kind}/${dateKey}/${crypto.randomUUID()}.${input.extension}`;
}

export async function processContentImageUpload(buffer: Buffer) {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    contentType: "image/webp",
    width: info.width ?? 1600,
    height: info.height ?? null,
  };
}

export function extractContentStoragePathFromPublicUrl(publicUrl: unknown) {
  if (typeof publicUrl !== "string" || publicUrl.trim().length === 0)
    return null;

  try {
    const pathname = new URL(publicUrl).pathname;
    const marker = `/storage/v1/object/public/${CONTENT_MEDIA_BUCKET}/`;
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const path = decodeURIComponent(
      pathname.slice(markerIndex + marker.length),
    );
    return path.startsWith(`${CONTENT_MEDIA_PREFIX}/`) ? path : null;
  } catch {
    return null;
  }
}

export async function removeContentMediaPath(
  adminClient: StorageAdminClient,
  path: unknown,
) {
  if (
    typeof path !== "string" ||
    !path.startsWith(`${CONTENT_MEDIA_PREFIX}/`)
  ) {
    return false;
  }

  try {
    const { error } = await adminClient.storage
      .from(CONTENT_MEDIA_BUCKET)
      .remove([path]);
    if (error) {
      console.warn("[content-media] failed to remove storage object:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[content-media] failed to remove storage object:", error);
    return false;
  }
}

export async function removeContentMediaByPublicUrl(
  adminClient: StorageAdminClient,
  publicUrl: unknown,
) {
  const path = extractContentStoragePathFromPublicUrl(publicUrl);
  if (!path) return false;
  return await removeContentMediaPath(adminClient, path);
}

export function collectContentMediaUrls(
  value: unknown,
  urls = new Set<string>(),
) {
  if (typeof value === "string") {
    if (extractContentStoragePathFromPublicUrl(value)) urls.add(value);
    return urls;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectContentMediaUrls(item, urls);
    return urls;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value))
      collectContentMediaUrls(item, urls);
  }

  return urls;
}
