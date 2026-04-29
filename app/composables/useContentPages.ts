import {
  emptyLocalizedDoc,
  type ContentPage,
  type ContentType,
  type LocalizedDoc,
  type TipTapDoc,
} from "~/types/content";
import type { LocaleCode, LocalizedString } from "~/types/locale";

type ContentPageRow = Record<string, unknown>;

const LOCALES: LocaleCode[] = ["th", "en", "cn", "jp"];

function toString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function localized(
  th: unknown,
  en: unknown,
  cn: unknown,
  jp: unknown,
  fallback = "",
): LocalizedString {
  const thValue = toString(th) || toString(en) || fallback;
  const enValue = toString(en) || toString(th) || fallback;

  return {
    th: thValue,
    en: enValue,
    cn: toString(cn) || enValue,
    jp: toString(jp) || enValue,
  };
}

function asDoc(value: unknown): TipTapDoc {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { type: "doc", content: [] };
  }
  const record = value as Record<string, unknown>;
  if (record.type !== "doc") return { type: "doc", content: [] };
  return {
    type: "doc",
    content: Array.isArray(record.content) ? record.content : [],
  };
}

function normalizeBody(value: unknown): LocalizedDoc {
  const result = emptyLocalizedDoc();
  if (!value || typeof value !== "object" || Array.isArray(value))
    return result;
  const record = value as Record<string, unknown>;
  for (const locale of LOCALES) {
    result[locale] = asDoc(record[locale]);
  }
  return result;
}

function pickLinkedIds(
  value: unknown,
  key: "product_id" | "asset_id",
): string[] {
  if (!Array.isArray(value)) return [];
  const sorted = [...value].sort((a: any, b: any) => {
    const ao = Number(a?.sort_order ?? 0);
    const bo = Number(b?.sort_order ?? 0);
    return ao - bo;
  });
  const out: string[] = [];
  for (const entry of sorted) {
    const raw = (entry as Record<string, unknown>)?.[key];
    if (typeof raw === "string" && raw.length > 0) out.push(raw);
  }
  return out;
}

const VALID_CONTENT_TYPES: ContentType[] = [
  "blog",
  "service",
  "promotion",
  "review",
];

function normalizeContentPage(row: ContentPageRow): ContentPage | null {
  const id = toString(row.id);
  const contentType = toString(row.content_type) as ContentType;
  const slug = toString(row.slug);
  if (!id || !slug || !VALID_CONTENT_TYPES.includes(contentType)) {
    return null;
  }

  const fallbackTitle =
    toString(row.title_th) || toString(row.title_en) || slug;

  return {
    id,
    contentType,
    slug,
    mainCategoryKey: toString(row.main_category_key),
    title: localized(
      row.title_th,
      row.title_en,
      row.title_cn,
      row.title_jp,
      fallbackTitle,
    ),
    excerpt: localized(
      row.excerpt_th,
      row.excerpt_en,
      row.excerpt_cn,
      row.excerpt_jp,
      fallbackTitle,
    ),
    coverImageUrl: toString(row.cover_image_url),
    body: normalizeBody(row.blocks),
    serviceAreas: Array.isArray(row.service_areas)
      ? (row.service_areas as unknown[]).filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    linkedProductIds: pickLinkedIds(row.content_page_products, "product_id"),
    linkedAssetIds: pickLinkedIds(row.content_page_assets, "asset_id"),
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active !== false,
    publishedAt: toString(row.published_at),
    createdAt: toString(row.created_at),
    updatedAt: toString(row.updated_at),
  };
}

const CONTENT_PAGE_BASE_FIELDS =
  "id, content_type, slug, main_category_key, title_th, title_en, title_cn, title_jp, excerpt_th, excerpt_en, excerpt_cn, excerpt_jp, cover_image_url, blocks, service_areas, sort_order, is_active, published_at, created_at, updated_at";

const PUBLIC_CONTENT_PAGE_SELECT = `${CONTENT_PAGE_BASE_FIELDS}, content_page_products(product_id, sort_order), content_page_assets(asset_id, sort_order)`;

