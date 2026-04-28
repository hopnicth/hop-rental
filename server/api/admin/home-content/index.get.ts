import { createError, defineEventHandler } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_HOME_BANNER_SELECT,
  ADMIN_HOME_FEATURED_PRODUCT_SELECT,
  ADMIN_HOME_FEATURED_ASSET_SELECT,
  ADMIN_HOME_LINK_CARD_SELECT,
  ADMIN_HOME_PARTNER_LOGO_SELECT,
} from "~~/server/utils/admin-home";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);

  const [
    bannersResult,
    linkCardsResult,
    featuredProductsResult,
    featuredAssetsResult,
    partnerLogosResult,
    productsResult,
    assetsResult,
    contentPagesResult,
  ] = await Promise.all([
    adminClient
      .from("home_banners")
      .select(ADMIN_HOME_BANNER_SELECT)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false }),
    adminClient
      .from("home_link_cards")
      .select(ADMIN_HOME_LINK_CARD_SELECT)
      .order("section_key", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false }),
    adminClient
      .from("home_featured_products")
      .select(ADMIN_HOME_FEATURED_PRODUCT_SELECT)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false }),
    adminClient
      .from("home_featured_assets")
      .select(ADMIN_HOME_FEATURED_ASSET_SELECT)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false }),
    adminClient
      .from("home_partner_logos")
      .select(ADMIN_HOME_PARTNER_LOGO_SELECT)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false }),
    adminClient
      .from("products")
      .select("id, slug, name_th, is_hidden")
      .order("updated_at", { ascending: false }),
    adminClient
      .from("assets")
      .select("id, code, slug, name_th, status, is_hidden")
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false }),
    adminClient
      .from("content_pages")
      .select(
        "id, content_type, slug, title_th, title_en, excerpt_th, excerpt_en, cover_image_url, is_active",
      )
      .in("content_type", ["promotion", "service"])
      .order("content_type", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false }),
  ]);

  const errors = [
    bannersResult.error,
    linkCardsResult.error,
    featuredProductsResult.error,
    featuredAssetsResult.error,
    partnerLogosResult.error,
    productsResult.error,
    assetsResult.error,
    contentPagesResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw createError({
      statusCode: 500,
      statusMessage:
        errors[0]?.message ?? "Failed to load home content admin data",
    });
  }

  return {
    banners: (bannersResult.data ?? []).map((row) => ({
      id: row.id,
      titleTh: row.title_th,
      titleEn: row.title_en,
      titleCn: row.title_cn ?? "",
      titleJp: row.title_jp ?? "",
      subtitleTh: row.subtitle_th,
      subtitleEn: row.subtitle_en,
      subtitleCn: row.subtitle_cn ?? "",
      subtitleJp: row.subtitle_jp ?? "",
      ctaLabelTh: row.cta_label_th,
      ctaLabelEn: row.cta_label_en,
      ctaLabelCn: row.cta_label_cn ?? "",
      ctaLabelJp: row.cta_label_jp ?? "",
      imageUrl: row.image_url,
      mobileImageUrl: row.mobile_image_url ?? "",
      linkUrl: row.link_url,
      linkTarget: row.link_target === "_blank" ? "_blank" : "_self",
      sortOrder: Number(row.sort_order ?? 0),
      isActive: row.is_active !== false,
      updatedAt: row.updated_at,
    })),
    linkCards: (linkCardsResult.data ?? []).map((row) => {
      const sectionKey =
        row.section_key === "service" ? "service" : "promotion";
      const page = (row as { content_page?: any }).content_page ?? null;
      const pageBase = sectionKey === "service" ? "/services" : "/promotions";
      const linkUrlFromPage = page?.slug ? `${pageBase}/${page.slug}` : "";

      return {
        id: row.id,
        sectionKey,
        contentPageId: row.content_page_id ?? null,
        contentPageSlug: page?.slug ?? "",
        contentPageActive: page ? page.is_active !== false : null,
        titleTh: page?.title_th ?? row.title_th ?? "",
        titleEn: page?.title_en ?? row.title_en ?? "",
        titleCn: row.title_cn ?? "",
        titleJp: row.title_jp ?? "",
        descriptionTh: page?.excerpt_th ?? row.description_th ?? "",
        descriptionEn: page?.excerpt_en ?? row.description_en ?? "",
        descriptionCn: row.description_cn ?? "",
        descriptionJp: row.description_jp ?? "",
        imageUrl: page?.cover_image_url ?? row.image_url ?? "",
        linkUrl: page ? linkUrlFromPage : (row.link_url ?? ""),
        linkTarget: row.link_target === "_blank" ? "_blank" : "_self",
        sortOrder: Number(row.sort_order ?? 0),
        isActive: row.is_active !== false,
        updatedAt: row.updated_at,
      };
    }),
    featuredProducts: (featuredProductsResult.data ?? []).map((row) => ({
      id: row.id,
      productId: row.product_id,
      sortOrder: Number(row.sort_order ?? 0),
      isActive: row.is_active !== false,
      productLabel: `${row.product?.name_th ?? row.product_id} · ${row.product?.slug ?? ""}`,
      productHidden: row.product?.is_hidden === true,
      updatedAt: row.updated_at,
    })),
    featuredAssets: (featuredAssetsResult.data ?? []).map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      sortOrder: Number(row.sort_order ?? 0),
      isActive: row.is_active !== false,
      assetLabel: `${row.asset?.code ?? "—"} · ${row.asset?.name_th ?? row.asset_id}`,
      assetHidden: row.asset?.is_hidden === true,
      assetStatus: row.asset?.status ?? "draft",
      updatedAt: row.updated_at,
    })),
    partnerLogos: (partnerLogosResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      imageUrl: row.image_url,
      linkUrl: row.link_url,
      linkTarget: row.link_target === "_blank" ? "_blank" : "_self",
      sortOrder: Number(row.sort_order ?? 0),
      isActive: row.is_active !== false,
      updatedAt: row.updated_at,
    })),
    productOptions: (productsResult.data ?? []).map((row) => ({
      value: row.id,
      label: `${row.name_th} · ${row.slug}`,
      isHidden: row.is_hidden === true,
    })),
    assetOptions: (assetsResult.data ?? []).map((row) => ({
      value: row.id,
      label: `${row.code} · ${row.name_th}`,
      status: row.status,
      isHidden: row.is_hidden === true,
    })),
    contentPageOptions: (contentPagesResult.data ?? []).map((row) => ({
      value: row.id,
      label: `${row.title_th || row.title_en} · ${row.slug}`,
      contentType: row.content_type as "promotion" | "service",
      slug: row.slug,
      isActive: row.is_active !== false,
    })),
  };
});
