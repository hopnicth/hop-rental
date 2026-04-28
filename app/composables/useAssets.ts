import type { LocalizedString } from "~/types/locale";
import type { Product } from "~/types/product";
import type {
  Asset,
  AssetDetailBlock,
  AssetDetailBlockDocument,
  AssetDetailBlockDocumentKind,
  AssetDetailBlockImage,
  AssetMatch,
} from "~/types/asset";

const DOCUMENT_KINDS: AssetDetailBlockDocumentKind[] = [
  "manual",
  "catalog",
  "datasheet",
  "guide",
  "report",
  "other",
];

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

function localizedFromBlock(
  raw: Record<string, unknown>,
  field: string,
): LocalizedString | undefined {
  const flat = raw[field];
  if (isRecord(flat)) {
    const th = toString(flat.th);
    const en = toString(flat.en);
    if (!th && !en && !toString(flat.cn) && !toString(flat.jp))
      return undefined;
    const fallback = th ?? en ?? "";
    return {
      th: th ?? en ?? fallback,
      en: en ?? th ?? fallback,
      cn: toString(flat.cn) ?? en ?? th ?? fallback,
      jp: toString(flat.jp) ?? en ?? th ?? fallback,
    };
  }
  const th = toString(raw[`${field}_th`]);
  const en = toString(raw[`${field}_en`]);
  const cn = toString(raw[`${field}_cn`]);
  const jp = toString(raw[`${field}_jp`]);
  if (!th && !en && !cn && !jp) return undefined;
  const fallback = th ?? en ?? "";
  return {
    th: th ?? en ?? fallback,
    en: en ?? th ?? fallback,
    cn: cn ?? en ?? th ?? fallback,
    jp: jp ?? en ?? th ?? fallback,
  };
}

function normalizeBlockImage(
  raw: unknown,
  index: number,
): AssetDetailBlockImage | null {
  if (!isRecord(raw)) return null;
  const url =
    toString(raw.url) ??
    toString(isRecord(raw.variants) ? raw.variants.large : undefined) ??
    toString(isRecord(raw.variants) ? raw.variants.card : undefined);
  if (!url) return null;
  const variantsRaw = isRecord(raw.variants) ? raw.variants : null;
  const variants = variantsRaw
    ? {
        thumbnail: toString(variantsRaw.thumbnail),
        card: toString(variantsRaw.card),
        large: toString(variantsRaw.large),
      }
    : undefined;
  return {
    id: toString(raw.id) ?? `image-${index + 1}`,
    url,
    variants,
    caption: toString(raw.caption),
    altText: toString(raw.altText) ?? toString(raw.alt_text),
  };
}

function normalizeBlockDocument(
  raw: unknown,
  index: number,
): AssetDetailBlockDocument | null {
  if (!isRecord(raw)) return null;
  const url = toString(raw.url);
  if (!url) return null;
  const kindRaw = toString(raw.kind) ?? "other";
  const kind: AssetDetailBlockDocumentKind = (
    DOCUMENT_KINDS as string[]
  ).includes(kindRaw)
    ? (kindRaw as AssetDetailBlockDocumentKind)
    : "other";
  return {
    id: toString(raw.id) ?? `doc-${index + 1}`,
    url,
    kind,
    title: toString(raw.title) ?? `Document ${index + 1}`,
    filename: toString(raw.filename),
    mimeType: toString(raw.mimeType) ?? toString(raw.mime_type),
    sizeBytes:
      typeof raw.sizeBytes === "number"
        ? raw.sizeBytes
        : typeof raw.size_bytes === "number"
          ? raw.size_bytes
          : undefined,
  };
}

