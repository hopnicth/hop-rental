import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_CONTENT_PAGE_SELECT,
  buildContentPagePayload,
  buildServiceProviderPayload,
  extractLinkedIds,
  mapContentPageRow,
  syncContentPageLinks,
  upsertServiceProvider,
} from "~~/server/utils/content-pages";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;

  const payload = buildContentPagePayload(body);
  const providerPayload = buildServiceProviderPayload(body);
  const { productIds, assetIds } = extractLinkedIds(body, payload.content_type);

  await upsertServiceProvider(adminClient, providerPayload);

  const { data: inserted, error: insertError } = await adminClient
    .from("content_pages")
    .insert(payload)
    .select("id")
    .single();

  if (insertError) {
    throw createError({
      statusCode: insertError.code === "23505" ? 409 : 500,
      statusMessage: insertError.message,
    });
  }

  await syncContentPageLinks(adminClient, inserted.id, productIds, assetIds);

  const { data, error } = await adminClient
    .from("content_pages")
    .select(ADMIN_CONTENT_PAGE_SELECT)
    .eq("id", inserted.id)
    .single();

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return { item: mapContentPageRow(data) };
});
