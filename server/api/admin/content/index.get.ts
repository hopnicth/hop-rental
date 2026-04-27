import { createError, defineEventHandler, getQuery } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_CONTENT_PAGE_SELECT,
  mapContentPageRow,
} from "~~/server/utils/content-pages";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const query = getQuery(event);
  const contentType = typeof query.contentType === "string" ? query.contentType : "";

  let request = adminClient
    .from("content_pages")
    .select(ADMIN_CONTENT_PAGE_SELECT)
    .order("content_type", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (["blog", "service", "promotion"].includes(contentType)) {
    request = request.eq("content_type", contentType);
  }

  const { data, error } = await request;
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return { items: (data ?? []).map(mapContentPageRow) };
});