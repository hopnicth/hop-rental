import {
  createError,
  defineEventHandler,
  getRouterParam,
  readBody,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_ASSET_DETAIL_SELECT,
  mapAssetDetail,
} from "~~/server/utils/admin-asset";
import { readDetailBlocks } from "~~/server/utils/asset-detail-blocks";
import { CATALOG_MEDIA_BUCKET } from "~~/server/utils/catalog-media";

function publicUrlToStoragePath(url: string) {
  const marker = `/object/public/${CATALOG_MEDIA_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return url.slice(idx + marker.length);
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const body = await readBody<{ blockKey?: string; documentId?: string }>(
    event,
  );
  const blockKey = (body?.blockKey ?? "").trim();
  const documentId = (body?.documentId ?? "").trim();
  if (!blockKey || !documentId) {
    throw createError({
      statusCode: 422,
      statusMessage: "blockKey and documentId are required",
    });
  }

  const { data: existing, error: fetchError } = await adminClient
    .from("assets")
    .select("id, detail_blocks")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: fetchError.message });
  }
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Asset not found" });
  }

  const blocks = readDetailBlocks(existing.detail_blocks);
  const blockIndex = blocks.findIndex((entry) => entry.key === blockKey);
  if (blockIndex < 0) {
    throw createError({ statusCode: 404, statusMessage: "Block not found" });
  }
  const block = blocks[blockIndex];
  const target = (block.documents ?? []).find((doc) => doc.id === documentId);
  const remaining = (block.documents ?? []).filter(
    (doc) => doc.id !== documentId,
  );
  blocks[blockIndex] = { ...block, documents: remaining };

  const { data: updated, error: updateError } = await adminClient
    .from("assets")
    .update({ detail_blocks: blocks })
    .eq("id", id)
    .select(ADMIN_ASSET_DETAIL_SELECT)
    .single();
  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message });
  }

  if (target?.url) {
    const storagePath = publicUrlToStoragePath(target.url);
    if (storagePath) {
      try {
        await adminClient.storage
          .from(CATALOG_MEDIA_BUCKET)
          .remove([storagePath]);
      } catch (err) {
        console.warn(
          "[asset-detail-blocks] document storage cleanup failed:",
          err,
        );
      }
    }
  }

  return {
    item: mapAssetDetail(updated as Record<string, unknown>),
  };
});
