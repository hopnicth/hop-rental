import type { Product } from "~/types/product";
import { mapCatalogProductsToProducts } from "~/mappers/catalog";
import { mockCatalogProducts } from "~/mock/catalog-products";

// ─────────────────────────────────────────────
// Factory function
// ─────────────────────────────────────────────

/**
 * Create a mock product with sensible defaults.
 * Pass `overrides` to customise any field.
 *
 * Usage:
 * ```ts
 * const drill = createMockProduct({
 *   id: 'prod-001',
 *   name: { th: 'สว่าน', en: 'Drill', cn: '电钻', jp: 'ドリル' },
 * });
 * ```
 */
export function createMockProduct(overrides: Partial<Product> = {}): Product {
  const now = new Date().toISOString();

  const defaults: Product = {
    id: "prod-000",
    slug: "default-product",
    categories: [],
    name: {
      th: "สินค้าตัวอย่าง",
      en: "Sample Product",
      cn: "示例产品",
      jp: "サンプル商品",
    },
    brand: "Generic",
    thumbnail:
      "https://placehold.co/400x400/E0E0E0/757575?text=Product&font=roboto",
    images: [],
    description: {
      th: "รายละเอียดสินค้าตัวอย่าง",
      en: "Sample product description",
      cn: "示例产品描述",
      jp: "サンプル商品の説明",
    },
    spec: {},
    doc: {},
    suppliers: [],
    isForSale: true,
    skus: [
      {
        id: "sku-000-default",
        attributes: {},
        price: { original: 0, discount: 0, final: 0 },
        rentalPrice: { deposit: 0, daily: 0, weekly: 0, monthly: 0 },
        stock: { inStock: 0, available: 0, reserved: 0 },
      },
    ],
    rentalConfig: {
      isRental: false,
      minDays: 1,
      maxDays: 0,
      bufferDays: 1,
      storeLocationIds: [],
    },
    insight: {
      viewCount: 0,
      addToCartCount: 0,
      orderCount: 0,
      rentalCount: 0,
      wishlistCount: 0,
      avgRating: 0,
      reviewCount: 0,
      returnRate: 0,
      trendingScore: 0,
    },
    createdAt: now,
    updatedAt: now,
    isHide: false,
  };

  return { ...defaults, ...overrides };
}

// ─────────────────────────────────────────────
// Mock products
// ─────────────────────────────────────────────

/**
 * Mock product list — 20 realistic equipment items.
 *
 * TODO: Replace with useFetch() / API call when Admin dashboard is ready.
 */
