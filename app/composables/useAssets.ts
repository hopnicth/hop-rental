import type { LocalizedString } from "~/types/locale";
import type { Product } from "~/types/product";
import type { Asset } from "~/types/asset";

const ASSET_ONCE_KEY = "catalog:assets";
const RENTAL_PLACEHOLDER_IMAGE =
  "https://placehold.co/400x400/E0E0E0/757575?text=Rental&font=roboto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function localized(
  th: unknown,
  en: unknown,
  cn: unknown,
  jp: unknown,
  fallback: string,
): LocalizedString {
  const thValue = toString(th) ?? toString(en) ?? fallback;
  const enValue = toString(en) ?? toString(th) ?? fallback;
  return {
    th: thValue,
    en: enValue,
    cn: toString(cn) ?? enValue,
    jp: toString(jp) ?? enValue,
  };
}

function isMissingAssetSchemaError(error: unknown): boolean {
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
    combined.includes("assets") &&
    (combined.includes("schema cache") ||
      combined.includes("relationship") ||
      combined.includes("does not exist") ||
      combined.includes("404"))
  );
}

function normalizeAssetRow(row: unknown): Asset | null {
  if (!isRecord(row)) return null;
  const id = toString(row.id);
  const slug = toString(row.slug);
  const code = toString(row.code);
  if (!id || !slug || !code) return null;

  const matchRows = Array.isArray(row.matches) ? row.matches : [];
  const matchedProductIds = matchRows
    .map((match) =>
      isRecord(match)
        ? { id: toString(match.product_id), sort: toNumber(match.sort_order) }
        : null,
    )
    .filter((item): item is { id: string; sort: number } => !!item?.id)
    .sort((a, b) => a.sort - b.sort)
    .map((item) => item.id);

  return {
    id,
    code,
    slug,
    status:
      row.status === "draft" || row.status === "archived"
        ? row.status
        : "active",
    name: localized(row.name_th, row.name_en, row.name_cn, row.name_jp, code),
    description: localized(
      row.description_th,
      row.description_en,
      row.description_cn,
      row.description_jp,
      code,
    ),
    categories: toStringArray(row.category_keys),
    brand: toString(row.brand),
    thumbnail: toString(row.thumbnail_url) ?? RENTAL_PLACEHOLDER_IMAGE,
    images: toStringArray(row.image_urls),
    specSummary: isRecord(row.spec_summary) ? row.spec_summary : {},
    pricing: {
      model: "daily",
      currencyCode: toString(row.currency_code) ?? "THB",
      daily: toNumber(row.daily_rate),
      weekly: toNumber(row.weekly_rate),
      monthly: toNumber(row.monthly_rate),
      dailyEnabled: row.daily_enabled !== false,
      weeklyEnabled: row.weekly_enabled !== false,
      monthlyEnabled: row.monthly_enabled !== false,
      deposit: toNumber(row.deposit_amount),
    },
    rentalRules: {
      minDays: toNumber(row.min_rental_days, 1),
      maxDays: toNumber(row.max_rental_days, 0),
      bufferDays: toNumber(row.buffer_days, 0),
    },
    storageLocationCode: toString(row.storage_location_code),
    storageLocationNote: toString(row.storage_location_note),
    serviceCycle: {
      value: toNumber(row.service_cycle_value, 0),
      unit:
        row.service_cycle_unit === "day" ||
        row.service_cycle_unit === "week" ||
        row.service_cycle_unit === "month" ||
        row.service_cycle_unit === "year"
          ? row.service_cycle_unit
          : undefined,
      lastServicedAt: toString(row.last_serviced_at),
      nextServiceDueAt: toString(row.next_service_due_at),
    },
    viewCount: toNumber(row.view_count),
    rentalCount: toNumber(row.rental_count),
    lastRentedAt: toString(row.last_rented_at),
    sortOrder: toNumber(row.sort_order),
    isHidden: row.is_hidden === true,
    matchedProductIds,
    matchedProducts: [],
    createdAt: toString(row.created_at),
    updatedAt: toString(row.updated_at),
  };
}

export function useAssets() {
  const supabase = useSupabaseClient();
  const { products } = useProducts();
  const allAssets = useState<Asset[]>(
    "catalog:assets",
    () => [],
  );
  const hasRemoteAssets = useState<boolean>(
    "catalog:assets:remote",
    () => false,
  );
  const loading = useState<boolean>(
    "catalog:assets:loading",
    () => false,
  );
  const error = useState<string | null>(
    "catalog:assets:error",
    () => null,
  );

  async function fetchAssetsFromCatalog(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: fetchError } = await supabase
        .from("assets")
        .select(
          `id, code, slug, status, name_th, name_en, name_cn, name_jp, description_th, description_en, description_cn, description_jp, category_keys, brand, thumbnail_url, image_urls, spec_summary, currency_code, daily_rate, weekly_rate, monthly_rate, daily_enabled, weekly_enabled, monthly_enabled, deposit_amount, min_rental_days, max_rental_days, buffer_days, storage_location_code, storage_location_note, service_cycle_value, service_cycle_unit, last_serviced_at, next_service_due_at, view_count, rental_count, last_rented_at, sort_order, is_hidden, created_at, updated_at, matches:asset_matches(product_id, sort_order)`,
        )
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      const records = ((data ?? []) as unknown[])
        .map(normalizeAssetRow)
        .filter((item): item is Asset => item !== null);

      if (records.length > 0) {
        allAssets.value = records;
        hasRemoteAssets.value = true;
      }
    } catch (fetchErr) {
      if (isMissingAssetSchemaError(fetchErr)) {
        error.value = null;
        hasRemoteAssets.value = false;
        return;
      }

      error.value =
        fetchErr instanceof Error
          ? fetchErr.message
          : "Unknown asset error";
      console.warn(
        "[useAssets] Failed to fetch assets:",
        fetchErr,
      );
    } finally {
      loading.value = false;
    }
  }

  async function ensureAssetsLoaded(): Promise<void> {
    await callOnce(ASSET_ONCE_KEY, fetchAssetsFromCatalog);
  }

  onServerPrefetch(ensureAssetsLoaded);
  if (import.meta.client) {
    void ensureAssetsLoaded();
  }

  const assets = computed(() => {
    const source = allAssets.value;

    return source
      .filter((access) => !access.isHidden)
      .map((access) => ({
        ...access,
        matchedProducts: access.matchedProductIds
          .map((productId) =>
            products.value.find((product) => product.id === productId),
          )
          .filter((product): product is Product => !!product)
          .map((product) => ({
            id: product.id,
            slug: product.slug,
            categoryKey: product.categories[0] ?? "all",
            name: product.name,
            thumbnail: product.thumbnail,
          })),
      }))
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.en.localeCompare(b.name.en),
      );
  });

  function getAssetById(id: string) {
    return computed(() =>
      assets.value.find((access) => access.id === id),
    );
  }

  function getAssetsByProductId(productId: string) {
    return computed(() =>
      assets.value.filter((access) =>
        access.matchedProductIds.includes(productId),
      ),
    );
  }

  function getAssetBrowsePath(access: Asset): string | null {
    const primaryProduct = access.matchedProducts[0];
    if (!primaryProduct) return null;
    return `/product-${primaryProduct.categoryKey}/${primaryProduct.slug}?asset=${access.id}`;
  }

  function getAssetShowPath(access: Asset): string {
    return `/asset/${access.slug}`;
  }

  return {
    assets,
    loading,
    error,
    getAssetById,
    getAssetsByProductId,
    getAssetBrowsePath,
    getAssetShowPath,
  };
}
