# 🏗 HOP-RENTAL — Project Summary & Recap

> สรุปเนื้อหาสำคัญและแนวทางทำงานร่วมกัน
> อัปเดตล่าสุด: 2026-04-26

---

## 1. ภาพรวมโปรเจกต์

**HOP-RENTAL** คือเว็บไซต์ e-commerce สำหรับ **ขายและให้เช่าอุปกรณ์ก่อสร้าง/เครื่องมือช่าง** ของบริษัท ฮอปนิค จำกัด

- **Framework**: Nuxt 4.3.1 (Vue 3.5.28, Vite 7.3.1)
- **UI Library**: @nuxt/ui v4.4.0 (Nuxt UI v3)
- **Styling**: Tailwind CSS 4 (via @nuxt/ui)
- **i18n**: @nuxtjs/i18n v10.2 — 4 ภาษา (th, en, cn, jp)
- **Icons**: Boxicons (bx: prefix) — https://icones.js.org/collection/bx
- **TypeScript**: strict typing ทุกไฟล์

### Recent branch updates (2026-04-23)

- หน้า Home ถูก refactor เป็นโครงหลาย section: Hero Banner, Feature Bar, Partner/logo strip, Promotion, Rental, Products, Services
- Home content ใช้ table ฝั่ง Supabase แล้วผ่าน `home_banners`, `home_link_cards`, `home_featured_products`, `home_featured_assets`
- Featured products / rentals บนหน้า Home จะ fallback ไปใช้รายการจริงจาก catalog แบบ deterministic-random เมื่อยังไม่มี curated rows
- มี internal admin MVP ภายใน app เดียวกันแล้ว รวมถึง `/admin/home-content` สำหรับจัดการ homepage content โดยจำกัดสิทธิ์ที่ `super_admin`
- มี service mock pages สำหรับ 3 บริการหลัก และมี migration `014_homepage_content.sql` รองรับ Home CMS

---

## 2. Tech Stack & Conventions

### 2.1 แนวทางการทำงาน (Patterns)

| Pattern                    | รายละเอียด                                                             |
| -------------------------- | ---------------------------------------------------------------------- |
| **LocalizedString**        | `Record<LocaleCode, string>` สำหรับเนื้อหา 4 ภาษา (ข้อมูลจาก DB/Admin) |
| **i18n JSON**              | `i18n/locales/{th,en,cn,jp}.json` สำหรับ static UI labels              |
| **Mock Data**              | `app/mock/*.ts` — เตรียมไว้ก่อนต่อ API จริง                            |
| **Factory Function**       | `createMockProduct(overrides)` สร้าง mock ด้วย sensible defaults       |
| **Composable (Singleton)** | `ref()` นอก function → shared state ทุก component                      |
| **localStorage Persist**   | `useCart`, `useBooking` — persist client-side, SSR-safe                |
| **Lazy Loading**           | `<LazyComponentName>` prefix + `<NuxtImg loading="lazy">`              |
| **Auto-imports**           | Nuxt auto-import composables + components ตาม directory prefix         |
| **State Management**       | ไม่ใช้ Vuex/Pinia — ใช้ composable + ref() + localStorage              |
| **SKU Pattern**            | Product ไม่มี variant → 1 SKU (default); มี variant → หลาย SKU         |
| **Route Pattern**          | `/product-{categories[0]}/{slug}` dynamic route                        |
| **Admin Pattern**          | Internal backoffice MVP อยู่ใน Nuxt app เดียวกันภายใต้ `/admin`        |

### 2.2 ไฟล์โครงสร้างหลัก

