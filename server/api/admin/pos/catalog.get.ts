import { createError, defineEventHandler, getQuery } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";
import {
  ADMIN_POS_ASSET_SELECT,
  isRentablePosAsset,
  mapPosAssetCatalogItem,
  type AdminPosAssetRow,
} from "~~/server/utils/admin-pos";

function safeTerm(value: string): string {
  return `*${value.replace(/[%_*]/g, "")}*`;
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdminReadAccess(event);
  const q = getQuery(event);
  const search = typeof q.search === "string" ? q.search.trim() : "";

  let query = adminClient
    .from("assets")
    .select(ADMIN_POS_ASSET_SELECT)
    .eq("status", "active")
    .eq("is_hidden", false)
    .eq("daily_enabled", true)
    .gt("daily_rate", 0)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(80);

  if (search) {
    const term = safeTerm(search);
    query = query.or(
      `code.ilike.${term},slug.ilike.${term},name_th.ilike.${term},name_en.ilike.${term},brand.ilike.${term}`,
    );
  }

  const { data, error } = await query;
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });

  return {
    items: ((data ?? []) as AdminPosAssetRow[])
      .filter(isRentablePosAsset)
      .map(mapPosAssetCatalogItem),
  };
});
