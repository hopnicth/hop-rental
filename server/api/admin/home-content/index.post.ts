import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_HOME_BANNER_SELECT,
  ADMIN_HOME_FEATURED_PRODUCT_SELECT,
  ADMIN_HOME_FEATURED_ASSET_SELECT,
  ADMIN_HOME_LINK_CARD_SELECT,
  ADMIN_HOME_PARTNER_LOGO_SELECT,
  HOME_FEATURED_LIMIT,
  buildFeaturedProductPayload,
  buildFeaturedAssetPayload,
  buildHomeBannerPayload,
  buildHomeLinkCardPayload,
  buildHomePartnerLogoPayload,
} from "~~/server/utils/admin-home";

type CuratedLimitClient = {
  from(table: "home_featured_products" | "home_featured_assets"): {
    select(
      columns: string,
      options: { count: "exact"; head: true },
    ): Promise<{ count: number | null; error: { message: string } | null }>;
  };
};

async function assertCuratedLimit(
  adminClient: CuratedLimitClient,
  table: "home_featured_products" | "home_featured_assets",
  label: string,
) {
  const { count, error } = await adminClient
    .from(table)
    .select("id", { count: "exact", head: true });

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    });
  }

  if ((count ?? 0) >= HOME_FEATURED_LIMIT) {
    throw createError({
      statusCode: 409,
      statusMessage: `${label} already has ${HOME_FEATURED_LIMIT} items. Remove one before adding another.`,
    });
  }
}

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
    await assertCuratedLimit(
      adminClient,
      "home_featured_products",
      "Featured product rail",
    );

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
    await assertCuratedLimit(
      adminClient,
      "home_featured_assets",
      "Featured asset rail",
    );

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

  if (resource === "partnerLogo") {
    const { data, error } = await adminClient
      .from("home_partner_logos")
      .insert(buildHomePartnerLogoPayload(body))
      .select(ADMIN_HOME_PARTNER_LOGO_SELECT)
      .single();

    if (error) {
      throw createError({
        statusCode: 500,
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
