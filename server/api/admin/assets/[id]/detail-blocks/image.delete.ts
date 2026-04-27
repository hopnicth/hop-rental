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
import {
  readDetailBlocks,
  removeBlockStorageFolder,
} from "~~/server/utils/asset-detail-blocks";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const body = await readBody<{ blockKey?: string; imageId?: string }>(event);
  const blockKey = (body?.blockKey ?? "").trim();
  const imageId = (body?.imageId ?? "").trim();
  if (!blockKey || !imageId) {
    throw createError({
      statusCode: 422,
      statusMessage: "blockKey and imageId are required",
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
  const remaining = (block.images ?? []).filter((img) => img.id !== imageId);
  blocks[blockIndex] = { ...block, images: remaining };

  const { data: updated, error: updateError } = await adminClient
    .from("assets")
    .update({ detail_blocks: blocks })
    .eq("id", id)
    .select(ADMIN_ASSET_DETAIL_SELECT)
    .single();
  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message });
  }

  await removeBlockStorageFolder(
    adminClient,
    `assets/${id}/blocks/${blockKey}/images/${imageId}`,
  );

  return {
    item: mapAssetDetail(updated as Record<string, unknown>),
  };
});
