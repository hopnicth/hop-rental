import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  extractHomeStoragePathFromPublicUrl,
  removeHomeMediaPath,
} from "~~/server/utils/home-media";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = await readBody<{ url?: string }>(event);
  const url = body?.url?.trim() || "";

  if (!url) {
    throw createError({ statusCode: 400, statusMessage: "url is required" });
  }

  const path = extractHomeStoragePathFromPublicUrl(url);
  if (!path) {
    throw createError({
      statusCode: 422,
      statusMessage: "url must point to a home-content storage object",
    });
  }

  const removed = await removeHomeMediaPath(adminClient, path);
  if (!removed) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete uploaded image",
    });
  }

  return { ok: true, path };
});