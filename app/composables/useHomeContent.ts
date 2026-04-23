import { mockPromotionCards, mockServiceCards } from "~/mock/home-content";
import type {
  HomeFeaturedProduct,
  HomeFeaturedRentalAccess,
  HomeLinkCard,
} from "~/types/home";
import type { Product } from "~/types/product";
import type { RentalAccess } from "~/types/rental-access";

const HOME_CONTENT_ONCE_KEY = "home:content";

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
      combined.includes("home_featured_rental_accesses")) &&
    (combined.includes("schema cache") ||
      combined.includes("does not exist") ||
      combined.includes("404") ||
      combined.includes("relationship"))
  );
}

function normalizeLinkCardRow(row: unknown): HomeLinkCard | null {
  if (!isRecord(row)) return null;

  const id = toString(row.id);
  const imageUrl = toString(row.image_url);
  const linkUrl = toString(row.link_url);
  const sectionKey = row.section_key === "service" ? "service" : "promotion";
  if (!id || !imageUrl || !linkUrl) return null;

  const fallback = toString(row.title_en) ?? toString(row.title_th) ?? id;

  return {
    id,
    sectionKey,
    title: localized(
      row.title_th,
      row.title_en,
      row.title_cn,
      row.title_jp,
      fallback,
    ),
    description: localized(
      row.description_th,
      row.description_en,
      row.description_cn,
      row.description_jp,
      fallback,
    ),
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

function normalizeFeaturedRentalRow(
  row: unknown,
): HomeFeaturedRentalAccess | null {
  if (!isRecord(row)) return null;
  const id = toString(row.id);
  const rentalAccessId = toString(row.rental_access_id);
  if (!id || !rentalAccessId) return null;

  return {
    id,
    rentalAccessId,
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active !== false,
  };
}

function byTrendingScoreDesc(a: Product, b: Product): number {
  return b.insight.trendingScore - a.insight.trendingScore;
}

function byRentalPriority(a: RentalAccess, b: RentalAccess): number {
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
  const { rentalAccesses } = useRentalAccesses();
  const fallbackSeed = useState<string>("home:featured-fallback-seed", () =>
    new Date().toISOString().slice(0, 10),
  );

  const allLinkCards = useState<HomeLinkCard[]>("home:link-cards", () => [
    ...mockPromotionCards,
    ...mockServiceCards,
  ]);
  const allFeaturedProducts = useState<HomeFeaturedProduct[]>(
    "home:featured-products",
    () => [],
  );
  const allFeaturedRentalAccesses = useState<HomeFeaturedRentalAccess[]>(
    "home:featured-rental-accesses",
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
  const hasRemoteFeaturedRentalAccesses = useState<boolean>(
    "home:featured-rental-accesses:remote",
    () => false,
  );

  async function fetchHomeContent(): Promise<void> {
    try {
      const [linkCardsResult, featuredProductsResult, featuredRentalsResult] =
        await Promise.all([
          supabase
            .from("home_link_cards")
            .select(
              "id, section_key, title_th, title_en, title_cn, title_jp, description_th, description_en, description_cn, description_jp, image_url, link_url, link_target, sort_order, is_active",
            )
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false }),
          supabase
            .from("home_featured_products")
            .select("id, product_id, sort_order, is_active")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false }),
          supabase
            .from("home_featured_rental_accesses")
            .select("id, rental_access_id, sort_order, is_active")
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
      allFeaturedRentalAccesses.value = (
        (featuredRentalsResult.data ?? []) as unknown[]
      )
        .map(normalizeFeaturedRentalRow)
        .filter((item): item is HomeFeaturedRentalAccess => !!item);

      hasRemoteLinkCards.value = true;
      hasRemoteFeaturedProducts.value = true;
      hasRemoteFeaturedRentalAccesses.value = true;
    } catch (fetchError) {
      if (isMissingHomeContentSchemaError(fetchError)) {
        hasRemoteLinkCards.value = false;
        hasRemoteFeaturedProducts.value = false;
        hasRemoteFeaturedRentalAccesses.value = false;
        return;
      }

      console.warn(
        "[useHomeContent] Failed to fetch home content:",
        fetchError,
      );
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
      .map((item) =>
        products.value.find((product) => product.id === item.productId),
      )
      .filter((product): product is Product => !!product && product.isForSale);

    if (hasRemoteFeaturedProducts.value && curatedProducts.length > 0) {
      return curatedProducts;
    }

    return pickDeterministicRandomItems(
      products.value.filter((product) => product.isForSale),
      8,
      (product) => product.id,
      `${fallbackSeed.value}:products`,
    );
  });

  const featuredRentalAccesses = computed(() => {
    const curatedRentalAccesses = allFeaturedRentalAccesses.value
      .filter((item) => item.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) =>
        rentalAccesses.value.find(
          (access) => access.id === item.rentalAccessId,
        ),
      )
      .filter((access): access is RentalAccess => !!access);

    if (
      hasRemoteFeaturedRentalAccesses.value &&
      curatedRentalAccesses.length > 0
    ) {
      return curatedRentalAccesses;
    }

    return pickDeterministicRandomItems(
      [...rentalAccesses.value].sort(byRentalPriority),
      8,
      (access) => access.id,
      `${fallbackSeed.value}:rentals`,
    );
  });

  return {
    promotionCards,
    serviceCards,
    featuredProducts,
    featuredRentalAccesses,
  };
}
