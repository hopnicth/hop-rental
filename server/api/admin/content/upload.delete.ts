import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  extractContentStoragePathFromPublicUrl,
  removeContentMediaPath,
} from "~~/server/utils/content-media";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = await readBody<{ url?: string }>(event);
  const url = body?.url?.trim() || "";
  if (!url) throw createError({ statusCode: 400, statusMessage: "url is required" });

  const path = extractContentStoragePathFromPublicUrl(url);
  if (!path) {
    throw createError({
      statusCode: 422,
      statusMessage: "url must point to a content-pages storage object",
    });
  }

  const removed = await removeContentMediaPath(adminClient, path);
  if (!removed) {
    throw createError({ statusCode: 500, statusMessage: "Failed to delete uploaded file" });
  }

  return { ok: true, path };
});