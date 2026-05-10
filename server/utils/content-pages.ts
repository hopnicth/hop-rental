import { createError } from "h3";
import {
  asNonEmptyString,
  asNumber,
  asOptionalString,
} from "~~/server/utils/admin-catalog";
import { isServiceAreaValue } from "~~/app/data/thaiServiceAreas";
import { asCategoryKey } from "~~/server/utils/admin-main-categories";

export type ContentType = "blog" | "service" | "promotion" | "review";
export type LocaleCode = "th" | "en" | "cn" | "jp";
export type ServiceProviderType = "individual" | "company";

export const ADMIN_CONTENT_PAGE_SELECT =
  "id, content_type, slug, main_category_key, provider_id, title_th, title_en, title_cn, title_jp, excerpt_th, excerpt_en, excerpt_cn, excerpt_jp, cover_image_url, blocks, service_areas, sort_order, is_active, published_at, created_at, updated_at, content_page_products(product_id, sort_order), content_page_assets(asset_id, sort_order), service_providers(provider_id, provider_type, is_verified, contact_phone, contact_email, google_maps_url, line_id, line_url, kyc_documents, created_at, updated_at)";

const LOCALES: LocaleCode[] = ["th", "en", "cn", "jp"];

function fail422(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asContentType(value: unknown): ContentType {
  if (
    value === "blog" ||
    value === "service" ||
    value === "promotion" ||
    value === "review"
  ) {
    return value;
  }
  fail422("contentType must be blog, service, promotion, or review");
}

function asSlug(value: unknown) {
  const normalized = asNonEmptyString(value, "slug")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!normalized) fail422("slug is required");
  return normalized;
}

function asPublishedAt(value: unknown) {
  const raw = asOptionalString(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) fail422("publishedAt must be a valid date");
  return date.toISOString();
}

function asOptionalCategoryKey(value: unknown) {
  const raw = asOptionalString(value);
  return raw ? asCategoryKey(raw, "mainCategoryKey") : null;
}

function asServiceProviderType(value: unknown): ServiceProviderType {
  if (value === "company") return "company";
  if (value === "individual" || value == null || value === "")
    return "individual";
  fail422("providerType must be individual or company");
}

function asProviderId(value: unknown) {
  const raw = asOptionalString(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!/^\d{13}$/.test(digits)) {
    fail422("providerId must be a 13-digit Citizen ID or Juristic ID");
  }
  return digits;
}

function asLineId(value: unknown) {
  const raw = asOptionalString(value);
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, "");
  if (!/^@?[A-Za-z0-9._-]{2,64}$/.test(normalized)) {
    fail422("lineId must be a valid Line ID");
  }
  return normalized;
}

function asLineUrl(value: unknown) {
  const raw = asOptionalString(value);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail422("lineUrl must be a valid URL");
  }
  const host = url.hostname.toLowerCase();
  const isAllowedHost =
    host === "line.me" || host === "lin.ee" || host.endsWith(".line.me");
  if (url.protocol !== "https:" || !isAllowedHost) {
    fail422("lineUrl must be an HTTPS line.me or lin.ee URL");
  }
  return url.toString();
}

function providerInput(body: Record<string, unknown>) {
  return isRecord(body.serviceProvider) ? body.serviceProvider : body;
}

const KYC_KEYS: Record<ServiceProviderType, string[]> = {
  individual: ["citizenCard"],
  company: ["companyCertificate", "vatCertificate"],
};

export function normalizeKycDocuments(
  value: unknown,
  providerType: ServiceProviderType = "individual",
) {
  const output: Record<string, Record<string, unknown>> = {};
  if (!isRecord(value)) return output;

  for (const key of KYC_KEYS[providerType]) {
    const entry = value[key];
    if (!isRecord(entry)) continue;
    const path = asOptionalString(entry.path);
    if (!path) continue;
    output[key] = {
      path,
      url: asOptionalString(entry.url),
      filename: asOptionalString(entry.filename),
      mimeType: asOptionalString(entry.mimeType),
      sizeBytes: asNumber(entry.sizeBytes, 0),
      uploadedAt: asOptionalString(entry.uploadedAt),
    };
  }

  return output;
}

