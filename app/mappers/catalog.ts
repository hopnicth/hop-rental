import type {
  CatalogLocalizedFields,
  CatalogMediaGalleryItemRecord,
  CatalogProductMetricsRecord,
  CatalogProductRecord,
  CatalogProductSKURecord,
} from "~/types/catalog";
import type {
  Product,
  ProductDocumentLink,
  ProductMediaLink,
  ProductPrice,
  ProductSKU,
  SKUStock,
} from "~/types/product";
import type { LocalizedString } from "~/types/locale";
import { DEFAULT_SHIPPING_SIZE, type ShippingSize } from "~/config/shipping";

function normalizeShippingSize(value: string | null | undefined): ShippingSize {
  if (
    value === "free" ||
    value === "s" ||
    value === "m" ||
    value === "l" ||
    value === "xl"
  ) {
    return value;
  }
  return DEFAULT_SHIPPING_SIZE;
}

const PRODUCT_PLACEHOLDER_IMAGE =
  "https://placehold.co/400x400/E0E0E0/757575?text=Product&font=roboto";

function toLocalizedString(value: CatalogLocalizedFields): LocalizedString {
  const th = value.th || value.en;
  const en = value.en || value.th;

  return {
    th,
    en,
    cn: value.cn ?? en,
    jp: value.jp ?? en,
  };
}

function mediaVariantUrl(
  item: CatalogMediaGalleryItemRecord,
  key: "large" | "card" | "thumbnail",
) {
  return item.variants?.[key]?.url;
}

function mediaGalleryImageUrls(
  items?: CatalogMediaGalleryItemRecord[],
): string[] {
  return (items ?? [])
    .filter((item) => item.status === "ready")
    .map(
      (item) =>
        mediaVariantUrl(item, "large") ||
        mediaVariantUrl(item, "card") ||
        mediaVariantUrl(item, "thumbnail") ||
        "",
    )
    .filter(Boolean);
}

function mediaGalleryPrimaryUrl(items?: CatalogMediaGalleryItemRecord[]) {
  return (items ?? [])
    .filter((item) => item.status === "ready")
    .map(
      (item) =>
        mediaVariantUrl(item, "card") ||
        mediaVariantUrl(item, "thumbnail") ||
        mediaVariantUrl(item, "large") ||
        "",
    )
    .find(Boolean);
}

function toProductDocumentLinks(
  record: CatalogProductRecord,
): ProductDocumentLink[] {
  return (record.documents ?? []).map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    url: item.url,
  }));
}

function toProductMediaLinks(record: CatalogProductRecord): ProductMediaLink[] {
  return (record.media_links ?? []).map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    url: item.url,
    thumbnailUrl: item.thumbnailUrl,
  }));
}

function toProductPrice(record: CatalogProductSKURecord): ProductPrice {
  const final = record.price;
  const original =
    record.original_price && record.original_price >= final
      ? record.original_price
      : final;
  const discount =
    record.discount_percent ??
    (original > final ? Math.round(((original - final) / original) * 100) : 0);

  return {
    original,
    discount,
    final,
  };
}

function toSkuStock(record: CatalogProductSKURecord): SKUStock {
  return {
    inStock: record.stock,
    available: record.stock,
    reserved: 0,
  };
}

function toProductMetrics(
  value?: CatalogProductRecord["metrics"],
): CatalogProductMetricsRecord {
  if (Array.isArray(value)) {
    return value[0] ?? {};
  }

  return value ?? {};
}

export function mapCatalogSkuToProductSku(
  record: CatalogProductSKURecord,
): ProductSKU {
  const images = mediaGalleryImageUrls(record.media_gallery);

  return {
    id: record.id,
    label: toLocalizedString({
      th: record.label_th,
      en: record.label_en,
      cn: record.label_cn,
      jp: record.label_jp,
    }),
    attributes: record.attributes ?? {},
    image: mediaGalleryPrimaryUrl(record.media_gallery),
    images,
    useProductImages: record.use_product_images ?? true,
    price: toProductPrice(record),
    stock: toSkuStock(record),
  };
}

export function mapCatalogProductToProduct(
  record: CatalogProductRecord,
): Product {
  const now = new Date().toISOString();
  const isForSale = record.type !== "rental";
  const images = mediaGalleryImageUrls(record.media_gallery);
  const metrics = toProductMetrics(record.metrics);

  return {
    id: record.id,
    slug: record.slug,
    categories: record.category_keys ?? [],
    name: toLocalizedString({
      th: record.name_th,
      en: record.name_en,
      cn: record.name_cn,
      jp: record.name_jp,
    }),
    brand: record.brand ?? "Generic",
    thumbnail:
      mediaGalleryPrimaryUrl(record.media_gallery) ?? PRODUCT_PLACEHOLDER_IMAGE,
    images,
    description: toLocalizedString({
      th: record.description_th,
      en: record.description_en,
      cn: record.description_cn,
      jp: record.description_jp,
    }),
    spec: record.spec ?? {},
    documents: toProductDocumentLinks(record),
    mediaLinks: toProductMediaLinks(record),
    detailBlocks: record.detail_blocks,
    suppliers: record.supplier_ids ?? [],
    isForSale,
    skus: record.skus.map((sku) => mapCatalogSkuToProductSku(sku)),
    shippingSize: normalizeShippingSize(record.shipping_size),
    insight: {
      viewCount: metrics.view_count ?? 0,
      addToCartCount: metrics.add_to_cart_count ?? 0,
      orderCount: metrics.order_count ?? 0,
      rentalCount: metrics.rental_count ?? 0,
      wishlistCount: metrics.wishlist_count ?? 0,
      avgRating: metrics.avg_rating ?? 0,
      reviewCount: metrics.review_count ?? 0,
      returnRate: metrics.return_rate ?? 0,
      trendingScore: metrics.trending_score ?? 0,
      lastSoldAt: metrics.last_sold_at,
      lastRentedAt: metrics.last_rented_at,
    },
    createdAt: record.created_at ?? now,
    updatedAt: record.updated_at ?? now,
    isHide: record.is_hidden ?? false,
  };
}

export function mapCatalogProductsToProducts(
  records: CatalogProductRecord[],
): Product[] {
  return records.map(mapCatalogProductToProduct);
}
