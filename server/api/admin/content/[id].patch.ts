import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import { buildContentPagePayload } from "~~/server/utils/content-pages";
import { removeContentMediaByPublicUrl } from "~~/server/utils/content-media";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "id is required" });

  const body = (await readBody(event)) as Record<string, unknown>;
  const payload = buildContentPagePayload(body);

  const { data: existing, error: fetchError } = await adminClient
    .from("content_pages")
    .select("id, cover_image_url")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: fetchError.message });
  }
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Content page not found" });
  }

  const { error } = await adminClient
    .from("content_pages")
    .update(payload)
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    throw createError({
      statusCode: error.code === "23505" ? 409 : 500,
      statusMessage: error.message,
    });
  }

  if (existing.cover_image_url !== payload.cover_image_url) {
    await removeContentMediaByPublicUrl(adminClient, existing.cover_image_url);
  }

  return { ok: true };
});