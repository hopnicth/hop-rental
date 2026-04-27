import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_CONTENT_PAGE_SELECT,
  buildContentPagePayload,
  mapContentPageRow,
} from "~~/server/utils/content-pages";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;

  const { data, error } = await adminClient
    .from("content_pages")
    .insert(buildContentPagePayload(body))
    .select(ADMIN_CONTENT_PAGE_SELECT)
    .single();

  if (error) {
    throw createError({
      statusCode: error.code === "23505" ? 409 : 500,
      statusMessage: error.message,
    });
  }

  return { item: mapContentPageRow(data) };
});