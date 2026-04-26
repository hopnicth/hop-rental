import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  buildFeaturedProductPayload,
  buildFeaturedAssetPayload,
  buildHomeBannerPayload,
  buildHomeLinkCardPayload,
} from "~~/server/utils/admin-home";
import { asNonEmptyString } from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;
  const resource = body.resource;
  const id = asNonEmptyString(body.id, "id");

  if (resource === "banner") {
    const { error } = await adminClient
      .from("home_banners")
      .update(buildHomeBannerPayload(body))
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      });
    }

    return { ok: true };
  }

  if (resource === "linkCard") {
    const { error } = await adminClient
      .from("home_link_cards")
      .update(buildHomeLinkCardPayload(body))
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      });
    }

    return { ok: true };
  }

  if (resource === "featuredProduct") {
    const { error } = await adminClient
      .from("home_featured_products")
      .update({
        sort_order: buildFeaturedProductPayload(body).sort_order,
        is_active: buildFeaturedProductPayload(body).is_active,
      })
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      });
    }

    return { ok: true };
  }

  if (resource === "featuredAsset") {
    const { error } = await adminClient
      .from("home_featured_assets")
      .update({
        sort_order: buildFeaturedAssetPayload(body).sort_order,
        is_active: buildFeaturedAssetPayload(body).is_active,
      })
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      });
    }

    return { ok: true };
  }

  throw createError({
    statusCode: 422,
    statusMessage: "Unsupported home content resource",
  });
});