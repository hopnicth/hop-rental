import { createError } from "h3";
import {
  asNonEmptyString,
  asNumber,
  asOptionalString,
} from "~~/server/utils/admin-catalog";

export const ADMIN_HOME_BANNER_SELECT =
  "id, title_th, title_en, title_cn, title_jp, subtitle_th, subtitle_en, subtitle_cn, subtitle_jp, cta_label_th, cta_label_en, cta_label_cn, cta_label_jp, image_url, mobile_image_url, link_url, link_target, sort_order, is_active, created_at, updated_at";

export const ADMIN_HOME_LINK_CARD_SELECT =
  "id, section_key, title_th, title_en, title_cn, title_jp, description_th, description_en, description_cn, description_jp, image_url, link_url, link_target, sort_order, is_active, created_at, updated_at";

export const ADMIN_HOME_FEATURED_PRODUCT_SELECT =
  "id, product_id, sort_order, is_active, created_at, updated_at, product:products(id, slug, name_th, is_hidden)";

export const ADMIN_HOME_FEATURED_ASSET_SELECT =
  "id, asset_id, sort_order, is_active, created_at, updated_at, asset:assets(id, code, slug, name_th, status, is_hidden)";

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
  return {
    section_key: asHomeSectionKey(body.sectionKey),
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
