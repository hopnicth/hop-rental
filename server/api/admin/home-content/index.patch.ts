import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  buildFeaturedProductPayload,
  buildFeaturedAssetPayload,
  buildHomeBannerPayload,
  buildHomeLinkCardPayload,
  buildHomePartnerLogoPayload,
} from "~~/server/utils/admin-home";
import { asNonEmptyString } from "~~/server/utils/admin-catalog";
import { removeHomeMediaByPublicUrl } from "~~/server/utils/home-media";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;
  const resource = body.resource;
  const id = asNonEmptyString(body.id, "id");

  if (resource === "banner") {
    const payload = buildHomeBannerPayload(body);
    const { data: existing, error: fetchError } = await adminClient
      .from("home_banners")
      .select("id, image_url, mobile_image_url")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      throw createError({
        statusCode: 500,
        statusMessage: fetchError.message,
      });
    }

    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: "Banner not found" });
    }

    const { error } = await adminClient
      .from("home_banners")
      .update(payload)
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      });
    }

    if (existing.image_url !== payload.image_url) {
      await removeHomeMediaByPublicUrl(adminClient, existing.image_url);
    }

    if (existing.mobile_image_url !== payload.mobile_image_url) {
      await removeHomeMediaByPublicUrl(adminClient, existing.mobile_image_url);
    }

    return { ok: true };
  }

  if (resource === "linkCard") {
    const payload = buildHomeLinkCardPayload(body);
    const { data: existing, error: fetchError } = await adminClient
      .from("home_link_cards")
      .select("id, image_url")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      throw createError({
        statusCode: 500,
        statusMessage: fetchError.message,
      });
    }

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: "Link card not found",
      });
    }

    const { error } = await adminClient
      .from("home_link_cards")
      .update(payload)
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      });
    }

    if (existing.image_url && existing.image_url !== payload.image_url) {
      await removeHomeMediaByPublicUrl(adminClient, existing.image_url);
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

  if (resource === "partnerLogo") {
    const payload = buildHomePartnerLogoPayload(body);
    const { data: existing, error: fetchError } = await adminClient
      .from("home_partner_logos")
      .select("id, image_url")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      throw createError({
        statusCode: 500,
        statusMessage: fetchError.message,
      });
    }

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: "Partner logo not found",
      });
    }

    const { error } = await adminClient
      .from("home_partner_logos")
      .update(payload)
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      });
    }

    if (existing.image_url !== payload.image_url) {
      await removeHomeMediaByPublicUrl(adminClient, existing.image_url);
    }

    return { ok: true };
  }

  throw createError({
    statusCode: 422,
    statusMessage: "Unsupported home content resource",
  });
});
