import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_ASSET_DETAIL_SELECT,
  ADMIN_ASSET_DETAIL_SELECT_LEGACY,
  buildAssetPayload,
  isMissingAssetSearchKeywordsColumn,
  mapAssetDetail,
  stripAssetSearchKeywords,
} from "~~/server/utils/admin-asset";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const payload = buildAssetPayload(body, "update");

  if (Object.keys(payload).length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: "No updatable fields supplied",
    });
  }

  let { data, error } = await adminClient
    .from("assets")
    .update(payload)
    .eq("id", id)
    .select(ADMIN_ASSET_DETAIL_SELECT)
    .single();

  if (isMissingAssetSearchKeywordsColumn(error)) {
    const fallback = await adminClient
      .from("assets")
      .update(stripAssetSearchKeywords(payload))
      .eq("id", id)
      .select(ADMIN_ASSET_DETAIL_SELECT_LEGACY)
      .single();

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    const statusCode = error.code === "23505" ? 409 : 500;
    throw createError({ statusCode, statusMessage: error.message });
  }

  return { item: mapAssetDetail(data as Record<string, unknown>) };
});
