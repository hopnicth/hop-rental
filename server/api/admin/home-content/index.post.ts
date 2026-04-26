import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_HOME_BANNER_SELECT,
  ADMIN_HOME_FEATURED_PRODUCT_SELECT,
  ADMIN_HOME_FEATURED_ASSET_SELECT,
  ADMIN_HOME_LINK_CARD_SELECT,
  buildFeaturedProductPayload,
  buildFeaturedAssetPayload,
  buildHomeBannerPayload,
  buildHomeLinkCardPayload,
} from "~~/server/utils/admin-home";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;
  const resource = body.resource;

  if (resource === "banner") {
    const { data, error } = await adminClient
      .from("home_banners")
      .insert(buildHomeBannerPayload(body))
      .select(ADMIN_HOME_BANNER_SELECT)
      .single();

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      });
    }

    return { item: data };
  }

  if (resource === "linkCard") {
    const { data, error } = await adminClient
      .from("home_link_cards")
      .insert(buildHomeLinkCardPayload(body))
      .select(ADMIN_HOME_LINK_CARD_SELECT)
      .single();

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      });
    }

    return { item: data };
  }

  if (resource === "featuredProduct") {
    const { data, error } = await adminClient
      .from("home_featured_products")
      .insert(buildFeaturedProductPayload(body))
      .select(ADMIN_HOME_FEATURED_PRODUCT_SELECT)
      .single();

    if (error) {
      throw createError({
        statusCode: error.code === "23505" ? 409 : 500,
        statusMessage: error.message,
      });
    }

    return { item: data };
  }

  if (resource === "featuredAsset") {
    const { data, error } = await adminClient
      .from("home_featured_assets")
      .insert(buildFeaturedAssetPayload(body))
      .select(ADMIN_HOME_FEATURED_ASSET_SELECT)
      .single();

    if (error) {
      throw createError({
        statusCode: error.code === "23505" ? 409 : 500,
        statusMessage: error.message,
      });
    }

    return { item: data };
  }

  throw createError({
    statusCode: 422,
    statusMessage: "Unsupported home content resource",
  });
});