```
hop-rental/
├── nuxt.config.ts              # Nuxt config + i18n + modules
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
├── eslint.config.mjs           # ESLint config
├── app/
│   ├── app.vue                 # Root: <UApp><NuxtLayout><NuxtPage/></NuxtLayout></UApp>
│   ├── layouts/default.vue     # HopHeader + <UMain><slot/></UMain>
│   ├── assets/css/main.css     # Tailwind + Nuxt UI imports
│   ├── assets/hopnic-logo.svg
│   ├── types/                  # TypeScript interfaces
│   │   ├── locale.ts           # LocaleCode, LocalizedString
│   │   ├── product.ts          # Product, ProductSKU, RentalConfig, ProductInsight...
│   │   ├── supplier.ts         # Supplier
│   │   ├── category.ts         # MainCategory, SubCategory
│   │   ├── banner.ts           # BannerSlide
│   │   ├── iconSlide.ts        # IconSlideItem
│   │   ├── cart.ts             # CartItem, Cart (⚠️ needs upgrade)
│   │   └── booking.ts          # BookingItem, BookingStatus, BookingStore (⚠️ needs upgrade)
│   ├── mock/                   # Mock data (จะย้ายไป DB ในอนาคต)
│   │   ├── products.ts         # 20 products with SKU variants
│   │   ├── suppliers.ts        # 5 suppliers
│   │   ├── categories.ts       # 7 main + sub categories
│   │   ├── banners.ts          # Banner slides
│   │   └── partners.ts         # Partner logos
│   ├── composables/            # Shared state & logic
│   │   ├── useProducts.ts      # products + helpers (getDisplayPrice, getTotalStock...)
│   │   ├── useSuppliers.ts
│   │   ├── useCategories.ts
│   │   ├── useBanners.ts
│   │   ├── usePartners.ts
│   │   ├── useCart.ts          # Cart + localStorage (⚠️ needs upgrade)
│   │   ├── useBooking.ts       # Booking + localStorage (⚠️ needs upgrade)
│   │   ├── useAssets.ts# asset catalog + product mapping
│   │   └── useHomeContent.ts   # home CMS content + featured fallback logic
│   ├── components/
│   │   ├── HopHeader.vue       # Main header with nav
│   │   ├── header/             # HopLogo, HopSearch, LangSelection, NavMenu, MobileMenu, UserDropdown
│   │   ├── banner/HopBanner.vue
│   │   ├── featurebar/         # HopFeatureBar, FeatureBtn, QuotationBar
│   │   ├── categories_card/CategoriesCard.vue
│   │   ├── partners/HopPartnerSlide.vue
│   │   ├── IconSlide/IconSlide.vue
│   │   ├── home/               # HomeSectionShell, HomeHorizontalRail, HomeLinkCard
│   │   └── products/           # ProductCard, ProductGallery, ProductInfo, ProductSpecTable,
│   │                           # ProductDocLinks, RentalBookingForm, SearchAndFilter,
│   │                           # ProductFilterForm, RentalFilterForm, ProductSet
│   └── pages/
│       ├── index.vue           # Homepage: Hero + FeatureBar + Partners + Promotions + Rental + Products + Services
│       ├── admin/              # Internal admin MVP, including home-content curation
│       ├── services/           # Mock service detail pages used by homepage service cards
│       └── product-[group]/
│           ├── index.vue       # Product list: search/filter sidebar + grid + pagination
│           └── [id].vue        # Product detail: gallery + info + spec + docs + booking
├── i18n/locales/               # Static UI translations
│   ├── th.json
│   ├── en.json
│   ├── cn.json
│   └── jp.json
└── public/
    ├── favicon.svg
    └── robots.txt
```

---

## 3. สิ่งที่ทำเสร็จแล้ว (Completed Tasks)

### Session 1-7: Core UI Components

- ✅ CategoriesCard (7 hardcoded main + DB-driven sub-categories)
- ✅ HopBanner (carousel slideshow)
- ✅ HopFeatureBar (Cart, Order History, Contact Sales buttons)
- ✅ IconSlide + HopPartnerSlide (marquee-style scrolling)
- ✅ Header: Logo, Search, LangSelection, NavMenu, MobileMenu, UserDropdown

### Session 8-10: Data Foundation

- ✅ Shared i18n types (LocaleCode, LocalizedString)
- ✅ Supplier types + mock data (5 suppliers) + composable
- ✅ Product types + mock data + factory function + composable
- ✅ ProductCard component

