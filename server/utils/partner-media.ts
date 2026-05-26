import { createError } from "h3";
import sharp from "sharp";
import { CATALOG_MEDIA_BUCKET } from "./catalog-media";

// ── Constants ──────────────────────────────────────────────────────────────
export const PARTNER_MEDIA_BUCKET = CATALOG_MEDIA_BUCKET;
export const PARTNER_MEDIA_PREFIX = "partner-profiles";
export const PARTNER_MEDIA_MAX_BYTES = 15 * 1024 * 1024; // 15 MB

// ── Types ──────────────────────────────────────────────────────────────────
export type PartnerUploadKind = "thumbnail" | "cover";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type StorageAdminClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        buffer: Buffer,
        options: { contentType: string; upsert: boolean },
      ): Promise<{ error: { message?: string } | null }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
      remove(paths: string[]): Promise<{ error: unknown }>;
    };
  };
};

// ── Kind validator ─────────────────────────────────────────────────────────
export function asPartnerUploadKind(value: unknown): PartnerUploadKind {
  if (value === "thumbnail" || value === "cover") return value;
  throw createError({
    statusCode: 422,
    statusMessage: "kind must be thumbnail or cover",
  });
}

// ── MIME validator ─────────────────────────────────────────────────────────
export function validatePartnerMediaMime(fileType: unknown): void {
  const normalized =
    typeof fileType === "string" ? fileType.toLowerCase().trim() : "";
  if (!ALLOWED_MIME_TYPES.has(normalized)) {
    throw createError({
      statusCode: 415,
      statusMessage: "Only JPEG, PNG, or WebP images are supported",
    });
  }
}

// ── Size validator ─────────────────────────────────────────────────────────
export function validatePartnerMediaSize(byteLength: number): void {
  if (byteLength > PARTNER_MEDIA_MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "Image file must be 15 MB or smaller",
    });
  }
}

// ── Image processing config ────────────────────────────────────────────────
export const PARTNER_IMAGE_CONFIG = {
  thumbnail: { width: 800, height: 800, fit: "cover" as const, quality: 80 },
  cover: { width: 1600, height: undefined, quality: 82 },
} as const;

// ── Sharp processing ───────────────────────────────────────────────────────
export async function processPartnerImageUpload(input: {
  buffer: Buffer;
  kind: PartnerUploadKind;
}) {
  const config = PARTNER_IMAGE_CONFIG[input.kind];
  let pipeline = sharp(input.buffer).rotate();

  if (input.kind === "thumbnail") {
    pipeline = pipeline.resize({
      width: config.width,
      height: config.height,
      fit: "cover",
      withoutEnlargement: true,
    });
  } else {
    // cover: width-only resize, natural height
    pipeline = pipeline.resize({
      width: config.width,
      withoutEnlargement: true,
    });
  }

  const { data, info } = await pipeline
    .webp({ quality: config.quality })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    contentType: "image/webp" as const,
    width: info.width ?? config.width,
    height: info.height ?? null,
  };
}

// ── Storage path builder ───────────────────────────────────────────────────
export function buildPartnerMediaPath(
  partnerId: string,
  kind: PartnerUploadKind,
): string {
  return `${PARTNER_MEDIA_PREFIX}/${partnerId}/${kind}-${crypto.randomUUID()}.webp`;
}

// ── Safe path extractor ────────────────────────────────────────────────────
// Only accepts URLs pointing to partner-profiles/{partnerId}/*.webp objects
// in the catalog-media bucket. Returns null for anything else.
export function extractPartnerStoragePathFromPublicUrl(
  publicUrl: unknown,
  partnerId: string,
): string | null {
  if (typeof publicUrl !== "string" || publicUrl.trim().length === 0) {
    return null;
  }

  try {
    const pathname = new URL(publicUrl).pathname;
    const marker = `/storage/v1/object/public/${PARTNER_MEDIA_BUCKET}/`;
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const path = decodeURIComponent(
      pathname.slice(markerIndex + marker.length),
    );

    // Safety: must be under partner-profiles/{partnerId}/ and end in .webp
    const expectedPrefix = `${PARTNER_MEDIA_PREFIX}/${partnerId}/`;
    if (!path.startsWith(expectedPrefix)) return null;
    if (!path.endsWith(".webp")) return null;

    return path;
  } catch {
    return null;
  }
}

// ── Safe storage removal ───────────────────────────────────────────────────
// Best-effort: logs and returns false on failure rather than throwing.
export async function removePartnerMediaByPublicUrl(
  adminClient: StorageAdminClient,
  publicUrl: unknown,
  partnerId: string,
): Promise<boolean> {
  const path = extractPartnerStoragePathFromPublicUrl(publicUrl, partnerId);
  if (!path) return false;

  try {
    const { error } = await adminClient.storage
      .from(PARTNER_MEDIA_BUCKET)
      .remove([path]);
    if (error) {
      console.warn("[partner-media] failed to remove storage object:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[partner-media] failed to remove storage object:", err);
    return false;
  }
}
