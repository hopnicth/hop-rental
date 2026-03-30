import type { CatalogProductRecord } from "~/types/catalog";

const DEFAULT_THUMBNAIL =
  "https://placehold.co/400x400/E0E0E0/757575?text=Catalog+Product&font=roboto";

export function createMockCatalogProduct(
  overrides: Partial<CatalogProductRecord> = {},
): CatalogProductRecord {
  const now = new Date().toISOString();

  return {
    id: "catalog-prod-000",
    slug: "catalog-sample-product",
    type: "sale",
    name_th: "สินค้าตัวอย่างจากแคตตาล็อก",
    name_en: "Sample Catalog Product",
    description_th: "ข้อมูลสินค้าตัวอย่างใน transitional catalog shape",
    description_en: "Sample product data in the transitional catalog shape.",
    category_keys: [],
    brand: "Generic",
    thumbnail_url: DEFAULT_THUMBNAIL,
    image_urls: [],
    spec: {},
    documents: {},
    supplier_ids: [],
    skus: [
      {
        id: "catalog-sku-000-default",
        product_id: "catalog-prod-000",
        label_th: "มาตรฐาน",
        label_en: "Standard",
        price: 0,
        stock: 0,
      },
    ],
    rental_min_days: 1,
    rental_max_days: 0,
    rental_buffer_days: 0,
    store_location_ids: [],
    view_count: 0,
    add_to_cart_count: 0,
    order_count: 0,
    rental_count: 0,
    wishlist_count: 0,
    avg_rating: 0,
    review_count: 0,
    return_rate: 0,
    trending_score: 0,
    is_hidden: false,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export const mockCatalogProducts: CatalogProductRecord[] = [
  createMockCatalogProduct({
    id: "catalog-prod-101",
    slug: "bosch-rotary-hammer-kit-series",
    type: "hybrid",
    name_th: "สว่านโรตารี่ Bosch ชุดคิท",
    name_en: "Bosch Rotary Hammer Kit Series",
    description_th:
      "สินค้าทดลองแบบ hybrid มีหลาย SKU สำหรับทั้งซื้อและเช่า ใช้ทดสอบ flow ใหม่ของสินค้า/SKU/cart.",
    description_en:
      "Hybrid multi-SKU fixture for testing the new product, SKU, booking, and cart flow.",
    category_keys: ["mechanic_tools", "m01"],
    brand: "Bosch",
    thumbnail_url:
      "https://placehold.co/400x400/1565C0/FFFFFF?text=Bosch+Kit&font=roboto",
    image_urls: [
      "https://placehold.co/800x600/1565C0/FFFFFF?text=Bosch+Kit+1&font=roboto",
      "https://placehold.co/800x600/1565C0/FFFFFF?text=Bosch+Kit+2&font=roboto",
      "https://placehold.co/800x600/0D47A1/FFFFFF?text=Bosch+Kit+3&font=roboto",
    ],
    spec: {
      power: "800W",
      voltage: "220V",
      weight: "2.9kg",
    },
    documents: {
      manual: {
        url: "/docs/bosch-kit-manual.pdf",
        name: {
          th: "คู่มือชุดคิท Bosch",
          en: "Bosch kit manual",
        },
      },
    },
    supplier_ids: ["sup-001", "sup-002"],
    skus: [
      {
        id: "catalog-sku-101-standard",
        product_id: "catalog-prod-101",
        label_th: "ชุดมาตรฐาน",
        label_en: "Standard Kit",
        price: 4900,
        original_price: 5400,
        discount_percent: 9,
        stock: 12,
        image_url:
          "https://placehold.co/800x600/1565C0/FFFFFF?text=Bosch+Standard+Kit&font=roboto",
        image_urls: [
          "https://placehold.co/800x600/1565C0/FFFFFF?text=Bosch+Standard+Kit+1&font=roboto",
          "https://placehold.co/800x600/1976D2/FFFFFF?text=Bosch+Standard+Kit+2&font=roboto",
          "https://placehold.co/800x600/0D47A1/FFFFFF?text=Bosch+Standard+Kit+3&font=roboto",
        ],
        rental_deposit: 3500,
        rental_daily: 350,
        rental_weekly: 2100,
        rental_monthly: 6900,
        rental_stock: 4,
        reserved_stock: 1,
        attributes: {
          kit: "standard",
        },
      },
      {
        id: "catalog-sku-101-pro",
        product_id: "catalog-prod-101",
        label_th: "ชุดโปร",
        label_en: "Pro Kit",
        price: 6900,
        original_price: 7600,
        discount_percent: 9,
        stock: 8,
        image_url:
          "https://placehold.co/800x600/0D47A1/FFFFFF?text=Bosch+Pro+Kit&font=roboto",
        image_urls: [
          "https://placehold.co/800x600/0D47A1/FFFFFF?text=Bosch+Pro+Kit+1&font=roboto",
          "https://placehold.co/800x600/283593/FFFFFF?text=Bosch+Pro+Kit+2&font=roboto",
          "https://placehold.co/800x600/1A237E/FFFFFF?text=Bosch+Pro+Kit+3&font=roboto",
        ],
        rental_deposit: 5000,
        rental_daily: 490,
        rental_weekly: 2940,
        rental_monthly: 9600,
        rental_stock: 3,
        reserved_stock: 1,
        attributes: {
          kit: "pro",
        },
      },
    ],
    rental_min_days: 1,
    rental_max_days: 30,
    rental_buffer_days: 1,
    store_location_ids: ["store-001", "store-002"],
    view_count: 820,
    add_to_cart_count: 120,
    order_count: 43,
    rental_count: 19,
    wishlist_count: 28,
    avg_rating: 4.6,
    review_count: 17,
    trending_score: 68,
  }),
  createMockCatalogProduct({
    id: "catalog-prod-102",
    slug: "uvex-safety-shoes-s3-size-series",
    type: "sale",
    name_th: "รองเท้านิรภัย Uvex S3 หลายไซซ์",
    name_en: "Uvex Safety Shoes S3 Size Series",
    description_th:
      "สินค้าทดลองแบบ sale multi-SKU สำหรับทดสอบการเลือกขนาดก่อนเพิ่มลงตะกร้า.",
    description_en:
      "Sale-only multi-SKU fixture for testing size selection before add-to-cart.",
    category_keys: ["ppe_general", "p01"],
    brand: "Uvex",
    thumbnail_url:
      "https://placehold.co/400x400/37474F/FFFFFF?text=Uvex+S3&font=roboto",
    image_urls: [
      "https://placehold.co/800x600/37474F/FFFFFF?text=Uvex+S3+1&font=roboto",
      "https://placehold.co/800x600/455A64/FFFFFF?text=Uvex+S3+2&font=roboto",
      "https://placehold.co/800x600/263238/FFFFFF?text=Uvex+S3+3&font=roboto",
    ],
    spec: {
      color: "Black/Yellow",
      material: "Leather",
    },
    supplier_ids: ["sup-005"],
    skus: [
      {
        id: "catalog-sku-102-41",
        product_id: "catalog-prod-102",
        label_th: "ไซซ์ 41",
        label_en: "Size 41",
        price: 3200,
        original_price: 3200,
        stock: 10,
        image_url:
          "https://placehold.co/800x600/37474F/FFFFFF?text=Uvex+Size+41&font=roboto",
        image_urls: [
          "https://placehold.co/800x600/37474F/FFFFFF?text=Uvex+41+Front&font=roboto",
          "https://placehold.co/800x600/455A64/FFFFFF?text=Uvex+41+Side&font=roboto",
        ],
        attributes: { size: "41" },
      },
      {
        id: "catalog-sku-102-42",
        product_id: "catalog-prod-102",
        label_th: "ไซซ์ 42",
        label_en: "Size 42",
        price: 3200,
        original_price: 3200,
        stock: 14,
        image_url:
          "https://placehold.co/800x600/455A64/FFFFFF?text=Uvex+Size+42&font=roboto",
        image_urls: [
          "https://placehold.co/800x600/455A64/FFFFFF?text=Uvex+42+Front&font=roboto",
          "https://placehold.co/800x600/546E7A/FFFFFF?text=Uvex+42+Side&font=roboto",
        ],
        attributes: { size: "42" },
      },
      {
        id: "catalog-sku-102-43",
        product_id: "catalog-prod-102",
        label_th: "ไซซ์ 43",
        label_en: "Size 43",
        price: 3200,
        original_price: 3200,
        stock: 9,
        image_url:
          "https://placehold.co/800x600/263238/FFFFFF?text=Uvex+Size+43&font=roboto",
        image_urls: [
          "https://placehold.co/800x600/263238/FFFFFF?text=Uvex+43+Front&font=roboto",
          "https://placehold.co/800x600/37474F/FFFFFF?text=Uvex+43+Side&font=roboto",
        ],
        attributes: { size: "43" },
      },
    ],
    view_count: 330,
    add_to_cart_count: 72,
    order_count: 31,
    wishlist_count: 22,
    avg_rating: 4.4,
    review_count: 11,
    trending_score: 39,
  }),
  createMockCatalogProduct({
    id: "catalog-prod-103",
    slug: "bosch-laser-level-rental-pack",
    type: "rental",
    name_th: "เลเซอร์วัดระดับ Bosch สำหรับเช่า",
    name_en: "Bosch Laser Level Rental Pack",
    description_th:
      "สินค้าทดลองแบบ rental multi-SKU สำหรับทดสอบ flow การจองพร้อมชุดอุปกรณ์เสริม.",
    description_en:
      "Rental-only multi-SKU fixture for testing booking flow with accessory bundles.",
    category_keys: ["measuring_tools", "me02"],
    brand: "Bosch",
    thumbnail_url:
      "https://placehold.co/400x400/2E7D32/FFFFFF?text=Laser+Rental&font=roboto",
    image_urls: [
      "https://placehold.co/800x600/2E7D32/FFFFFF?text=Laser+Rental+1&font=roboto",
      "https://placehold.co/800x600/388E3C/FFFFFF?text=Laser+Rental+2&font=roboto",
      "https://placehold.co/800x600/1B5E20/FFFFFF?text=Laser+Rental+3&font=roboto",
    ],
    supplier_ids: ["sup-001"],
    skus: [
      {
        id: "catalog-sku-103-standard",
        product_id: "catalog-prod-103",
        label_th: "เฉพาะตัวเครื่อง",
        label_en: "Tool Only",
        price: 0,
        stock: 0,
        image_url:
          "https://placehold.co/800x600/2E7D32/FFFFFF?text=Laser+Tool+Only&font=roboto",
        image_urls: [
          "https://placehold.co/800x600/2E7D32/FFFFFF?text=Laser+Tool+Only+1&font=roboto",
          "https://placehold.co/800x600/388E3C/FFFFFF?text=Laser+Tool+Only+2&font=roboto",
          "https://placehold.co/800x600/1B5E20/FFFFFF?text=Laser+Tool+Only+3&font=roboto",
        ],
        rental_deposit: 4000,
        rental_daily: 450,
        rental_weekly: 2600,
        rental_monthly: 8800,
        rental_stock: 5,
        reserved_stock: 2,
      },
      {
        id: "catalog-sku-103-tripod",
        product_id: "catalog-prod-103",
        label_th: "พร้อมขาตั้ง",
        label_en: "With Tripod",
        price: 0,
        stock: 0,
        image_url:
          "https://placehold.co/800x600/1B5E20/FFFFFF?text=Laser+With+Tripod&font=roboto",
        image_urls: [
          "https://placehold.co/800x600/1B5E20/FFFFFF?text=Laser+Tripod+1&font=roboto",
          "https://placehold.co/800x600/2E7D32/FFFFFF?text=Laser+Tripod+2&font=roboto",
          "https://placehold.co/800x600/33691E/FFFFFF?text=Laser+Tripod+3&font=roboto",
        ],
        rental_deposit: 5000,
        rental_daily: 520,
        rental_weekly: 3050,
        rental_monthly: 9900,
        rental_stock: 3,
        reserved_stock: 1,
      },
    ],
    rental_min_days: 1,
    rental_max_days: 14,
    rental_buffer_days: 1,
    store_location_ids: ["store-001"],
    rental_count: 24,
    view_count: 410,
    wishlist_count: 16,
    avg_rating: 4.8,
    review_count: 9,
    trending_score: 57,
  }),
];