const REVIEWS_FOR_PRODUCT_SELECT = `${CONTENT_PAGE_BASE_FIELDS}, content_page_products!inner(product_id, sort_order), content_page_assets(asset_id, sort_order)`;

const REVIEWS_FOR_ASSET_SELECT = `${CONTENT_PAGE_BASE_FIELDS}, content_page_products(product_id, sort_order), content_page_assets!inner(asset_id, sort_order)`;

export interface ContentPageSearchParams {
  q: string;
  contentTypes?: ContentType[];
  limit?: number;
}

function toIlikePattern(value: string) {
  const tokens = value
    .trim()
    .replace(/[%,()*]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  return tokens.length > 0 ? `%${tokens.join("%")}%` : "";
}

export function useContentPages() {
  const supabase = useSupabaseClient();

  async function fetchContentPages(contentType: ContentType) {
    const { data, error } = await supabase
      .from("content_pages")
      .select(PUBLIC_CONTENT_PAGE_SELECT)
      .eq("content_type", contentType)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    return ((data ?? []) as unknown[])
      .map((row) => normalizeContentPage(row as ContentPageRow))
      .filter((item): item is ContentPage => !!item);
  }

  async function fetchContentPage(contentType: ContentType, slug: string) {
    const { data, error } = await supabase
      .from("content_pages")
      .select(PUBLIC_CONTENT_PAGE_SELECT)
      .eq("content_type", contentType)
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    return data ? normalizeContentPage(data as ContentPageRow) : null;
  }

  async function searchContentPages(params: ContentPageSearchParams) {
    const pattern = toIlikePattern(params.q);
    if (!pattern) return [];

    const contentTypes =
      params.contentTypes && params.contentTypes.length > 0
        ? params.contentTypes
        : VALID_CONTENT_TYPES;

    const { data, error } = await supabase
      .from("content_pages")
      .select(PUBLIC_CONTENT_PAGE_SELECT)
      .eq("is_active", true)
      .in("content_type", contentTypes)
      .or(
        [
          `title_th.ilike.${pattern}`,
          `title_en.ilike.${pattern}`,
          `title_cn.ilike.${pattern}`,
          `title_jp.ilike.${pattern}`,
          `excerpt_th.ilike.${pattern}`,
          `excerpt_en.ilike.${pattern}`,
          `excerpt_cn.ilike.${pattern}`,
          `excerpt_jp.ilike.${pattern}`,
        ].join(","),
      )
      .order("sort_order", { ascending: true })
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(params.limit ?? 12);

    if (error) {
      console.warn(
        "[useContentPages] searchContentPages failed:",
        error.message,
      );
      return [];
    }

    return ((data ?? []) as unknown[])
      .map((row) => normalizeContentPage(row as ContentPageRow))
      .filter((item): item is ContentPage => !!item);
  }

  async function fetchReviewsForProduct(productId: string) {
    if (!productId) return [];
    const { data, error } = await supabase
      .from("content_pages")
      .select(REVIEWS_FOR_PRODUCT_SELECT)
      .eq("content_page_products.product_id", productId)
      .eq("content_type", "review")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(6);

    if (error) throw error;

    return ((data ?? []) as unknown[])
      .map((row) => normalizeContentPage(row as ContentPageRow))
      .filter((item): item is ContentPage => !!item);
  }

  async function fetchReviewsForAsset(assetId: string) {
    if (!assetId) return [];
    const { data, error } = await supabase
      .from("content_pages")
      .select(REVIEWS_FOR_ASSET_SELECT)
      .eq("content_page_assets.asset_id", assetId)
      .eq("content_type", "review")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(6);

    if (error) throw error;

    return ((data ?? []) as unknown[])
      .map((row) => normalizeContentPage(row as ContentPageRow))
      .filter((item): item is ContentPage => !!item);
  }

  function pathForContent(contentType: ContentType, slug: string) {
    if (contentType === "service") return `/services/${slug}`;
    if (contentType === "promotion") return `/promotions/${slug}`;
    if (contentType === "review") return `/reviews/${slug}`;
    return `/blog/${slug}`;
  }

  return {
    fetchContentPages,
    fetchContentPage,
    searchContentPages,
    fetchReviewsForProduct,
    fetchReviewsForAsset,
    pathForContent,
  };
}
