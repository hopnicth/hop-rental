import { createError } from "h3";
import sharp from "sharp";
import { CATALOG_MEDIA_BUCKET } from "./catalog-media";

export const HOME_MEDIA_BUCKET = CATALOG_MEDIA_BUCKET;
export const HOME_MEDIA_PREFIX = "home-content";
type StorageAdminClient = {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<{ error: unknown }>;
    };
  };
};

export type HomeUploadKind =
  | "banner"
  | "banner-mobile"
  | "link-card"
  | "partner-logo";

const HOME_IMAGE_CONFIG = {
  banner: { width: 1600, height: 900, fit: "cover", quality: 84 },
  "banner-mobile": { width: 1080, height: 1080, fit: "cover", quality: 84 },
  "link-card": { width: 1200, height: 800, fit: "cover", quality: 82 },
  "partner-logo": { width: 600, height: 240, fit: "contain", quality: 82 },
} as const;

const UNSAFE_SVG_PATTERN = /<script|javascript:|\son[a-z]+\s*=|<foreignobject/i;

function fail422(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message });
}

export function asHomeUploadKind(value: unknown): HomeUploadKind {
  if (
    value === "banner" ||
    value === "banner-mobile" ||
    value === "link-card" ||
    value === "partner-logo"
  ) {
    return value;
  }

  fail422("kind must be banner, banner-mobile, link-card, or partner-logo");
}

export function buildHomeMediaPath(
  kind: HomeUploadKind,
  extension: "webp" | "svg" = "webp",
): string {
  const dateKey = new Date().toISOString().slice(0, 10);
  return `${HOME_MEDIA_PREFIX}/${kind}/${dateKey}/${crypto.randomUUID()}.${extension}`;
}

export async function processHomeImageUpload(input: {
  buffer: Buffer;
  kind: HomeUploadKind;
}) {
  const config = HOME_IMAGE_CONFIG[input.kind];
  const { data, info } = await sharp(input.buffer)
    .rotate()
    .resize({
      width: config.width,
      height: config.height,
      fit: config.fit,
      withoutEnlargement: true,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .webp({ quality: config.quality })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    contentType: "image/webp",
    width: info.width ?? config.width,
    height: info.height ?? config.height,
  };
}

export function processHomeSvgLogoUpload(input: { buffer: Buffer }) {
  const svgText = input.buffer.toString("utf8").trim();
  const config = HOME_IMAGE_CONFIG["partner-logo"];

  if (!svgText || !/<svg[\s>]/i.test(svgText)) {
    fail422("SVG file must contain a valid <svg> element");
  }

  if (UNSAFE_SVG_PATTERN.test(svgText)) {
    fail422("SVG file contains unsupported unsafe content");
  }

  return {
    buffer: Buffer.from(svgText, "utf8"),
    contentType: "image/svg+xml",
    width: config.width,
    height: config.height,
  };
}

export function extractHomeStoragePathFromPublicUrl(
  publicUrl: unknown,
  bucket = HOME_MEDIA_BUCKET,
): string | null {
  if (typeof publicUrl !== "string" || publicUrl.trim().length === 0) {
    return null;
  }

  try {
    const pathname = new URL(publicUrl).pathname;
    const marker = `/storage/v1/object/public/${bucket}/`;
    const markerIndex = pathname.indexOf(marker);

    if (markerIndex < 0) return null;

    const path = decodeURIComponent(
      pathname.slice(markerIndex + marker.length),
    );
    return path.startsWith(`${HOME_MEDIA_PREFIX}/`) ? path : null;
  } catch {
    return null;
  }
}

export async function removeHomeMediaPath(
  adminClient: StorageAdminClient,
  path: unknown,
) {
  if (typeof path !== "string" || !path.startsWith(`${HOME_MEDIA_PREFIX}/`)) {
    return false;
  }

  try {
    const { error } = await adminClient.storage
      .from(HOME_MEDIA_BUCKET)
      .remove([path]);
    if (error) {
      console.warn("[home-media] failed to remove storage object:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[home-media] failed to remove storage object:", error);
    return false;
  }
}

export async function removeHomeMediaByPublicUrl(
  adminClient: StorageAdminClient,
  publicUrl: unknown,
) {
  const path = extractHomeStoragePathFromPublicUrl(publicUrl);
  if (!path) return false;
  return await removeHomeMediaPath(adminClient, path);
}
