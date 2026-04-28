import { createError, defineEventHandler, getQuery } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_CONTENT_PAGE_SELECT,
  mapContentPageRow,
} from "~~/server/utils/content-pages";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const query = getQuery(event);
  const contentType =
    typeof query.contentType === "string" ? query.contentType : "";

  let request = adminClient
    .from("content_pages")
    .select(ADMIN_CONTENT_PAGE_SELECT)
    .order("content_type", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (["blog", "service", "promotion", "review"].includes(contentType)) {
    request = request.eq("content_type", contentType);
  }

  const [pagesResult, productsResult, assetsResult] = await Promise.all([
    request,
    adminClient
      .from("products")
      .select("id, slug, name_th, is_hidden")
      .order("updated_at", { ascending: false }),
    adminClient
      .from("assets")
      .select("id, code, slug, name_th, status, is_hidden")
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false }),
  ]);

  if (pagesResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: pagesResult.error.message,
    });
  }
  if (productsResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: productsResult.error.message,
    });
  }
  if (assetsResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: assetsResult.error.message,
    });
  }

  const productOptions = (productsResult.data ?? []).map((row: any) => ({
    value: row.id as string,
    label: `${row.name_th ?? row.slug}`,
    isHidden: row.is_hidden === true,
  }));

  const assetOptions = (assetsResult.data ?? []).map((row: any) => ({
    value: row.id as string,
    label: `${row.code ?? ""} · ${row.name_th ?? row.slug}`.trim(),
    isHidden: row.is_hidden === true || row.status !== "active",
  }));

  return {
    items: (pagesResult.data ?? []).map(mapContentPageRow),
    productOptions,
    assetOptions,
  };
});