### Session 11-12: Product List Page

- ✅ Simple product list → Redesigned with search/filter sidebar + content area
- ✅ 12-col grid layout: sidebar (4 cols) + content (8 cols)
- ✅ Sort, pagination, tab switching (Sale/Rental)

### Session 13: Mock Data Expansion

- ✅ 20 diverse products across categories
- ✅ `itemsOptions: [9, 15, 21]` aligned to 3-column grid

### Session 14: ProductCard Enhancement

- ✅ Hover effects (ring-2 ring-primary)
- ✅ Clickable links opening in new tabs
- ✅ "Add to Cart" + "Book Now" action buttons
- ✅ Lazy Loading: `<LazyProductsProductCard>` + `<NuxtImg loading="lazy">`

### Task 1: Data Structure Refactoring (Major)

- ✅ `Product` type → เพิ่ม SKU variants, RentalConfig, ProductInsight
- ✅ `image` → `thumbnail` + `images[]`
- ✅ ราคาย้ายจาก Product → SKU level
- ✅ Mock data 20 products ปรับใช้ SKU structure
- ✅ Composable helpers: `getDefaultSKU()`, `getDisplayPrice()`, `getTotalStock()`, `isRental()`
- ✅ ProductCard + index.vue updated

### Task 2: Product Detail Page `[id].vue` (7 Sub-Tasks)

- ✅ 2.1: Page layout + i18n keys (35+ keys, 4 languages) + `getProductBySlug()`
- ✅ 2.2: `ProductGallery.vue` — รูปใหญ่ + thumbnail strip + lazy loading
- ✅ 2.3: `ProductInfo.vue` — ชื่อ, brand, SKU picker, ราคา, stock, action buttons
- ✅ 2.4: `ProductSpecTable.vue` — ตาราง spec key-value
- ✅ 2.5: `ProductDocLinks.vue` — ลิงก์ดาวน์โหลดเอกสาร
- ✅ 2.6: `RentalBookingForm.vue` — UCalendar + input วัน + คำนวณราคาอัตโนมัติ
- ✅ 2.7: `useBooking.ts` + booking types + localStorage persist + integration

**ทุก Task ผ่าน 0 TypeScript errors**

### Session 2026-04-24: Main Categories Admin (validated)

- ✅ Added DB-backed `main_categories` as the source of truth for product primary category
- ✅ Added `super_admin` page at `/admin/main-categories`
- ✅ Manual test passed for `create`
- ✅ Manual test passed for `update`
- ✅ Manual test passed for `delete`
- ✅ Product create flow now depends on this managed list for `mainCategoryKey`
- ✅ Launch note: this will be used for the first launch baseline; change carefully because it affects catalog admin workflow and future search/filter behavior

### Session 2026-04-25 → 2026-04-26: Catalog refactor + Multi-Inventory + Admin product detail rebuild

#### Catalog data layer

- ✅ Migration `016_catalog_media_and_documents.sql` — normalized `media_gallery` + `media_links` + `documents` JSONB on products and SKUs
- ✅ Migration `017_catalog_terms_dictionary.sql` — registry for tag/category keys
- ✅ Migration `019_clean_catalog_refactor.sql` — clean rebuild of catalog mappers around new media model
- ✅ `server/utils/admin-catalog.ts` consolidated `ADMIN_PRODUCT_LIST_SELECT`, `ADMIN_PRODUCT_DETAIL_SELECT`, `ADMIN_SKU_SELECT`, `ADMIN_SKU_INVENTORY_SELECT`

#### Branches + multi-inventory hierarchy