function normalizeDetailBlock(
  raw: unknown,
  index: number,
): AssetDetailBlock | null {
  if (!isRecord(raw)) return null;
  const key = toString(raw.key) ?? toString(raw.type) ?? `block-${index + 1}`;
  const title = localizedFromBlock(raw, "title");
  const body = localizedFromBlock(raw, "body");
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    : undefined;
  const images = Array.isArray(raw.images)
    ? raw.images
        .map((entry, i) => normalizeBlockImage(entry, i))
        .filter((entry): entry is AssetDetailBlockImage => !!entry)
    : undefined;
  const documents = Array.isArray(raw.documents)
    ? raw.documents
        .map((entry, i) => normalizeBlockDocument(entry, i))
        .filter((entry): entry is AssetDetailBlockDocument => !!entry)
    : undefined;
  if (
    !title &&
    !body &&
    !(items && items.length > 0) &&
    !(images && images.length > 0) &&
    !(documents && documents.length > 0)
  ) {
    return null;
  }
  return {
    key,
    ...(title ? { title } : {}),
    ...(body ? { body } : {}),
    ...(items && items.length > 0 ? { items } : {}),
    ...(images && images.length > 0 ? { images } : {}),
    ...(documents && documents.length > 0 ? { documents } : {}),
  };
}

function normalizeDetailBlocks(value: unknown): AssetDetailBlock[] {
  const usedKeys = new Set<string>();
  const ensureUniqueKey = (rawKey: string) => {
    let key = rawKey;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${rawKey}-${suffix++}`;
    }
    usedKeys.add(key);
    return key;
  };
  if (Array.isArray(value)) {
    return value
      .map((entry, idx) => normalizeDetailBlock(entry, idx))
      .filter((block): block is AssetDetailBlock => !!block)
      .map((block) => ({ ...block, key: ensureUniqueKey(block.key) }));
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, entry], idx) => {
        const block = normalizeDetailBlock(entry, idx);
        return block ? { ...block, key: toString(key) ?? block.key } : null;
      })
      .filter((block): block is AssetDetailBlock => !!block)
      .map((block) => ({ ...block, key: ensureUniqueKey(block.key) }));
  }
  return [];
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
  const matches: AssetMatch[] = matchRows
    .map((match) =>
      isRecord(match)
        ? {
            productId: toString(match.product_id),
            matchType: toString(match.match_type) ?? "compatible",
            sortOrder: toNumber(match.sort_order),
          }
        : null,
    )
    .filter(
      (item): item is AssetMatch =>
        !!item && typeof item.productId === "string",
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const matchedProductIds = matches.map((item) => item.productId);

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
    mainCategoryKey: toString(row.main_category_key),
    tagKeys: toStringArray(row.tag_keys),
    filterKeys: toStringArray(row.filter_keys),
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
    matches,
    matchedProducts: [],
    detailBlocks: normalizeDetailBlocks(row.detail_blocks),
    createdAt: toString(row.created_at),
    updatedAt: toString(row.updated_at),
  };
}

export function useAssets() {
  const supabase = useSupabaseClient();
  const { products } = useProducts();
  const allAssets = useState<Asset[]>("catalog:assets", () => []);
  const hasRemoteAssets = useState<boolean>(
    "catalog:assets:remote",
    () => false,
  );
  const loading = useState<boolean>("catalog:assets:loading", () => false);
  const error = useState<string | null>("catalog:assets:error", () => null);

  async function fetchAssetsFromCatalog(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: fetchError } = await supabase
        .from("assets")
        .select(
          `id, code, slug, status, name_th, name_en, name_cn, name_jp, description_th, description_en, description_cn, description_jp, category_keys, main_category_key, tag_keys, filter_keys, brand, thumbnail_url, image_urls, spec_summary, detail_blocks, currency_code, daily_rate, weekly_rate, monthly_rate, daily_enabled, weekly_enabled, monthly_enabled, deposit_amount, min_rental_days, max_rental_days, buffer_days, storage_location_code, storage_location_note, service_cycle_value, service_cycle_unit, last_serviced_at, next_service_due_at, view_count, rental_count, last_rented_at, sort_order, is_hidden, created_at, updated_at, matches:asset_matches(product_id, match_type, sort_order)`,
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
        fetchErr instanceof Error ? fetchErr.message : "Unknown asset error";
      console.warn("[useAssets] Failed to fetch assets:", fetchErr);
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
    return computed(() => assets.value.find((access) => access.id === id));
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