const EMPTY_DOC = { type: "doc", content: [] } as const;

function asTipTapDoc(value: unknown): { type: "doc"; content: unknown[] } {
  if (!isRecord(value)) return { ...EMPTY_DOC };
  if (value.type !== "doc") return { ...EMPTY_DOC };
  const content = Array.isArray(value.content) ? value.content : [];
  return { type: "doc", content };
}

/**
 * Normalize per-locale TipTap docs.
 * Accepts: { th, en, cn, jp } object of TipTap docs.
 * Legacy data (array) is treated as empty docs to avoid crashes.
 */
export function normalizeLocalizedBody(value: unknown) {
  const result: Record<LocaleCode, { type: "doc"; content: unknown[] }> = {
    th: { ...EMPTY_DOC },
    en: { ...EMPTY_DOC },
    cn: { ...EMPTY_DOC },
    jp: { ...EMPTY_DOC },
  };

  if (!isRecord(value)) return result;

  for (const locale of LOCALES) {
    result[locale] = asTipTapDoc(value[locale]);
  }
  return result;
}

function asServiceAreas(value: unknown, contentType: ContentType): string[] {
  if (contentType !== "service") return [];
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isServiceAreaValue(entry)) {
      fail422("serviceAreas contains an unknown slug");
    }
    seen.add(entry);
  }
  return Array.from(seen);
}

function asLinkedIdArray(value: unknown, contentType: ContentType): string[] {
  if (contentType !== "review") return [];
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed.length > 0) seen.add(trimmed);
  }
  return Array.from(seen);
}

export function extractLinkedIds(
  body: Record<string, unknown>,
  contentType: ContentType,
) {
  return {
    productIds: asLinkedIdArray(body.linkedProductIds, contentType),
    assetIds: asLinkedIdArray(body.linkedAssetIds, contentType),
  };
}

export function buildContentPagePayload(body: Record<string, unknown>) {
  const contentType = asContentType(body.contentType);
  const input = providerInput(body);
  return {
    content_type: contentType,
    slug: asSlug(body.slug),
    main_category_key: asOptionalCategoryKey(body.mainCategoryKey),
    provider_id:
      contentType === "service" ? asProviderId(input.providerId) : null,
    title_th: asNonEmptyString(body.titleTh, "titleTh"),
    title_en: asNonEmptyString(body.titleEn, "titleEn"),
    title_cn: asOptionalString(body.titleCn),
    title_jp: asOptionalString(body.titleJp),
    excerpt_th: asNonEmptyString(body.excerptTh, "excerptTh"),
    excerpt_en: asNonEmptyString(body.excerptEn, "excerptEn"),
    excerpt_cn: asOptionalString(body.excerptCn),
    excerpt_jp: asOptionalString(body.excerptJp),
    cover_image_url: asOptionalString(body.coverImageUrl),
    blocks: normalizeLocalizedBody(body.body),
    service_areas: asServiceAreas(body.serviceAreas, contentType),
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
    is_active: body.isActive !== false,
    published_at: asPublishedAt(body.publishedAt),
  };
}

export function buildServiceProviderPayload(body: Record<string, unknown>) {
  const contentType = asContentType(body.contentType);
  if (contentType !== "service") return null;

  const input = providerInput(body);
  const providerId = asProviderId(input.providerId);
  if (!providerId) return null;

  const providerType = asServiceProviderType(input.providerType);
  return {
    provider_id: providerId,
    provider_type: providerType,
    is_verified: input.isVerified === true,
    contact_phone: asOptionalString(input.contactPhone),
    contact_email: asOptionalString(input.contactEmail),
    google_maps_url: asOptionalString(input.googleMapsUrl),
    line_id: asLineId(input.lineId),
    line_url: asLineUrl(input.lineUrl),
    kyc_documents: normalizeKycDocuments(input.kycDocuments, providerType),
  };
}

function pickLinkedIds(
  rows: unknown,
  key: "product_id" | "asset_id",
): string[] {
  if (!Array.isArray(rows)) return [];
  const sorted = [...rows].sort((a: any, b: any) => {
    const ao = Number(a?.sort_order ?? 0);
    const bo = Number(b?.sort_order ?? 0);
    return ao - bo;
  });
  const out: string[] = [];
  for (const entry of sorted) {
    const value = (entry as Record<string, unknown>)?.[key];
    if (typeof value === "string" && value.length > 0) out.push(value);
  }
  return out;
}