- ✅ Migration `018_sku_branch_inventory.sql` — moved stock from SKU counters to `sku_branch_inventory`
- ✅ Migration `020_branch_business_fields_and_inventory_log.sql` — branch business metadata + `inventory_change_log` audit trail
- ✅ Migration `021_multi_inventory_per_branch.sql` — new `inventories` table; `sku_branch_inventory.inventory_id` FK; auto-created "Default" inventory per branch; trigger blocks rename/delete of `is_default = true`
- ✅ Hierarchy: `store_branches (1) → inventories (N) → sku_branch_inventory (N)`
- ✅ Admin page `/admin/branches-inventory` — three-level UI (branch → inventory → stock) with audit logging on all mutations
- ✅ Server APIs:
  - `GET/POST /api/admin/branches`
  - `PATCH /api/admin/branches/:branchId`
  - `GET/POST /api/admin/branches/:branchId/inventories`
  - `PATCH/DELETE /api/admin/branches/:branchId/inventories/:inventoryId`
  - `GET/POST /api/admin/inventories/:inventoryId/stock`
  - `PATCH/DELETE /api/admin/inventories/:inventoryId/stock/:stockId`

#### Admin product detail rebuild (`/admin/products/[productId]`)

- ✅ Product info form + JSONB editors for spec / detail blocks
- ✅ Photo manager (frozen — do not modify) using `AdminMediaGalleryManager` for product + SKU galleries
- ✅ SKU rows reorganized: each row is independent and can expand an **inline inventory panel**
- ✅ Inline inventory panel shows all stock rows across branches/inventories for that SKU, with add/edit/delete and branch/inventory selectors
- ✅ Branch + inventory dropdowns dynamically load via `/api/admin/branches` and `/api/admin/branches/:id/inventories`
- ✅ Quick Create Default SKU — products with 0 SKUs get a one-click button that creates a default SKU (`useProductImages = true`, price `0`, `skuCode = product.slug`) and auto-expands its inventory panel

#### Admin product list (`/admin/products`)

- ✅ List API now returns `minPrice`, `maxPrice`, `maxOriginalPrice`, `currencyCode` aggregated from SKUs
- ✅ List card shows price (single value or range) with strike-through original price when discounted

#### Photo manager freeze

- 🔒 The Photo Manager block inside `app/pages/admin/products/[productId].vue` is locked until further notice — do not modify

---

## 4. สิ่งที่กำลังทำ / แผนงานถัดไป

### Task 3: Cart/Checkout + Data Foundation (IN PROGRESS — Design Phase)

> Historical note: some items below predate the current integrated `/admin` MVP.
> The current branch already runs admin/backoffice inside this same Nuxt app.

#### Gap Analysis ที่พบ:

| ข้อมูลที่ขาด      | ปัญหา                                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| `CartItem`        | ขาด `skuId`, `unitPrice`, `thumbnail`, `attributes`                     |
| `BookingItem`     | ขาด `thumbnail`, `deliveryMethod`, `pickupStoreId`, `shippingAddressId` |
| `User / Auth`     | ไม่มีเลย — ต้องสร้างใหม่                                                |
| `Address`         | ไม่มี — ต้องใช้ทั้ง Cart (จัดส่ง) + Booking (จัดส่งอุปกรณ์เช่า)         |
| `StoreLocation`   | มี ID reference ใน mock แต่ไม่มี type/data                              |
| `DeliveryMethod`  | ไม่มี concept delivery vs pickup                                        |
| `CheckoutSession` | ไม่มี — รวม cart + booking + delivery + address                         |

#### Master Plan — 3 Phases:

**Phase A: Data Foundation (ต้องทำก่อน)**

- A1: Setup Supabase (PostgreSQL + Auth + Realtime + Storage)
- A2: Auth System (UAuthForm + Email/Password + Google OAuth)
- A3: Core Types + DB Schema (User, Address, StoreLocation, upgrade Cart/Booking)

**Phase B: Cart & Checkout Page**

- B1-B2: Upgrade useCart + useBooking composables
- B3: Cart Page UI (Section 1: Cart items, Section 2: Booking items)
- B4: AddressForm Component (reusable)
- B5: Checkout Flow (payment redirect)

**Phase C: Quotation & Admin**

- C1: Quotation Request (client → server)
- C2: PDF Generation (server-side)
- C3: Admin Dashboard Alert (separate project)

