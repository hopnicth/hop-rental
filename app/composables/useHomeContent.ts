import type {
  HomeFeaturedProduct,
  HomeFeaturedAsset,
  HomeLinkCard,
} from "~/types/home";
import type { Product } from "~/types/product";
import type { Asset } from "~/types/asset";

const HOME_CONTENT_ONCE_KEY = "home:content";
const FEATURED_HOME_LIMIT = 15;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function localized(
  th: unknown,
  en: unknown,
  cn: unknown,
  jp: unknown,
  fallback: string,
) {
  const thValue = toString(th) ?? toString(en) ?? fallback;
  const enValue = toString(en) ?? toString(th) ?? fallback;

  return {
    th: thValue,
    en: enValue,
    cn: toString(cn) ?? enValue,
    jp: toString(jp) ?? enValue,
  };
}

function isMissingHomeContentSchemaError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "";
  const details =
    typeof error === "object" && error !== null && "details" in error
      ? String(error.details)
      : "";
  const hint =
    typeof error === "object" && error !== null && "hint" in error
      ? String(error.hint)
      : "";
  const combined = `${message} ${details} ${hint}`.toLowerCase();

  return (
    (combined.includes("home_link_cards") ||
      combined.includes("home_featured_products") ||
      combined.includes("home_featured_assets")) &&
    (combined.includes("schema cache") ||
      combined.includes("does not exist") ||
      combined.includes("404") ||
      combined.includes("relationship"))
  );
}

function normalizeLinkCardRow(row: unknown): HomeLinkCard | null {
  if (!isRecord(row)) return null;

  const id = toString(row.id);
  const sectionKey = row.section_key === "service" ? "service" : "promotion";
  if (!id) return null;

  const page = isRecord(row.content_page) ? row.content_page : null;
  if (page && page.is_active === false) return null;

  const titleTh = page ? page.title_th : row.title_th;
  const titleEn = page ? page.title_en : row.title_en;
  const titleCn = page ? page.title_cn : row.title_cn;
  const titleJp = page ? page.title_jp : row.title_jp;
  const descTh = page ? page.excerpt_th : row.description_th;
  const descEn = page ? page.excerpt_en : row.description_en;
  const descCn = page ? page.excerpt_cn : row.description_cn;
  const descJp = page ? page.excerpt_jp : row.description_jp;

  const imageUrl = page
    ? toString(page.cover_image_url)
    : toString(row.image_url);

  const pageSlug = page ? toString(page.slug) : undefined;
  const pageBase = sectionKey === "service" ? "/services" : "/promotions";
  const linkUrl = page
    ? pageSlug
      ? `${pageBase}/${pageSlug}`
      : undefined
    : toString(row.link_url);

  if (!imageUrl || !linkUrl) return null;

  const fallback = toString(titleEn) ?? toString(titleTh) ?? id;

  return {
    id,
    sectionKey,
    title: localized(titleTh, titleEn, titleCn, titleJp, fallback),
    description: localized(descTh, descEn, descCn, descJp, fallback),
    imageUrl,
    linkUrl,
    linkTarget: row.link_target === "_blank" ? "_blank" : "_self",
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active !== false,
  };
}

function normalizeFeaturedProductRow(row: unknown): HomeFeaturedProduct | null {
  if (!isRecord(row)) return null;
  const id = toString(row.id);
  const productId = toString(row.product_id);
  if (!id || !productId) return null;

  return {
    id,
    productId,
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active !== false,
  };
}

function normalizeFeaturedRentalRow(row: unknown): HomeFeaturedAsset | null {
  if (!isRecord(row)) return null;
  const id = toString(row.id);
  const assetId = toString(row.asset_id);
  if (!id || !assetId) return null;

  return {
    id,
    assetId,
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active !== false,
  };
}

function byTrendingScoreDesc(a: Product, b: Product): number {
  return b.insight.trendingScore - a.insight.trendingScore;
}

function byRentalPriority(a: Asset, b: Asset): number {
  return b.rentalCount - a.rentalCount || a.sortOrder - b.sortOrder;
}