export const legacyMockProducts: Product[] = [
  createMockProduct({
    id: "prod-001",
    slug: "bosch-electric-drill-gsb-550",
    categories: ["mechanic_tools", "m01"],
    name: {
      th: "สว่านไฟฟ้า Bosch GSB 550",
      en: "Bosch Electric Drill GSB 550",
      cn: "博世电钻 GSB 550",
      jp: "ボッシュ電動ドリル GSB 550",
    },
    brand: "Bosch",
    thumbnail:
      "https://placehold.co/400x400/1565C0/FFFFFF?text=Bosch+Drill&font=roboto",
    images: [
      "https://placehold.co/800x600/1565C0/FFFFFF?text=Bosch+Drill+1&font=roboto",
      "https://placehold.co/800x600/1565C0/FFFFFF?text=Bosch+Drill+2&font=roboto",
    ],
    description: {
      th: "สว่านกระแทกไฟฟ้า 550 วัตต์ เหมาะสำหรับงานเจาะคอนกรีต ไม้ และเหล็ก ใช้งานง่าย ทนทาน",
      en: "550W impact drill for concrete, wood and metal. Easy to use and durable.",
      cn: "550瓦冲击钻，适用于混凝土、木材和金属钻孔，易于使用且耐用",
      jp: "コンクリート・木材・金属用550Wインパクトドリル。使いやすく耐久性抜群",
    },
    spec: {
      size: "280×70mm",
      weight: "1.7kg",
      color: "Blue",
      power: "550W",
      voltage: "220V",
    },
    suppliers: ["sup-001", "sup-002"],
    isForSale: true,
    skus: [
      {
        id: "sku-001-default",
        attributes: {},
        price: { original: 2500, discount: 15, final: 2125 },
        rentalPrice: { deposit: 3000, daily: 200, weekly: 1200, monthly: 4000 },
        stock: { inStock: 25, available: 5, reserved: 2 },
      },
    ],
    rentalConfig: {
      isRental: true,
      minDays: 1,
      maxDays: 30,
      bufferDays: 1,
      storeLocationIds: ["store-001", "store-002"],
    },
    insight: {
      viewCount: 1520,
      addToCartCount: 340,
      orderCount: 180,
      rentalCount: 95,
      wishlistCount: 210,
      avgRating: 4.6,
      reviewCount: 87,
      returnRate: 2.1,
      trendingScore: 78,
      lastSoldAt: "2026-02-15T10:30:00Z",
      lastRentedAt: "2026-02-14T08:00:00Z",
    },
  }),

  createMockProduct({
    id: "prod-002",
    slug: "3m-safety-helmet-h-700",
    categories: ["safety_equipment", "s05"],
    name: {
      th: "หมวกนิรภัย 3M H-700",
      en: "3M Safety Helmet H-700",
      cn: "3M安全帽 H-700",
      jp: "3M安全ヘルメット H-700",
    },
    brand: "3M",
    thumbnail:
      "https://placehold.co/400x400/D32F2F/FFFFFF?text=3M+Helmet&font=roboto",
    images: [
      "https://placehold.co/800x600/D32F2F/FFFFFF?text=3M+Helmet+1&font=roboto",
    ],
    description: {
      th: "หมวกนิรภัยมาตรฐาน มีระบบรองในปรับขนาดได้ น้ำหนักเบา ระบายอากาศดี",
      en: "Standard safety helmet with adjustable suspension. Lightweight and well-ventilated.",
      cn: "标准安全帽，可调节内衬，轻便透气",
      jp: "調整可能なサスペンション付き標準安全ヘルメット。軽量で通気性良好",
    },
    spec: {
      size: "Free size",
      weight: "310g",
      color: "White",
      material: "HDPE",
    },
    suppliers: ["sup-001", "sup-005"],
    isForSale: true,
    skus: [
      {
        id: "sku-002-default",
        attributes: {},
        price: { original: 350, discount: 0, final: 350 },
        rentalPrice: { deposit: 500, daily: 30, weekly: 150, monthly: 450 },
        stock: { inStock: 150, available: 20, reserved: 5 },
      },
    ],
    rentalConfig: {
      isRental: true,
      minDays: 1,
      maxDays: 90,
      bufferDays: 0,
      storeLocationIds: ["store-001"],
    },
    insight: {
      viewCount: 980,
      addToCartCount: 420,
      orderCount: 310,
      rentalCount: 45,
      wishlistCount: 85,
      avgRating: 4.3,
      reviewCount: 52,
      returnRate: 1.5,
      trendingScore: 62,
      lastSoldAt: "2026-02-16T14:20:00Z",
      lastRentedAt: "2026-02-10T09:00:00Z",
    },
  }),

  createMockProduct({
    id: "prod-003",
    slug: "makita-angle-grinder-ga4030",
    categories: ["mechanic_tools", "m03"],
    name: {
      th: "เครื่องเจียร Makita GA4030",
      en: "Makita Angle Grinder GA4030",
      cn: "牧田角磨机 GA4030",
      jp: "マキタ ディスクグラインダ GA4030",
    },
    brand: "Makita",
    thumbnail:
      "https://placehold.co/400x400/00897B/FFFFFF?text=Makita+Grinder&font=roboto",
    images: [
      "https://placehold.co/800x600/00897B/FFFFFF?text=Makita+Grinder+1&font=roboto",
      "https://placehold.co/800x600/00897B/FFFFFF?text=Makita+Grinder+2&font=roboto",
    ],
    description: {
      th: "เครื่องเจียร 4 นิ้ว 720 วัตต์ รอบสูง ตัดเหล็ก ขัดผิว ใช้งานหนักได้",
      en: "4-inch 720W angle grinder. High RPM for cutting and grinding metal.",
      cn: "4英寸720瓦角磨机，高转速，适用于金属切割和打磨",
      jp: "4インチ720Wディスクグラインダ。金属の切断・研磨に最適",
    },
    spec: {
      size: "4 inch",
      weight: "1.8kg",
      color: "Teal",
      power: "720W",
      voltage: "220V",
      ampere: "3.4A",
    },
    suppliers: ["sup-002", "sup-006"],
    isForSale: true,
    skus: [
      {
        id: "sku-003-default",
        attributes: {},
        price: { original: 1890, discount: 10, final: 1701 },
        rentalPrice: { deposit: 2500, daily: 180, weekly: 1000, monthly: 3500 },
        stock: { inStock: 12, available: 3, reserved: 1 },
      },
    ],
    rentalConfig: {
      isRental: true,
      minDays: 1,
      maxDays: 30,
      bufferDays: 1,
      storeLocationIds: ["store-001", "store-003"],
    },
    insight: {
      viewCount: 870,
      addToCartCount: 195,
      orderCount: 120,
      rentalCount: 60,
      wishlistCount: 140,
      avgRating: 4.5,
      reviewCount: 63,
      returnRate: 3.0,
      trendingScore: 65,
      lastSoldAt: "2026-02-13T16:45:00Z",
      lastRentedAt: "2026-02-12T11:30:00Z",
    },
  }),

  createMockProduct({
    id: "prod-004",
    slug: "milwaukee-tape-measure-8m",
    categories: ["measuring_tools", "me01"],
    name: {
      th: "ตลับเมตร Milwaukee 8 เมตร",
      en: "Milwaukee Tape Measure 8m",
      cn: "Milwaukee卷尺 8米",
      jp: "ミルウォーキー巻尺 8m",
    },
    brand: "Milwaukee",
    thumbnail:
      "https://placehold.co/400x400/B71C1C/FFFFFF?text=Milwaukee+Tape&font=roboto",
    images: [
      "https://placehold.co/800x600/B71C1C/FFFFFF?text=Milwaukee+Tape+1&font=roboto",
    ],
    description: {
      th: "ตลับเมตร 8 เมตร สายเทปกว้าง ทนทาน มีแม่เหล็กที่ปลาย ล็อคได้",
      en: "8m tape measure with wide blade, magnetic tip and secure lock.",
      cn: "8米卷尺，宽尺带，磁性尖端，安全锁定",
      jp: "8m巻尺。幅広テープ、マグネットフック、ロック機能付き",
    },
    spec: {
      size: "8m",
      weight: "450g",
      color: "Red",
      material: "Nylon coated steel",
    },
    suppliers: ["sup-003", "sup-004"],
    isForSale: true,
    skus: [
      {
        id: "sku-004-default",
        attributes: {},
        price: { original: 590, discount: 0, final: 590 },
        rentalPrice: { deposit: 0, daily: 0, weekly: 0, monthly: 0 },
        stock: { inStock: 80, available: 0, reserved: 0 },
      },
    ],
    rentalConfig: {
      isRental: false,
      minDays: 1,
      maxDays: 0,
      bufferDays: 0,
      storeLocationIds: [],
    },
    insight: {
      viewCount: 650,
      addToCartCount: 280,
      orderCount: 220,
      rentalCount: 0,
      wishlistCount: 55,
      avgRating: 4.4,
      reviewCount: 38,
      returnRate: 0.5,
      trendingScore: 45,
      lastSoldAt: "2026-02-17T09:15:00Z",
    },
  }),

  createMockProduct({
    id: "prod-005",
    slug: "dewalt-safety-glasses-dpg82",
    categories: ["ppe_general", "p01"],
    name: {
      th: "แว่นตานิรภัย DeWalt DPG82",
      en: "DeWalt Safety Glasses DPG82",
      cn: "DeWalt安全眼镜 DPG82",
      jp: "デウォルト安全メガネ DPG82",
    },
    brand: "DeWalt",
    thumbnail:
      "https://placehold.co/400x400/F9A825/000000?text=DeWalt+Glasses&font=roboto",
    images: [
      "https://placehold.co/800x600/F9A825/000000?text=DeWalt+Glasses+1&font=roboto",
    ],
    description: {
      th: "แว่นตานิรภัยเลนส์ใส กันฝุ่น กันสะเก็ด มาตรฐาน ANSI Z87.1 ใส่สบาย",
      en: "Clear lens safety glasses. Anti-dust, anti-splash. ANSI Z87.1 certified.",
      cn: "透明镜片安全眼镜，防尘防溅，ANSI Z87.1认证",
      jp: "クリアレンズ安全メガネ。防塵・防飛沫。ANSI Z87.1認証",
    },
    spec: { color: "Yellow/Clear", material: "Polycarbonate", weight: "45g" },
    suppliers: ["sup-005"],
    isForSale: true,
    skus: [
      {
        id: "sku-005-default",
        attributes: {},
        price: { original: 290, discount: 5, final: 276 },
        rentalPrice: { deposit: 0, daily: 0, weekly: 0, monthly: 0 },
        stock: { inStock: 200, available: 0, reserved: 0 },
      },
    ],
    rentalConfig: {
      isRental: false,
      minDays: 1,
      maxDays: 0,
      bufferDays: 0,
      storeLocationIds: [],
    },
    insight: {
      viewCount: 420,
      addToCartCount: 180,
      orderCount: 145,
      rentalCount: 0,
      wishlistCount: 30,
      avgRating: 4.2,
      reviewCount: 28,
      returnRate: 1.0,
      trendingScore: 35,
      lastSoldAt: "2026-02-16T11:00:00Z",
    },
  }),

  createMockProduct({
    id: "prod-006",
    slug: "hilti-rotary-hammer-te-2",
    categories: ["mechanic_tools", "m01"],
    name: {
      th: "สว่านโรตารี่ Hilti TE 2",
      en: "Hilti Rotary Hammer TE 2",
      cn: "Hilti电锤 TE 2",
      jp: "ヒルティ ロータリーハンマ TE 2",
    },
    brand: "Hilti",
    thumbnail:
      "https://placehold.co/400x400/D50000/FFFFFF?text=Hilti+Hammer&font=roboto",
    images: [
      "https://placehold.co/800x600/D50000/FFFFFF?text=Hilti+Hammer+1&font=roboto",
      "https://placehold.co/800x600/D50000/FFFFFF?text=Hilti+Hammer+2&font=roboto",
      "https://placehold.co/800x600/D50000/FFFFFF?text=Hilti+Hammer+3&font=roboto",
    ],
    description: {
      th: "สว่านโรตารี่ 710 วัตต์ ระบบ SDS-plus เจาะคอนกรีตได้ลึก ทนทานระดับมืออาชีพ",
      en: "710W SDS-plus rotary hammer. Deep concrete drilling. Professional grade durability.",
      cn: "710瓦SDS-plus电锤，深度混凝土钻孔，专业级耐用性",
      jp: "710W SDS-plusロータリーハンマ。深いコンクリート穴あけ。プロ仕様の耐久性",
    },
    spec: {
      size: "340×80mm",
      weight: "2.4kg",
      color: "Red",
      power: "710W",
      voltage: "220V",
      ampere: "3.5A",
    },
    doc: {
      manual: {
        url: "/docs/hilti-te2-manual.pdf",
        name: {
          th: "คู่มือการใช้งาน",
          en: "User Manual",
          cn: "用户手册",
          jp: "取扱説明書",
        },
      },
    },
    suppliers: ["sup-001", "sup-006"],
    isForSale: true,
    skus: [
      {
        id: "sku-006-default",
        attributes: {},
        price: { original: 12500, discount: 0, final: 12500 },
        rentalPrice: {
          deposit: 5000,
          daily: 500,
          weekly: 3000,
          monthly: 10000,
        },
        stock: { inStock: 5, available: 2, reserved: 1 },
      },
    ],
    rentalConfig: {
      isRental: true,
      minDays: 1,
      maxDays: 60,
      bufferDays: 2,
      storeLocationIds: ["store-001"],
    },
    insight: {
      viewCount: 2100,
      addToCartCount: 310,
      orderCount: 85,
      rentalCount: 120,
      wishlistCount: 380,
      avgRating: 4.8,
      reviewCount: 95,
      returnRate: 1.2,
      trendingScore: 88,
      lastSoldAt: "2026-02-14T13:20:00Z",
      lastRentedAt: "2026-02-17T07:45:00Z",
    },
  }),

  createMockProduct({
    id: "prod-007",
    slug: "stanley-claw-hammer-16oz",
    categories: ["mechanic_tools", "m03"],
    name: {
      th: "ค้อนหงอน Stanley 16 ออนซ์",
      en: "Stanley Claw Hammer 16oz",
      cn: "史丹利羊角锤 16oz",
      jp: "スタンレー ネイルハンマー 16oz",
    },
    brand: "Stanley",
    thumbnail:
      "https://placehold.co/400x400/FFC107/000000?text=Stanley+Hammer&font=roboto",
    images: [
      "https://placehold.co/800x600/FFC107/000000?text=Stanley+Hammer+1&font=roboto",
    ],
    description: {
      th: "ค้อนหงอนด้ามไฟเบอร์กลาส น้ำหนัก 16 ออนซ์ สมดุลดี กระชับมือ",
      en: "16oz fiberglass handle claw hammer. Well-balanced and comfortable grip.",
      cn: "16oz玻璃纤维柄羊角锤，平衡良好，握感舒适",
      jp: "16ozファイバーグラスハンドル。バランスが良く握りやすい",
    },
    spec: { weight: "450g", material: "Fiberglass / Steel" },
    suppliers: ["sup-003"],
    isForSale: true,
    skus: [
      {
        id: "sku-007-default",
        attributes: {},
        price: { original: 450, discount: 0, final: 450 },
        rentalPrice: { deposit: 0, daily: 0, weekly: 0, monthly: 0 },
        stock: { inStock: 60, available: 0, reserved: 0 },
      },
    ],
    rentalConfig: {
      isRental: false,
      minDays: 1,
      maxDays: 0,
      bufferDays: 0,
      storeLocationIds: [],
    },
    insight: {
      viewCount: 310,
      addToCartCount: 150,
      orderCount: 130,
      rentalCount: 0,
      wishlistCount: 20,
      avgRating: 4.1,
      reviewCount: 22,
      returnRate: 0.8,
      trendingScore: 30,
      lastSoldAt: "2026-02-15T15:00:00Z",
    },
  }),

  createMockProduct({
    id: "prod-008",
    slug: "mitutoyo-digital-caliper-150mm",
    categories: ["measuring_tools", "me03"],
    name: {
      th: "เวอร์เนียร์ดิจิตอล Mitutoyo 150mm",
      en: "Mitutoyo Digital Caliper 150mm",
      cn: "三丰数显卡尺 150mm",
      jp: "ミツトヨ デジタルノギス 150mm",
    },
    brand: "Mitutoyo",
    thumbnail:
      "https://placehold.co/400x400/37474F/FFFFFF?text=Mitutoyo+Caliper&font=roboto",
    images: [
      "https://placehold.co/800x600/37474F/FFFFFF?text=Mitutoyo+Caliper+1&font=roboto",
    ],
    description: {
      th: "เวอร์เนียร์ดิจิตอล ความละเอียด 0.01mm พร้อมกล่องเก็บ แบตเตอรี่อายุยาว",
      en: "Digital caliper 0.01mm resolution with storage case. Long battery life.",
      cn: "数显卡尺，精度0.01mm，附收纳盒，电池续航长",
      jp: "デジタルノギス 分解能0.01mm。ケース付き、長寿命バッテリー",
    },
    spec: { size: "150mm", weight: "120g", material: "Stainless Steel" },
    suppliers: ["sup-004"],
    isForSale: true,
    skus: [
      {
        id: "sku-008-default",
        attributes: {},
        price: { original: 3200, discount: 10, final: 2880 },
        rentalPrice: { deposit: 4000, daily: 250, weekly: 1500, monthly: 5000 },
        stock: { inStock: 15, available: 4, reserved: 1 },
      },
    ],
    rentalConfig: {
      isRental: true,
      minDays: 1,
      maxDays: 14,
      bufferDays: 1,
      storeLocationIds: ["store-002"],
    },
    insight: {
      viewCount: 740,
      addToCartCount: 160,
      orderCount: 95,
      rentalCount: 40,
      wishlistCount: 120,
      avgRating: 4.7,
      reviewCount: 45,
      returnRate: 0.5,
      trendingScore: 55,
      lastSoldAt: "2026-02-12T10:00:00Z",
      lastRentedAt: "2026-02-11T14:30:00Z",
    },
  }),

  createMockProduct({
    id: "prod-009",
    slug: "3m-ear-plugs-1100",
    categories: ["ppe_general", "p01"],
    name: {
      th: "ที่อุดหู 3M 1100",
      en: "3M Ear Plugs 1100",
      cn: "3M耳塞 1100",
      jp: "3M 耳栓 1100",
    },
    brand: "3M",
    thumbnail:
      "https://placehold.co/400x400/FF8F00/FFFFFF?text=3M+EarPlugs&font=roboto",
    images: [
      "https://placehold.co/800x600/FF8F00/FFFFFF?text=3M+EarPlugs+1&font=roboto",
    ],
    description: {
      th: "ที่อุดหูโฟม ลดเสียง 29dB NRR ใช้แล้วทิ้ง สวมใส่สบาย (กล่อง 200 คู่)",
      en: "Foam ear plugs 29dB NRR. Disposable, comfortable fit. Box of 200 pairs.",
      cn: "泡沫耳塞，降噪29dB NRR，一次性，佩戴舒适（200对/盒）",
      jp: "フォーム耳栓 29dB NRR。使い捨て、快適装着（200ペア入り）",
    },
    spec: { color: "Orange", material: "PU Foam", weight: "2g/pair" },
    suppliers: ["sup-005"],
    isForSale: true,
    skus: [
      {
        id: "sku-009-default",
        attributes: {},
        price: { original: 890, discount: 0, final: 890 },
        rentalPrice: { deposit: 0, daily: 0, weekly: 0, monthly: 0 },
        stock: { inStock: 300, available: 0, reserved: 0 },
      },
    ],
    rentalConfig: {
      isRental: false,
      minDays: 1,
      maxDays: 0,
      bufferDays: 0,
      storeLocationIds: [],
    },
    insight: {
      viewCount: 280,
      addToCartCount: 200,
      orderCount: 185,
      rentalCount: 0,
      wishlistCount: 10,
      avgRating: 4.0,
      reviewCount: 15,
      returnRate: 0.2,
      trendingScore: 25,
      lastSoldAt: "2026-02-17T12:00:00Z",
    },
  }),

  createMockProduct({
    id: "prod-010",
    slug: "dewalt-cordless-impact-driver-dcf887",
    categories: ["mechanic_tools", "m01"],
    name: {
      th: "สว่านกระแทกไร้สาย DeWalt DCF887",
      en: "DeWalt Cordless Impact Driver DCF887",
      cn: "DeWalt无绳冲击起子 DCF887",
      jp: "デウォルト コードレスインパクトドライバ DCF887",
    },
    brand: "DeWalt",
    thumbnail:
      "https://placehold.co/400x400/F9A825/000000?text=DeWalt+Impact&font=roboto",
    images: [
      "https://placehold.co/800x600/F9A825/000000?text=DeWalt+Impact+1&font=roboto",
      "https://placehold.co/800x600/F9A825/000000?text=DeWalt+Impact+2&font=roboto",
    ],
    description: {
      th: "สว่านกระแทกไร้สาย 20V Max แรงบิด 205Nm 3 ระดับความเร็ว น้ำหนักเบา",
      en: "20V Max cordless impact driver. 205Nm torque, 3-speed settings, lightweight.",
      cn: "20V Max无绳冲击起子，205Nm扭矩，3档速度，轻便",
      jp: "20V Maxコードレスインパクトドライバ。205Nmトルク、3段変速、軽量",
    },
    spec: { weight: "1.1kg", power: "20V Max", color: "Yellow/Black" },
    suppliers: ["sup-002", "sup-003"],
    isForSale: true,
    skus: [
      {
        id: "sku-010-default",
        attributes: {},
        price: { original: 6900, discount: 12, final: 6072 },
        rentalPrice: { deposit: 5000, daily: 350, weekly: 2000, monthly: 7000 },
        stock: { inStock: 18, available: 6, reserved: 2 },
      },
    ],
    rentalConfig: {
      isRental: true,
      minDays: 1,
      maxDays: 30,
      bufferDays: 1,
      storeLocationIds: ["store-001", "store-003"],
    },
    insight: {
      viewCount: 1350,
      addToCartCount: 290,
      orderCount: 150,
      rentalCount: 80,
      wishlistCount: 250,
      avgRating: 4.7,
      reviewCount: 72,
      returnRate: 1.8,
      trendingScore: 82,
      lastSoldAt: "2026-02-16T08:30:00Z",
      lastRentedAt: "2026-02-15T16:00:00Z",
    },
  }),

  createMockProduct({
    id: "prod-011",
    slug: "fluke-multimeter-117",
    categories: ["measuring_tools", "me04"],
    name: {
      th: "มัลติมิเตอร์ Fluke 117",
      en: "Fluke Multimeter 117",
      cn: "Fluke万用表 117",
      jp: "フルーク マルチメータ 117",
    },
    brand: "Fluke",
    thumbnail:
      "https://placehold.co/400x400/FDD835/000000?text=Fluke+117&font=roboto",
    images: [
      "https://placehold.co/800x600/FDD835/000000?text=Fluke+117+1&font=roboto",
    ],
    description: {
      th: "มัลติมิเตอร์ดิจิตอล True RMS วัดไฟ AC/DC กระแส ความต้านทาน ตรวจจับแรงดัน",
      en: "True RMS digital multimeter. AC/DC voltage, current, resistance, voltage detection.",
      cn: "真有效值数字万用表，AC/DC电压电流，电阻，非接触电压检测",
      jp: "True RMSデジタルマルチメータ。AC/DC電圧・電流、抵抗、検電機能",
    },
    spec: { weight: "550g", color: "Yellow/Grey" },
    suppliers: ["sup-004"],
    isForSale: true,
    skus: [
      {
        id: "sku-011-default",
        attributes: {},
        price: { original: 8500, discount: 0, final: 8500 },
        rentalPrice: { deposit: 6000, daily: 400, weekly: 2400, monthly: 8000 },
        stock: { inStock: 8, available: 3, reserved: 1 },
      },
    ],
    rentalConfig: {
      isRental: true,
      minDays: 1,
      maxDays: 14,
      bufferDays: 1,
      storeLocationIds: ["store-002"],
    },
    insight: {
      viewCount: 1100,
      addToCartCount: 180,
      orderCount: 70,
      rentalCount: 55,
      wishlistCount: 200,
      avgRating: 4.9,
      reviewCount: 60,
      returnRate: 0.8,
      trendingScore: 72,
      lastSoldAt: "2026-02-13T09:00:00Z",
      lastRentedAt: "2026-02-15T12:00:00Z",
    },
  }),

  createMockProduct({
    id: "prod-012",
    slug: "uvex-safety-shoes-s3",
    categories: ["ppe_general", "p01"],
    name: {
      th: "รองเท้านิรภัย Uvex S3",
      en: "Uvex Safety Shoes S3",
      cn: "Uvex安全鞋 S3",
      jp: "ウベックス 安全靴 S3",
    },
    brand: "Uvex",
    thumbnail:
      "https://placehold.co/400x400/455A64/FFFFFF?text=Uvex+Shoes&font=roboto",
    images: [
      "https://placehold.co/800x600/455A64/FFFFFF?text=Uvex+Shoes+1&font=roboto",
    ],
    description: {
      th: "รองเท้านิรภัย S3 หัวเหล็ก กันน้ำ พื้นกันลื่น กันเจาะ ESD",
      en: "S3 safety shoes with steel toe, waterproof, anti-slip, puncture-resistant, ESD.",
      cn: "S3安全鞋，钢头，防水，防滑，防刺穿，ESD",
      jp: "S3安全靴。スチールトゥ、防水、滑り止め、耐穿刺、ESD対応",
    },
    spec: { material: "Full-grain leather", color: "Black" },
    suppliers: ["sup-005", "sup-001"],
    isForSale: true,
    skus: [
      {
        id: "sku-012-default",
        attributes: {},
        price: { original: 3900, discount: 8, final: 3588 },
        rentalPrice: { deposit: 0, daily: 0, weekly: 0, monthly: 0 },
        stock: { inStock: 40, available: 0, reserved: 0 },
      },
    ],
    rentalConfig: {
      isRental: false,
      minDays: 1,
      maxDays: 0,
      bufferDays: 0,
      storeLocationIds: [],
    },
    insight: {
      viewCount: 520,
      addToCartCount: 130,
      orderCount: 95,
      rentalCount: 0,
      wishlistCount: 65,
      avgRating: 4.3,
      reviewCount: 30,
      returnRate: 3.5,
      trendingScore: 40,
      lastSoldAt: "2026-02-14T17:30:00Z",
    },
  }),

  createMockProduct({
    id: "prod-013",
    slug: "bosch-laser-level-gll-3-80",
    categories: ["measuring_tools", "me02"],
    name: {
      th: "เลเซอร์วัดระดับ Bosch GLL 3-80",
      en: "Bosch Laser Level GLL 3-80",
      cn: "博世激光水平仪 GLL 3-80",
      jp: "ボッシュ レーザーレベル GLL 3-80",
    },
    brand: "Bosch",
    thumbnail:
      "https://placehold.co/400x400/1565C0/FFFFFF?text=Bosch+Laser&font=roboto",
    images: [
      "https://placehold.co/800x600/1565C0/FFFFFF?text=Bosch+Laser+1&font=roboto",
      "https://placehold.co/800x600/1565C0/FFFFFF?text=Bosch+Laser+2&font=roboto",
    ],
    description: {
      th: "เลเซอร์วัดระดับ 3 ระนาบ 360° ระยะ 30 เมตร แม่นยำสูง พร้อมกล่องเก็บ",
      en: "3-plane 360° laser level. 30m range, high accuracy. Includes carrying case.",
      cn: "3面360°激光水平仪，30米范围，高精度，附收纳箱",
      jp: "3面360°レーザーレベル。30m範囲、高精度。キャリングケース付き",
    },
    spec: { size: "158×76mm", weight: "780g", color: "Blue" },
    suppliers: ["sup-001", "sup-002"],
    isForSale: true,
    skus: [
      {
        id: "sku-013-default",
        attributes: {},
        price: { original: 15900, discount: 5, final: 15105 },
        rentalPrice: {
          deposit: 8000,
          daily: 600,
          weekly: 3500,
          monthly: 12000,
        },
        stock: { inStock: 6, available: 2, reserved: 1 },
      },
    ],
    rentalConfig: {
      isRental: true,
      minDays: 1,
      maxDays: 30,
      bufferDays: 1,
      storeLocationIds: ["store-001", "store-002"],
    },
    insight: {
      viewCount: 1800,
      addToCartCount: 250,
      orderCount: 60,
      rentalCount: 90,
      wishlistCount: 340,
      avgRating: 4.8,
      reviewCount: 55,
      returnRate: 0.5,
      trendingScore: 85,
      lastSoldAt: "2026-02-11T10:00:00Z",
      lastRentedAt: "2026-02-16T14:00:00Z",
    },
  }),

  createMockProduct({
    id: "prod-014",
    slug: "makita-circular-saw-hs7601",
    categories: ["mechanic_tools", "m03"],
    name: {
      th: "เลื่อยวงเดือน Makita HS7601",
      en: "Makita Circular Saw HS7601",
      cn: "牧田圆锯 HS7601",
      jp: "マキタ 丸ノコ HS7601",
    },
    brand: "Makita",
    thumbnail:
      "https://placehold.co/400x400/00897B/FFFFFF?text=Makita+Saw&font=roboto",
    images: [
      "https://placehold.co/800x600/00897B/FFFFFF?text=Makita+Saw+1&font=roboto",
    ],
    description: {
      th: "เลื่อยวงเดือน 7 นิ้ว 1200W ตัดไม้ ไม้อัด พลาสติก ปรับมุมองศาได้",
      en: "7-inch 1200W circular saw for wood, plywood, plastic. Adjustable bevel angle.",
      cn: "7英寸1200瓦圆锯，适用于木材、胶合板、塑料，可调斜角",
      jp: "7インチ1200W丸ノコ。木材・合板・プラスチック用。傾斜角調整可能",
    },
    spec: {
      size: "7 inch",
      weight: "3.9kg",
      power: "1200W",
      voltage: "220V",
      color: "Teal",
    },
    suppliers: ["sup-002", "sup-006"],
    isForSale: true,
    skus: [
      {
        id: "sku-014-default",
        attributes: {},
        price: { original: 4200, discount: 0, final: 4200 },
        rentalPrice: { deposit: 4000, daily: 300, weekly: 1800, monthly: 6000 },
        stock: { inStock: 10, available: 4, reserved: 1 },
      },
    ],
    rentalConfig: {
      isRental: true,
      minDays: 1,
      maxDays: 30,
      bufferDays: 1,
      storeLocationIds: ["store-001", "store-003"],
    },
    insight: {
      viewCount: 950,
      addToCartCount: 200,
      orderCount: 110,
      rentalCount: 65,
      wishlistCount: 170,
      avgRating: 4.5,
      reviewCount: 48,
      returnRate: 2.0,
      trendingScore: 60,
      lastSoldAt: "2026-02-15T11:20:00Z",
      lastRentedAt: "2026-02-13T09:45:00Z",
    },
  }),

  createMockProduct({
    id: "prod-015",
    slug: "3m-n95-dust-mask-8210",
    categories: ["ppe_general", "p01"],
    name: {
      th: "หน้ากากกันฝุ่น 3M N95 8210",
      en: "3M N95 Dust Mask 8210",
      cn: "3M N95防尘口罩 8210",
      jp: "3M N95 防じんマスク 8210",
    },
    brand: "3M",
    thumbnail:
      "https://placehold.co/400x400/FF8F00/FFFFFF?text=3M+N95&font=roboto",
    images: [
      "https://placehold.co/800x600/FF8F00/FFFFFF?text=3M+N95+1&font=roboto",
    ],
    description: {
      th: "หน้ากาก N95 กรองฝุ่นละเอียด 95% สายรัดยืดหยุ่น ใช้แล้วทิ้ง (กล่อง 20 ชิ้น)",
      en: "N95 particulate respirator. Filters 95% fine particles. Box of 20.",
      cn: "N95防颗粒物口罩，过滤95%细颗粒物（20只/盒）",
      jp: "N95微粒子用マスク。95%フィルタリング（20枚入り）",
    },
    spec: { color: "White", material: "Non-woven" },
    suppliers: ["sup-005"],
    isForSale: true,
    skus: [
      {
        id: "sku-015-default",
        attributes: {},
        price: { original: 490, discount: 0, final: 490 },
        rentalPrice: { deposit: 0, daily: 0, weekly: 0, monthly: 0 },
        stock: { inStock: 500, available: 0, reserved: 0 },
      },
    ],
    rentalConfig: {
      isRental: false,
      minDays: 1,
      maxDays: 0,
      bufferDays: 0,
      storeLocationIds: [],
    },
    insight: {
      viewCount: 420,
      addToCartCount: 310,
      orderCount: 290,
      rentalCount: 0,
      wishlistCount: 15,
      avgRating: 4.2,
      reviewCount: 18,
      returnRate: 0.3,
      trendingScore: 35,
      lastSoldAt: "2026-02-17T14:00:00Z",
    },
  }),

  createMockProduct({
    id: "prod-016",
    slug: "hilti-anchor-bolt-hst3-m12",
    categories: ["screws_bolts", "sb01"],
    name: {
      th: "พุกเหล็ก Hilti HST3 M12",
      en: "Hilti Anchor Bolt HST3 M12",
      cn: "Hilti膨胀螺栓 HST3 M12",
      jp: "ヒルティ アンカーボルト HST3 M12",
    },
    brand: "Hilti",
    thumbnail:
      "https://placehold.co/400x400/D50000/FFFFFF?text=Hilti+Anchor&font=roboto",
    images: [
      "https://placehold.co/800x600/D50000/FFFFFF?text=Hilti+Anchor+1&font=roboto",
    ],
    description: {
      th: "พุกเหล็ก M12 สำหรับคอนกรีต แรงยึดสูง ได้รับมาตรฐาน ETA (กล่อง 25 ตัว)",
      en: "M12 wedge anchor for concrete. High load capacity, ETA certified. Box of 25.",
      cn: "M12混凝土膨胀螺栓，高承载力，ETA认证（25只/盒）",
      jp: "M12コンクリート用アンカーボルト。高荷重、ETA認証（25本入り）",
    },
    spec: { size: "M12 × 120mm", material: "Carbon Steel / Zinc plated" },
    suppliers: ["sup-001", "sup-006"],
    isForSale: true,
    skus: [
      {
        id: "sku-016-default",
        attributes: {},
        price: { original: 1850, discount: 0, final: 1850 },
        rentalPrice: { deposit: 0, daily: 0, weekly: 0, monthly: 0 },
        stock: { inStock: 120, available: 0, reserved: 0 },
      },
    ],
    rentalConfig: {
      isRental: false,
      minDays: 1,
      maxDays: 0,
      bufferDays: 0,
      storeLocationIds: [],
    },
    insight: {
      viewCount: 380,
      addToCartCount: 120,
      orderCount: 100,
      rentalCount: 0,
      wishlistCount: 30,
      avgRating: 4.4,
      reviewCount: 25,
      returnRate: 0.5,
      trendingScore: 28,
      lastSoldAt: "2026-02-16T09:30:00Z",
    },
  }),

  createMockProduct({
    id: "prod-017",
    slug: "sika-sealant-flex-11fc",
    categories: ["construction_consumables", "cc01"],
    name: {
      th: "ซีลแลนท์ Sikaflex 11 FC",
      en: "Sika Sealant Sikaflex 11 FC",
      cn: "Sika密封胶 Sikaflex 11 FC",
      jp: "シーカ シーラント Sikaflex 11 FC",
    },
    brand: "Sika",
    thumbnail:
      "https://placehold.co/400x400/E65100/FFFFFF?text=Sika+Sealant&font=roboto",
    images: [
      "https://placehold.co/800x600/E65100/FFFFFF?text=Sika+Sealant+1&font=roboto",
    ],
    description: {
      th: "ซีลแลนท์โพลียูรีเทน อเนกประสงค์ ยืดหยุ่นสูง กันน้ำ ทาสีทับได้ 310ml",
      en: "Multi-purpose polyurethane sealant. Flexible, waterproof, paintable. 310ml.",
      cn: "多用途聚氨酯密封胶，高弹性，防水，可涂漆，310ml",
      jp: "多用途ポリウレタンシーラント。柔軟、防水、塗装可。310ml",
    },
    spec: { size: "310ml", color: "White", material: "Polyurethane" },
    suppliers: ["sup-003"],
    isForSale: true,
    skus: [
      {
        id: "sku-017-default",
        attributes: {},
        price: { original: 280, discount: 0, final: 280 },
        rentalPrice: { deposit: 0, daily: 0, weekly: 0, monthly: 0 },
        stock: { inStock: 250, available: 0, reserved: 0 },
      },
    ],
    rentalConfig: {
      isRental: false,
      minDays: 1,
      maxDays: 0,
      bufferDays: 0,
      storeLocationIds: [],
    },
    insight: {
      viewCount: 200,
      addToCartCount: 170,
      orderCount: 160,
      rentalCount: 0,
      wishlistCount: 8,
      avgRating: 4.0,
      reviewCount: 12,
      returnRate: 0.2,
      trendingScore: 20,
      lastSoldAt: "2026-02-17T16:00:00Z",
    },
  }),

  createMockProduct({
    id: "prod-018",
    slug: "knipex-pliers-set-3pc",
    categories: ["mechanic_tools", "m03"],
    name: {
      th: "ชุดคีม Knipex 3 ชิ้น",
      en: "Knipex Pliers Set 3pc",
      cn: "凯尼派克钳子套装 3件",
      jp: "クニペックス プライヤーセット 3本組",
    },
    brand: "Knipex",
    thumbnail:
      "https://placehold.co/400x400/0D47A1/FFFFFF?text=Knipex+Pliers&font=roboto",
    images: [
      "https://placehold.co/800x600/0D47A1/FFFFFF?text=Knipex+Pliers+1&font=roboto",
    ],
    description: {
      th: "ชุดคีม 3 ชิ้น (คีมปากแหลม คีมตัด คีมล็อค) เหล็กชุบแข็ง ด้ามยางกันลื่น",
      en: "3-piece pliers set (needle nose, cutter, locking). Hardened steel, non-slip grips.",
      cn: "3件套钳子（尖嘴钳、剪钳、锁紧钳），淬硬钢，防滑手柄",
      jp: "3本組プライヤー（ラジオペンチ・ニッパー・ロッキング）。焼入鋼、滑り止めグリップ",
    },
    spec: { weight: "850g", material: "Chrome Vanadium Steel" },
    suppliers: ["sup-003", "sup-004"],
    isForSale: true,
    skus: [
      {
        id: "sku-018-default",
        attributes: {},
        price: { original: 3500, discount: 15, final: 2975 },
        rentalPrice: { deposit: 0, daily: 0, weekly: 0, monthly: 0 },
        stock: { inStock: 22, available: 0, reserved: 0 },
      },
    ],
    rentalConfig: {
      isRental: false,
      minDays: 1,
      maxDays: 0,
      bufferDays: 0,
      storeLocationIds: [],
    },
    insight: {
      viewCount: 640,
      addToCartCount: 140,
      orderCount: 85,
      rentalCount: 0,
      wishlistCount: 95,
      avgRating: 4.6,
      reviewCount: 35,
      returnRate: 1.0,
      trendingScore: 45,
      lastSoldAt: "2026-02-15T13:00:00Z",
    },
  }),

  createMockProduct({
    id: "prod-019",
    slug: "msa-full-body-harness-v-gard",
    categories: ["safety_equipment", "s01"],
    name: {
      th: "เข็มขัดนิรภัยเต็มตัว MSA V-Gard",
      en: "MSA Full Body Harness V-Gard",
      cn: "MSA全身安全带 V-Gard",
      jp: "MSA フルボディハーネス V-Gard",
    },
    brand: "MSA",
    thumbnail:
      "https://placehold.co/400x400/2E7D32/FFFFFF?text=MSA+Harness&font=roboto",
    images: [
      "https://placehold.co/800x600/2E7D32/FFFFFF?text=MSA+Harness+1&font=roboto",
      "https://placehold.co/800x600/2E7D32/FFFFFF?text=MSA+Harness+2&font=roboto",
    ],
    description: {
      th: "เข็มขัดนิรภัยเต็มตัว 5 จุดรัด สำหรับงานที่สูง มาตรฐาน EN 361 ปรับขนาดได้",
      en: "5-point full body harness for working at height. EN 361 certified, adjustable.",
      cn: "5点式全身安全带，高空作业用，EN 361认证，可调节",
      jp: "5点式フルボディハーネス。高所作業用、EN 361認証、サイズ調整可能",
    },
    spec: { size: "M-XL", weight: "1.8kg", color: "Green/Black" },
    suppliers: ["sup-005", "sup-001"],
    isForSale: true,
    skus: [
      {
        id: "sku-019-default",
        attributes: {},
        price: { original: 5500, discount: 0, final: 5500 },
        rentalPrice: { deposit: 3000, daily: 250, weekly: 1500, monthly: 5000 },
        stock: { inStock: 30, available: 8, reserved: 3 },
      },
    ],
    rentalConfig: {
      isRental: true,
      minDays: 1,
      maxDays: 90,
      bufferDays: 2,
      storeLocationIds: ["store-001", "store-002", "store-003"],
    },
    insight: {
      viewCount: 890,
      addToCartCount: 170,
      orderCount: 90,
      rentalCount: 70,
      wishlistCount: 140,
      avgRating: 4.5,
      reviewCount: 40,
      returnRate: 1.2,
      trendingScore: 55,
      lastSoldAt: "2026-02-14T10:00:00Z",
      lastRentedAt: "2026-02-16T08:30:00Z",
    },
  }),

  createMockProduct({
    id: "prod-020",
    slug: "tajima-chalk-line-cr201",
    categories: ["measuring_tools", "me01"],
    name: {
      th: "ปักเต้าตีเส้น Tajima CR201",
      en: "Tajima Chalk Line CR201",
      cn: "田岛墨斗 CR201",
      jp: "タジマ チョークライン CR201",
    },
    brand: "Tajima",
    thumbnail:
      "https://placehold.co/400x400/6A1B9A/FFFFFF?text=Tajima+Chalk&font=roboto",
    images: [
      "https://placehold.co/800x600/6A1B9A/FFFFFF?text=Tajima+Chalk+1&font=roboto",
    ],
    description: {
      th: "ปักเต้าตีเส้น เชือก 20 เมตร กลไกม้วนเร็ว ตลับผงชอล์กในตัว",
      en: "Chalk line reel 20m. Quick-wind mechanism with built-in chalk powder case.",
      cn: "20米墨斗，快速收线，内置粉仓",
      jp: "20mチョークライン。高速巻取り機構、粉ケース内蔵",
    },
    spec: { size: "20m", weight: "280g", color: "Purple/Black" },
    suppliers: ["sup-004"],
    isForSale: true,
    skus: [
      {
        id: "sku-020-default",
        attributes: {},
        price: { original: 390, discount: 0, final: 390 },
        rentalPrice: { deposit: 0, daily: 0, weekly: 0, monthly: 0 },
        stock: { inStock: 45, available: 0, reserved: 0 },
      },
    ],
    rentalConfig: {
      isRental: false,
      minDays: 1,
      maxDays: 0,
      bufferDays: 0,
      storeLocationIds: [],
    },
    insight: {
      viewCount: 180,
      addToCartCount: 90,
      orderCount: 75,
      rentalCount: 0,
      wishlistCount: 12,
      avgRating: 3.9,
      reviewCount: 10,
      returnRate: 0.5,
      trendingScore: 15,
      lastSoldAt: "2026-02-16T11:45:00Z",
    },
  }),
];

/**
 * Transitional mapped products sourced from the DB-oriented catalog mock shape.
 * These fixtures help us move toward the future API/Supabase model without
 * breaking the current UI contract (`Product`).
 */
export const transitionalMockProducts: Product[] =
  mapCatalogProductsToProducts(mockCatalogProducts);

/**
 * Current runtime mock source.
 * Transitional catalog fixtures are prepended so new SKU/rental flows are
 * visible immediately in dev, while legacy fixtures remain available.
 */
export const mockProducts: Product[] = [
  ...transitionalMockProducts,
  ...legacyMockProducts,
];