export function mapContentPageRow(row: any) {
  return {
    id: row.id,
    contentType: row.content_type as ContentType,
    slug: row.slug,
    mainCategoryKey: row.main_category_key ?? "",
    providerId: row.provider_id ?? "",
    titleTh: row.title_th,
    titleEn: row.title_en,
    titleCn: row.title_cn ?? "",
    titleJp: row.title_jp ?? "",
    excerptTh: row.excerpt_th,
    excerptEn: row.excerpt_en,
    excerptCn: row.excerpt_cn ?? "",
    excerptJp: row.excerpt_jp ?? "",
    coverImageUrl: row.cover_image_url ?? "",
    body: normalizeLocalizedBody(row.blocks),
    serviceAreas: Array.isArray(row.service_areas)
      ? (row.service_areas as unknown[]).filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    linkedProductIds: pickLinkedIds(row.content_page_products, "product_id"),
    linkedAssetIds: pickLinkedIds(row.content_page_assets, "asset_id"),
    serviceProvider: mapServiceProviderRow(row.service_providers),
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active !== false,
    publishedAt: row.published_at ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapServiceProviderRow(row: unknown) {
  const provider = Array.isArray(row) ? row[0] : row;
  if (!isRecord(provider)) return null;
  const providerType =
    provider.provider_type === "company" ? "company" : "individual";
  return {
    providerId: asOptionalString(provider.provider_id) ?? "",
    providerType,
    isVerified: provider.is_verified === true,
    contactPhone: asOptionalString(provider.contact_phone) ?? "",
    contactEmail: asOptionalString(provider.contact_email) ?? "",
    googleMapsUrl: asOptionalString(provider.google_maps_url) ?? "",
    lineId: asOptionalString(provider.line_id) ?? "",
    lineUrl: asOptionalString(provider.line_url) ?? "",
    kycDocuments: normalizeKycDocuments(provider.kyc_documents, providerType),
    createdAt: provider.created_at,
    updatedAt: provider.updated_at,
  };
}

type SupabaseAdminClient = {
  from: (table: string) => any;
};

export async function upsertServiceProvider(
  adminClient: SupabaseAdminClient,
  payload: ReturnType<typeof buildServiceProviderPayload>,
) {
  if (!payload) return;

  const { error } = await adminClient
    .from("service_providers")
    .upsert(payload, { onConflict: "provider_id" });
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
}

export async function syncContentPageLinks(
  adminClient: SupabaseAdminClient,
  contentPageId: string,
  productIds: string[],
  assetIds: string[],
) {
  const { error: deleteProductsError } = await adminClient
    .from("content_page_products")
    .delete()
    .eq("content_page_id", contentPageId);
  if (deleteProductsError) {
    throw createError({
      statusCode: 500,
      statusMessage: deleteProductsError.message,
    });
  }

  if (productIds.length > 0) {
    const { error: insertProductsError } = await adminClient
      .from("content_page_products")
      .insert(
        productIds.map((productId, index) => ({
          content_page_id: contentPageId,
          product_id: productId,
          sort_order: index,
        })),
      );
    if (insertProductsError) {
      throw createError({
        statusCode: 500,
        statusMessage: insertProductsError.message,
      });
    }
  }

  const { error: deleteAssetsError } = await adminClient
    .from("content_page_assets")
    .delete()
    .eq("content_page_id", contentPageId);
  if (deleteAssetsError) {
    throw createError({
      statusCode: 500,
      statusMessage: deleteAssetsError.message,
    });
  }

  if (assetIds.length > 0) {
    const { error: insertAssetsError } = await adminClient
      .from("content_page_assets")
      .insert(
        assetIds.map((assetId, index) => ({
          content_page_id: contentPageId,
          asset_id: assetId,
          sort_order: index,
        })),
      );
    if (insertAssetsError) {
      throw createError({
        statusCode: 500,
        statusMessage: insertAssetsError.message,
      });
    }
  }
}