function hashText(value: string): number {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function pickDeterministicRandomItems<T>(
  items: T[],
  limit: number,
  getKey: (item: T) => string,
  seed: string,
): T[] {
  return [...items]
    .sort((a, b) => {
      const scoreA = hashText(`${seed}:${getKey(a)}`);
      const scoreB = hashText(`${seed}:${getKey(b)}`);

      if (scoreA === scoreB) {
        return getKey(a).localeCompare(getKey(b));
      }

      return scoreA - scoreB;
    })
    .slice(0, limit);
}

export function useHomeContent() {
  const supabase = useSupabaseClient();
  const { products } = useProducts();
  const { assets } = useAssets();
  const fallbackSeed = useState<string>("home:featured-fallback-seed", () =>
    new Date().toISOString().slice(0, 10),
  );

  const allLinkCards = useState<HomeLinkCard[]>("home:link-cards", () => []);
  const allFeaturedProducts = useState<HomeFeaturedProduct[]>(
    "home:featured-products",
    () => [],
  );
  const allFeaturedAssets = useState<HomeFeaturedAsset[]>(
    "home:featured-assets",
    () => [],
  );
  const hasRemoteLinkCards = useState<boolean>(
    "home:link-cards:remote",
    () => false,
  );
  const hasRemoteFeaturedProducts = useState<boolean>(
    "home:featured-products:remote",
    () => false,
  );
  const hasRemoteFeaturedAssets = useState<boolean>(
    "home:featured-assets:remote",
    () => false,
  );
  const loading = useState<boolean>("home:content:loading", () => false);

  async function fetchHomeContent(): Promise<void> {
    loading.value = true;
    try {
      const [linkCardsResult, featuredProductsResult, featuredRentalsResult] =
        await Promise.all([
          supabase
            .from("home_link_cards")
            .select(
              "id, section_key, content_page_id, title_th, title_en, title_cn, title_jp, description_th, description_en, description_cn, description_jp, image_url, link_url, link_target, sort_order, is_active, content_page:content_pages!content_page_id(id, slug, title_th, title_en, title_cn, title_jp, excerpt_th, excerpt_en, excerpt_cn, excerpt_jp, cover_image_url, is_active)",
            )
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false }),
          supabase
            .from("home_featured_products")
            .select("id, product_id, sort_order, is_active")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false }),
          supabase
            .from("home_featured_assets")
            .select("id, asset_id, sort_order, is_active")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false }),
        ]);

      if (linkCardsResult.error) throw linkCardsResult.error;
      if (featuredProductsResult.error) throw featuredProductsResult.error;
      if (featuredRentalsResult.error) throw featuredRentalsResult.error;

      allLinkCards.value = ((linkCardsResult.data ?? []) as unknown[])
        .map(normalizeLinkCardRow)
        .filter((item): item is HomeLinkCard => !!item);
      allFeaturedProducts.value = (
        (featuredProductsResult.data ?? []) as unknown[]
      )
        .map(normalizeFeaturedProductRow)
        .filter((item): item is HomeFeaturedProduct => !!item);
      allFeaturedAssets.value = (
        (featuredRentalsResult.data ?? []) as unknown[]
      )
        .map(normalizeFeaturedRentalRow)
        .filter((item): item is HomeFeaturedAsset => !!item);

      hasRemoteLinkCards.value = true;
      hasRemoteFeaturedProducts.value = true;
      hasRemoteFeaturedAssets.value = true;
    } catch (fetchError) {
      if (isMissingHomeContentSchemaError(fetchError)) {
        hasRemoteLinkCards.value = false;
        hasRemoteFeaturedProducts.value = false;
        hasRemoteFeaturedAssets.value = false;
        return;
      }

      console.warn(
        "[useHomeContent] Failed to fetch home content:",
        fetchError,
      );
    } finally {
      loading.value = false;
    }
  }

  async function ensureHomeContentLoaded(): Promise<void> {
    await callOnce(HOME_CONTENT_ONCE_KEY, fetchHomeContent);
  }

  onServerPrefetch(ensureHomeContentLoaded);

  if (import.meta.client) {
    void ensureHomeContentLoaded();
  }

  const promotionCards = computed(() =>
    allLinkCards.value
      .filter((item) => item.isActive && item.sectionKey === "promotion")
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );

  const serviceCards = computed(() =>
    allLinkCards.value
      .filter((item) => item.isActive && item.sectionKey === "service")
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );

  const featuredProducts = computed(() => {
    const curatedProducts = allFeaturedProducts.value
      .filter((item) => item.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .slice(0, FEATURED_HOME_LIMIT)
      .map((item) =>
        products.value.find((product) => product.id === item.productId),
      )
      .filter((product): product is Product => !!product);

    if (hasRemoteFeaturedProducts.value) {
      return curatedProducts;
    }

    return pickDeterministicRandomItems(
      products.value,
      FEATURED_HOME_LIMIT,
      (product) => product.id,
      `${fallbackSeed.value}:products`,
    );
  });

  const featuredAssets = computed(() => {
    const curatedAssets = allFeaturedAssets.value
      .filter((item) => item.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .slice(0, FEATURED_HOME_LIMIT)
      .map((item) => assets.value.find((access) => access.id === item.assetId))
      .filter((access): access is Asset => !!access);

    if (hasRemoteFeaturedAssets.value) {
      return curatedAssets;
    }

    return pickDeterministicRandomItems(
      [...assets.value].sort(byRentalPriority),
      FEATURED_HOME_LIMIT,
      (access) => access.id,
      `${fallbackSeed.value}:rentals`,
    );
  });

  return {
    promotionCards,
    serviceCards,
    featuredProducts,
    featuredAssets,
    loading,
  };
}
