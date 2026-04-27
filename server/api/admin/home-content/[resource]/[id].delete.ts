import { createError, defineEventHandler, getRouterParam } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import { removeHomeMediaByPublicUrl } from "~~/server/utils/home-media";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const resource = getRouterParam(event, "resource");
  const id = getRouterParam(event, "id");

  if (!resource || !id) {
    throw createError({
      statusCode: 400,
      statusMessage: "resource and id are required",
    });
  }

  if (resource === "banner") {
    const { data: existing, error: fetchError } = await adminClient
      .from("home_banners")
      .select("id, image_url, mobile_image_url")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      throw createError({ statusCode: 500, statusMessage: fetchError.message });
    }
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: "Banner not found" });
    }

    const { error } = await adminClient
      .from("home_banners")
      .delete()
      .eq("id", id);

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }

    await Promise.all([
      removeHomeMediaByPublicUrl(adminClient, existing.image_url),
      removeHomeMediaByPublicUrl(adminClient, existing.mobile_image_url),
    ]);

    return { ok: true };
  }

  if (resource === "linkCard") {
    const { data: existing, error: fetchError } = await adminClient
      .from("home_link_cards")
      .select("id, image_url")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      throw createError({ statusCode: 500, statusMessage: fetchError.message });
    }
    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: "Link card not found",
      });
    }

    const { error } = await adminClient
      .from("home_link_cards")
      .delete()
      .eq("id", id);

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }

    await removeHomeMediaByPublicUrl(adminClient, existing.image_url);
    return { ok: true };
  }

  if (resource === "partnerLogo") {
    const { data: existing, error: fetchError } = await adminClient
      .from("home_partner_logos")
      .select("id, image_url")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      throw createError({ statusCode: 500, statusMessage: fetchError.message });
    }
    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: "Partner logo not found",
      });
    }

    const { error } = await adminClient
      .from("home_partner_logos")
      .delete()
      .eq("id", id);

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }

    await removeHomeMediaByPublicUrl(adminClient, existing.image_url);
    return { ok: true };
  }

  if (resource === "featuredProduct") {
    const { data, error } = await adminClient
      .from("home_featured_products")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }
    if (!data) {
      throw createError({
        statusCode: 404,
        statusMessage: "Featured product not found",
      });
    }

    return { ok: true };
  }

  if (resource === "featuredAsset") {
    const { data, error } = await adminClient
      .from("home_featured_assets")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }
    if (!data) {
      throw createError({
        statusCode: 404,
        statusMessage: "Featured asset not found",
      });
    }

    return { ok: true };
  }

  throw createError({
    statusCode: 422,
    statusMessage: "Unsupported home content resource",
  });
});