import type { LocalizedString } from "~/types/locale";

/**
 * Product search composable — calls Supabase RPCs `search_products` and
 * `autocomplete_products`. Keeps results unopinionated so the caller can
 * render them with `ProductCard` (via productId lookup) or with minimal
 * suggestion UIs (via the search result row directly).
 */

export type CatalogType = "sale" | "rental" | "hybrid";

export interface ProductSearchParams {
  q?: string;
  categories?: string[];
  type?: CatalogType;
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  limit?: number;
  offset?: number;
}

export interface ProductSearchResult {
  id: string;
  slug: string;
  type: CatalogType;
  name: LocalizedString;
  description: LocalizedString;
  categoryKeys: string[];
  brand: string | null;
  thumbnailUrl: string | null;
  imageUrls: string[];
  spec: Record<string, unknown>;
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  totalRental: number;
  trendingScore: number;
  rank: number;
}

export interface AutocompleteSuggestion {
  id: string;
  slug: string;
  name: LocalizedString;
  thumbnailUrl: string | null;
  type: CatalogType;
  categoryKeys: string[];
  similarityScore: number;
}

function localized(
  th: string | null,
  en: string | null,
  cn: string | null,
  jp: string | null,
): LocalizedString {
  const thValue = th ?? en ?? "";
  const enValue = en ?? th ?? "";

  return {
    th: thValue,
    en: enValue,
    cn: cn ?? enValue,
    jp: jp ?? enValue,
  };
}

function toNum(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toType(value: unknown): CatalogType {
  return value === "rental" || value === "hybrid" ? value : "sale";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mediaVariantUrl(
  item: Record<string, unknown>,
  key: "large" | "card" | "thumbnail",
) {
  const variants = isRecord(item.variants) ? item.variants : null;
  const variant = variants && isRecord(variants[key]) ? variants[key] : null;
  return toString(variant?.url);
}

function mediaGalleryPrimaryUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  for (const entry of value) {
    if (!isRecord(entry) || entry.status !== "ready") continue;
    const url =
      mediaVariantUrl(entry, "card") ||
      mediaVariantUrl(entry, "thumbnail") ||
      mediaVariantUrl(entry, "large");
    if (url) return url;
  }

  return null;
}

function mediaGalleryImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        isRecord(entry) && entry.status === "ready",
    )
    .map(
      (entry) =>
        mediaVariantUrl(entry, "large") ||
        mediaVariantUrl(entry, "card") ||
        mediaVariantUrl(entry, "thumbnail") ||
        "",
    )
    .filter(Boolean);
}

function mapSearchRow(row: Record<string, unknown>): ProductSearchResult {
  return {
    id: String(row.id),
    slug: String(row.slug),
    type: toType(row.type),
    name: localized(
      row.name_th as string | null,
      row.name_en as string | null,
      row.name_cn as string | null,
      row.name_jp as string | null,
    ),
    description: localized(
      row.description_th as string | null,
      row.description_en as string | null,
      row.description_cn as string | null,
      row.description_jp as string | null,
    ),
    categoryKeys: Array.isArray(row.category_keys)
      ? (row.category_keys as string[])
      : [],
    brand: (row.brand as string | null) ?? null,
    thumbnailUrl: mediaGalleryPrimaryUrl(row.media_gallery),
    imageUrls: mediaGalleryImageUrls(row.media_gallery),
    spec: (row.spec as Record<string, unknown>) ?? {},
    minPrice: toNum(row.min_price),
    maxPrice: toNum(row.max_price),
    totalStock: toNum(row.total_stock),
    totalRental: toNum(row.total_rental),
    trendingScore: toNum(row.trending_score),
    rank: toNum(row.rank),
  };
}

function mapSuggestionRow(
  row: Record<string, unknown>,
): AutocompleteSuggestion {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: localized(
      row.name_th as string | null,
      row.name_en as string | null,
      row.name_cn as string | null,
      row.name_jp as string | null,
    ),
    thumbnailUrl: mediaGalleryPrimaryUrl(row.media_gallery),
    type: toType(row.type),
    categoryKeys: Array.isArray(row.category_keys)
      ? (row.category_keys as string[])
      : [],
    similarityScore: toNum(row.similarity_score),
  };
}

export function useProductSearch() {
  const supabase = useSupabaseClient();

  async function search(params: ProductSearchParams = {}): Promise<{
    items: ProductSearchResult[];
    totalCount: number;
  }> {
    const { data, error } = await (supabase as any).rpc("search_products", {
      q: params.q ?? "",
      p_categories:
        params.categories && params.categories.length > 0
          ? params.categories
          : null,
      p_type: params.type ?? null,
      p_brands:
        params.brands && params.brands.length > 0 ? params.brands : null,
      p_min_price: params.minPrice ?? null,
      p_max_price: params.maxPrice ?? null,
      p_in_stock: params.inStock ?? false,
      p_limit: params.limit ?? 24,
      p_offset: params.offset ?? 0,
    });

    if (error) {
      console.warn("[useProductSearch] search_products failed:", error.message);
      return { items: [], totalCount: 0 };
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    const items = rows.map(mapSearchRow);
    const totalCount = rows.length > 0 ? toNum(rows[0]?.total_count) : 0;

    return { items, totalCount };
  }

  async function autocomplete(
    prefix: string,
    limit = 8,
  ): Promise<AutocompleteSuggestion[]> {
    const trimmed = prefix.trim();
    if (trimmed.length === 0) return [];

    const { data, error } = await (supabase as any).rpc(
      "autocomplete_products",
      {
        prefix: trimmed,
        p_limit: limit,
      },
    );

    if (error) {
      console.warn(
        "[useProductSearch] autocomplete_products failed:",
        error.message,
      );
      return [];
    }

    return ((data ?? []) as Record<string, unknown>[]).map(mapSuggestionRow);
  }

  return {
    search,
    autocomplete,
  };
}
