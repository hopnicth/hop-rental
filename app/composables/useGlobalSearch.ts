import type { ContentType } from "~/types/content";
import type { LocalizedString } from "~/types/locale";
import type { CatalogType } from "~/composables/useProductSearch";

export type GlobalSearchScope = "all" | "product" | "rental" | ContentType;

export type GlobalSearchResultScope = Exclude<GlobalSearchScope, "all">;

export interface GlobalSearchSuggestion {
  key: string;
  id: string;
  scope: GlobalSearchResultScope;
  scopes: GlobalSearchResultScope[];
  title: LocalizedString;
  excerpt?: LocalizedString;
  thumbnailUrl: string | null;
  url: string;
  rentalUrl?: string;
  productType?: CatalogType;
}

function productShowUrl(categoryKeys: string[], slug: string) {
  const group = categoryKeys[0] ?? "all";
  return `/product-${group}/${slug}`;
}

function toText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function localized(
  th: unknown,
  en: unknown,
  cn: unknown,
  jp: unknown,
  fallback = "",
): LocalizedString {
  const thValue = toText(th) || toText(en) || fallback;
  const enValue = toText(en) || toText(th) || fallback;
  return {
    th: thValue,
    en: enValue,
    cn: toText(cn) || enValue,
    jp: toText(jp) || enValue,
  };
}

function toIlikePattern(value: string) {
  const tokens = value
    .trim()
    .replace(/[%,()*]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  return tokens.length > 0 ? `%${tokens.join("%")}%` : "";
}

export function useGlobalSearch() {
  const supabase = useSupabaseClient();
  const { autocomplete } = useProductSearch();
  const { searchContentPages, pathForContent } = useContentPages();

  async function searchRentalAssets(
    q: string,
  ): Promise<GlobalSearchSuggestion[]> {
    const pattern = toIlikePattern(q);
    if (!pattern) return [];

    const { data, error } = await supabase
      .from("assets")
      .select(
        "id, code, slug, name_th, name_en, name_cn, name_jp, description_th, description_en, description_cn, description_jp, brand, thumbnail_url, sort_order, is_hidden",
      )
      .eq("is_hidden", false)
      .or(
        [
          `code.ilike.${pattern}`,
          `brand.ilike.${pattern}`,
          `name_th.ilike.${pattern}`,
          `name_en.ilike.${pattern}`,
          `name_cn.ilike.${pattern}`,
          `name_jp.ilike.${pattern}`,
          `description_th.ilike.${pattern}`,
          `description_en.ilike.${pattern}`,
          `description_cn.ilike.${pattern}`,
          `description_jp.ilike.${pattern}`,
        ].join(","),
      )
      .order("sort_order", { ascending: true })
      .limit(8);

    if (error) {
      console.warn(
        "[useGlobalSearch] searchRentalAssets failed:",
        error.message,
      );
      return [];
    }

    return ((data ?? []) as Record<string, unknown>[])
      .map((asset) => {
        const id = toText(asset.id);
        const slug = toText(asset.slug);
        if (!id || !slug) return null;
        const fallback = toText(asset.name_th) || toText(asset.name_en) || slug;
        return {
          key: `asset:${id}`,
          id,
          scope: "rental" as const,
          scopes: ["rental" as const],
          title: localized(
            asset.name_th,
            asset.name_en,
            asset.name_cn,
            asset.name_jp,
            fallback,
          ),
          excerpt: localized(
            asset.description_th,
            asset.description_en,
            asset.description_cn,
            asset.description_jp,
            fallback,
          ),
          thumbnailUrl: toText(asset.thumbnail_url) || null,
          url: `/asset/${slug}`,
        } satisfies GlobalSearchSuggestion;
      })
      .filter((item): item is GlobalSearchSuggestion => !!item);
  }

  async function searchGlobalSuggestions(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return [];

    const [products, rentalAssets, contents] = await Promise.all([
      autocomplete(trimmed, 8),
      searchRentalAssets(trimmed),
      searchContentPages({ q: trimmed, limit: 12 }),
    ]);

    const productItems: GlobalSearchSuggestion[] = products.map((product) => {
      const isRentalOnly = product.type === "rental";
      const isHybrid = product.type === "hybrid";
      const scope: GlobalSearchResultScope = isRentalOnly
        ? "rental"
        : "product";
      const url = isRentalOnly
        ? `/product-rental/${product.slug}`
        : productShowUrl(product.categoryKeys, product.slug);

      return {
        key: `product:${product.id}`,
        id: product.id,
        scope,
        scopes: isHybrid ? ["product", "rental"] : [scope],
        title: product.name,
        thumbnailUrl: product.thumbnailUrl,
        url,
        rentalUrl: `/product-rental/${product.slug}`,
        productType: product.type,
      };
    });

    const contentItems: GlobalSearchSuggestion[] = contents.map((content) => ({
      key: `${content.contentType}:${content.id}`,
      id: content.id,
      scope: content.contentType,
      scopes: [content.contentType],
      title: content.title,
      excerpt: content.excerpt,
      thumbnailUrl: content.coverImageUrl || null,
      url: pathForContent(content.contentType, content.slug),
    }));

    return [
      ...productItems.slice(0, 4),
      ...rentalAssets.slice(0, 3),
      ...contentItems,
      ...productItems.slice(4),
      ...rentalAssets.slice(3),
    ];
  }

  return {
    searchGlobalSuggestions,
  };
}
