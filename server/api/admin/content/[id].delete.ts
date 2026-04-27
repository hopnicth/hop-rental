import { createError, defineEventHandler, getRouterParam } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  collectContentMediaUrls,
  removeContentMediaByPublicUrl,
} from "~~/server/utils/content-media";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "id is required" });

  const { data: existing, error: fetchError } = await adminClient
    .from("content_pages")
    .select("id, cover_image_url, blocks")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: fetchError.message });
  }
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Content page not found" });
  }

  const { error } = await adminClient.from("content_pages").delete().eq("id", id);
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });

  const urls = collectContentMediaUrls(existing.blocks);
  if (existing.cover_image_url) urls.add(existing.cover_image_url);
  await Promise.all([...urls].map((url) => removeContentMediaByPublicUrl(adminClient, url)));

  return { ok: true };
});