#### Tech Stack Decision (Phase A):

- **Database**: Supabase PostgreSQL (standard — ❌ ไม่ใช้ OrioleDB เพราะยัง beta)
- **Auth**: Supabase Auth (Email/Password + Google OAuth)
- **Frontend Auth UI**: UAuthForm (Nuxt UI component)
- **Nuxt Integration**: @nuxtjs/supabase module
- **Admin / Backoffice**: MVP อยู่ใน Nuxt app เดียวกันภายใต้ `/admin`; ค่อยพิจารณาแยกภายหลังถ้าขอบเขตโตขึ้น

#### Database Architecture (Shared):

```
┌──────────────────────┐      ┌──────────────────────┐
│  HOP-RENTAL Website  │      │  Admin Dashboard      │
│  (Nuxt 4 — this app) │      │  (Nuxt 4 — separate)  │
│                      │      │                        │
│  anon key + RLS      │      │  service_role key      │
└──────────┬───────────┘      └──────────┬─────────────┘
           │                             │
           └──────────┬──────────────────┘
                      │
              ┌───────▼──────────┐
              │   Supabase       │
              │   (1 Project)    │
              │                  │
              │  • PostgreSQL    │
              │  • Auth          │
              │  • Realtime      │
              │  • Storage       │
              └──────────────────┘
```

- ทั้ง 2 apps ใช้ **Supabase project เดียวกัน** (1 database)
- Website ใช้ `anon` key + Row Level Security (RLS)
- Admin ใช้ `service_role` key (bypass RLS) หรือ admin-level RLS policies
- Auth ร่วมกัน (Supabase Auth จัดการ users ที่เดียว)

#### Store Location Data (1 สาขาจริง):

```
บริษัท ฮอปนิค จำกัด
ห้อง 1508 สาขา 0001
เลขที่ 2 ซอยลาดกระบัง 1 ถนนอ่อนนุช
แขวงลาดกระบัง เขตลาดกระบัง กรุงเทพมหานคร 10520
```

- ต้อง Admin แก้ไขได้ผ่าน Dashboard → ต้องเก็บใน DB (ไม่ hardcode)

---

## 5. Business Logic สำคัญ

### Checkout Flow:

- **สินค้าอย่างเดียว** → Redirect ไปชำระเงิน
- **เช่าอย่างเดียว** → กรอกรายละเอียด + เอกสาร + ชำระเงิน
- **ทั้งสองอย่าง** → กรอกให้จบแล้วรวมชำระเงิน

### Quotation Flow:

1. ลูกค้ากดขอใบเสนอราคา → ส่งข้อมูลเข้า server
2. Server generate PDF
3. Alert เข้า Admin Dashboard
4. Admin ตรวจสอบ → กด Confirm → ลงตราประทับ Digital
5. ส่งกลับลูกค้า

### Rental Business Logic:

- `minDays` / `maxDays` — จำนวนวันเช่าขั้นต่ำ/สูงสุด
- `bufferDays` — วันบัฟเฟอร์ระหว่าง 2 orders (ซ่อมบำรุง)
- `storeLocationIds` — สาขาที่มีสินค้าพร้อมเช่า
- Deposit + Daily rate × จำนวนวัน = ราคารวม

---

## 6. คำแนะนำสำหรับ Session ถัดไป

1. อ่านไฟล์นี้ก่อนเริ่มทำงาน เพื่อ Recap context
2. เช็ค git log เพื่อดู commit history
3. **โฟกัสถัดไป**: ปิดงาน asset ตาม `ASSET_ACTION_PLAN.md`
   - U3 (remove product-owned booking ownership), U5 (customer docs in rental UI), U6 (backoffice checklist/doc workflow UI)
   - M5 (move booking submit path to use `asset_id`), M6 (retire product-owned booking UI)
4. ห้ามแตะ Photo Manager ในหน้า `/admin/products/[productId]` จนกว่าจะมีคำสั่งใหม่
