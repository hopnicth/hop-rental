import { createError } from "h3";
import { CATALOG_MEDIA_BUCKET } from "~~/server/utils/catalog-media";

export type AssetDetailBlockRecord = {
  key: string;
  title?: Record<string, string>;
  body?: Record<string, string>;
  items?: string[];
  images?: Array<{
    id: string;
    url: string;
    variants?: Record<string, string>;
    caption?: string;
    altText?: string;
  }>;
  documents?: Array<{
    id: string;
    url: string;
    kind: string;
    title: string;
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
  }>;
};

export function readDetailBlocks(value: unknown): AssetDetailBlockRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is AssetDetailBlockRecord => {
      return (
        !!item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof (item as { key?: unknown }).key === "string"
      );
    })
    .map((entry) => ({ ...entry }));
}

export function findOrCreateBlock(
  blocks: AssetDetailBlockRecord[],
  blockKey: string,
): { blocks: AssetDetailBlockRecord[]; index: number } {
  const trimmed = (blockKey ?? "").trim();
  if (!trimmed) {
    throw createError({
      statusCode: 422,
      statusMessage: "blockKey is required",
    });
  }
  const existing = blocks.findIndex((entry) => entry.key === trimmed);
  if (existing >= 0) return { blocks, index: existing };
  const next = [...blocks, { key: trimmed }];
  return { blocks: next, index: next.length - 1 };
}

export function buildBlockImagePath(
  assetId: string,
  blockKey: string,
  imageId: string,
  variant: string,
) {
  return `assets/${assetId}/blocks/${blockKey}/images/${imageId}/${variant}.webp`;
}

export function buildBlockDocumentPath(
  assetId: string,
  blockKey: string,
  docId: string,
  extension: string,
) {
  const safeExt = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `assets/${assetId}/blocks/${blockKey}/documents/${docId}.${safeExt}`;
}

/**
 * Best-effort delete of every storage object that lives under the given prefix.
 * Failures are logged but do not surface as request errors so a partial cleanup
 * never blocks a metadata mutation.
 */
export async function removeBlockStorageFolder(
  adminClient: any,
  prefix: string,
) {
  try {
    const { data: entries, error } = await adminClient.storage
      .from(CATALOG_MEDIA_BUCKET)
      .list(prefix, { limit: 100 });
    if (error || !Array.isArray(entries) || entries.length === 0) return;
    const paths: string[] = [];
    for (const entry of entries) {
      if (entry?.name) paths.push(`${prefix}/${entry.name}`);
    }
    if (paths.length === 0) return;
    await adminClient.storage.from(CATALOG_MEDIA_BUCKET).remove(paths);
  } catch (err) {
    console.warn("[asset-detail-blocks] storage cleanup failed:", err);
  }
}
