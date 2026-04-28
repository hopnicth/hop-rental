import { createError } from "h3";
import {
  asNonEmptyString,
  asNumber,
  asOptionalString,
} from "~~/server/utils/admin-catalog";

export const HOME_FEATURED_LIMIT = 15;

export const ADMIN_HOME_BANNER_SELECT =
  "id, title_th, title_en, title_cn, title_jp, subtitle_th, subtitle_en, subtitle_cn, subtitle_jp, cta_label_th, cta_label_en, cta_label_cn, cta_label_jp, image_url, mobile_image_url, link_url, link_target, sort_order, is_active, created_at, updated_at";

export const ADMIN_HOME_LINK_CARD_SELECT =
  "id, section_key, content_page_id, title_th, title_en, title_cn, title_jp, description_th, description_en, description_cn, description_jp, image_url, link_url, link_target, sort_order, is_active, created_at, updated_at, content_page:content_pages!content_page_id(id, content_type, slug, title_th, title_en, title_cn, title_jp, excerpt_th, excerpt_en, excerpt_cn, excerpt_jp, cover_image_url, is_active)";

export const ADMIN_HOME_FEATURED_PRODUCT_SELECT =
  "id, product_id, sort_order, is_active, created_at, updated_at, product:products(id, slug, name_th, is_hidden)";

export const ADMIN_HOME_FEATURED_ASSET_SELECT =
  "id, asset_id, sort_order, is_active, created_at, updated_at, asset:assets(id, code, slug, name_th, status, is_hidden)";

export const ADMIN_HOME_PARTNER_LOGO_SELECT =
  "id, name, image_url, link_url, link_target, sort_order, is_active, created_at, updated_at";

function fail422(message: string): never {
  throw createError({
    statusCode: 422,
    statusMessage: message,
  });
}

function asLinkTarget(value: unknown): "_blank" | "_self" {
  return value === "_blank" ? "_blank" : "_self";
}

export function asHomeSectionKey(value: unknown): "promotion" | "service" {
  if (value === "promotion" || value === "service") {
    return value;
  }

  fail422("sectionKey must be promotion or service");
}

export function buildHomeBannerPayload(body: Record<string, unknown>) {
  return {
    title_th: asNonEmptyString(body.titleTh, "titleTh"),
    title_en: asNonEmptyString(body.titleEn, "titleEn"),
    title_cn: asOptionalString(body.titleCn),
    title_jp: asOptionalString(body.titleJp),
    subtitle_th: asNonEmptyString(body.subtitleTh, "subtitleTh"),
    subtitle_en: asNonEmptyString(body.subtitleEn, "subtitleEn"),
    subtitle_cn: asOptionalString(body.subtitleCn),
    subtitle_jp: asOptionalString(body.subtitleJp),
    cta_label_th: asNonEmptyString(body.ctaLabelTh, "ctaLabelTh"),
    cta_label_en: asNonEmptyString(body.ctaLabelEn, "ctaLabelEn"),
    cta_label_cn: asOptionalString(body.ctaLabelCn),
    cta_label_jp: asOptionalString(body.ctaLabelJp),
    image_url: asNonEmptyString(body.imageUrl, "imageUrl"),
    mobile_image_url: asOptionalString(body.mobileImageUrl),
    link_url: asNonEmptyString(body.linkUrl, "linkUrl"),
    link_target: asLinkTarget(body.linkTarget),
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
    is_active: body.isActive !== false,
  };
}

export function buildHomeLinkCardPayload(body: Record<string, unknown>) {
  const sectionKey = asHomeSectionKey(body.sectionKey);
  const contentPageId = asOptionalString(body.contentPageId);

  if (contentPageId) {
    return {
      section_key: sectionKey,
      content_page_id: contentPageId,
      title_th: null,
      title_en: null,
      title_cn: null,
      title_jp: null,
      description_th: null,
      description_en: null,
      description_cn: null,
      description_jp: null,
      image_url: null,
      link_url: null,
      link_target: asLinkTarget(body.linkTarget),
      sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
      is_active: body.isActive !== false,
    };
  }

  return {
    section_key: sectionKey,
    content_page_id: null,
    title_th: asNonEmptyString(body.titleTh, "titleTh"),
    title_en: asNonEmptyString(body.titleEn, "titleEn"),
    title_cn: asOptionalString(body.titleCn),
    title_jp: asOptionalString(body.titleJp),
    description_th: asNonEmptyString(body.descriptionTh, "descriptionTh"),
    description_en: asNonEmptyString(body.descriptionEn, "descriptionEn"),
    description_cn: asOptionalString(body.descriptionCn),
    description_jp: asOptionalString(body.descriptionJp),
    image_url: asNonEmptyString(body.imageUrl, "imageUrl"),
    link_url: asNonEmptyString(body.linkUrl, "linkUrl"),
    link_target: asLinkTarget(body.linkTarget),
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
    is_active: body.isActive !== false,
  };
}

export function buildFeaturedProductPayload(body: Record<string, unknown>) {
  return {
    product_id: asNonEmptyString(body.productId, "productId"),
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
    is_active: body.isActive !== false,
  };
}

export function buildFeaturedAssetPayload(body: Record<string, unknown>) {
  return {
    asset_id: asNonEmptyString(body.assetId, "assetId"),
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
    is_active: body.isActive !== false,
  };
}

export function buildHomePartnerLogoPayload(body: Record<string, unknown>) {
  return {
    name: asNonEmptyString(body.name, "name"),
    image_url: asNonEmptyString(body.imageUrl, "imageUrl"),
    link_url: asNonEmptyString(body.linkUrl, "linkUrl"),
    link_target: asLinkTarget(body.linkTarget),
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
    is_active: body.isActive !== false,
  };
}
