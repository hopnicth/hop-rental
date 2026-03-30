import type {
  CatalogDocumentRecord,
  CatalogLocalizedFields,
  CatalogProductRecord,
  CatalogProductSKURecord,
} from "~/types/catalog";
import type {
  Product,
  ProductDoc,
  ProductDocFile,
  ProductPrice,
  ProductSKU,
  RentalPrice,
  SKUStock,
} from "~/types/product";
import type { LocalizedString } from "~/types/locale";

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

function toProductDocFile(
  doc?: CatalogDocumentRecord,
): ProductDocFile | undefined {
  if (!doc) return undefined;

  return {
    url: doc.url,
    name: toLocalizedString(doc.name),
  };
}

function toProductDocs(record: CatalogProductRecord): ProductDoc {
  return {
    manual: toProductDocFile(record.documents?.manual),
    catalog: toProductDocFile(record.documents?.catalog),
    datasheet: toProductDocFile(record.documents?.datasheet),
  };
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

function toRentalPrice(record: CatalogProductSKURecord): RentalPrice {
  return {
    deposit: record.rental_deposit ?? 0,
    daily: record.rental_daily ?? 0,
    weekly: record.rental_weekly ?? 0,
    monthly: record.rental_monthly ?? 0,
  };
}

function toSkuStock(
  record: CatalogProductSKURecord,
  productType: CatalogProductRecord["type"],
): SKUStock {
  const available =
    productType === "sale"
      ? 0
      : (record.rental_stock ?? (record.rental_daily ? record.stock : 0));

  return {
    inStock: productType === "rental" ? 0 : record.stock,
    available,
    reserved: record.reserved_stock ?? 0,
  };
}

export function mapCatalogSkuToProductSku(
  record: CatalogProductSKURecord,
  productType: CatalogProductRecord["type"],
): ProductSKU {
  return {
    id: record.id,
    label: toLocalizedString({
      th: record.label_th,
      en: record.label_en,
      cn: record.label_cn,
      jp: record.label_jp,
    }),
    attributes: record.attributes ?? {},
    image: record.image_url,
    images: record.image_urls,
    price: toProductPrice(record),
    rentalPrice: toRentalPrice(record),
    stock: toSkuStock(record, productType),
  };
}

export function mapCatalogProductToProduct(
  record: CatalogProductRecord,
): Product {
  const now = new Date().toISOString();
  const isForSale = record.type !== "rental";
  const isRental = record.type !== "sale";

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
    thumbnail: record.thumbnail_url ?? PRODUCT_PLACEHOLDER_IMAGE,
    images: record.image_urls ?? [],
    description: toLocalizedString({
      th: record.description_th,
      en: record.description_en,
      cn: record.description_cn,
      jp: record.description_jp,
    }),
    spec: record.spec ?? {},
    doc: toProductDocs(record),
    suppliers: record.supplier_ids ?? [],
    isForSale,
    skus: record.skus.map((sku) => mapCatalogSkuToProductSku(sku, record.type)),
    rentalConfig: {
      isRental,
      minDays: record.rental_min_days ?? 1,
      maxDays: record.rental_max_days ?? 0,
      bufferDays: record.rental_buffer_days ?? 0,
      storeLocationIds: record.store_location_ids ?? [],
    },
    insight: {
      viewCount: record.view_count ?? 0,
      addToCartCount: record.add_to_cart_count ?? 0,
      orderCount: record.order_count ?? 0,
      rentalCount: record.rental_count ?? 0,
      wishlistCount: record.wishlist_count ?? 0,
      avgRating: record.avg_rating ?? 0,
      reviewCount: record.review_count ?? 0,
      returnRate: record.return_rate ?? 0,
      trendingScore: record.trending_score ?? 0,
      lastSoldAt: record.last_sold_at,
      lastRentedAt: record.last_rented_at,
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
