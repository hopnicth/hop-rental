# Database Admin Manual

Last updated: 2026-04-26
Audience: internal staff/data-entry + developers who need a practical setup guide

## Purpose

This manual explains the important data that must be prepared so the storefront can sell products and accept rental bookings correctly.

Focus areas:

- what admin should create manually
- what fields are required vs recommended
- what must be configured before a product/rental item can go live
- what tables are system-managed and should usually **not** be created manually

## Role naming note for this manual

In this document:

- **internal admin / internal staff** means HOPNIC `staff` or `super_admin`
- **organization admin** means customer-side `b2b_admin`
- **organization member** means customer-side `b2b_user`
- homepage content curation under `/admin/home-content` currently means HOPNIC `super_admin` only

Important boundary:

- `b2b_admin` is for customer-organization approvals/management
- `staff` and `super_admin` are for HOPNIC internal backoffice work

See `ROLE_MATRIX.md` for the canonical role matrix.

## Admin API environment requirement

Internal admin routes under `/admin` and `/api/admin/*` use privileged server-side
Supabase access for HOPNIC backoffice operations.

Required local/server env:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SECRET_KEY` recommended
- or `SUPABASE_SERVICE_KEY` as a deprecated fallback

Important notes:

- `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_KEY` must stay server-only and must
  never be exposed to the browser.
- Without the server-only key, admin pages now fall back to read-only mode where
  possible and show setup warnings instead of failing with a raw 500.
- Create/edit actions for products, SKUs, assets, and matches still
  require the server-only key.
- After changing `.env`, restart the Nuxt dev server.

## Quick setup order

Use this order when preparing a new rentable item:

1. Confirm the required `public.main_categories` row already exists
2. Create `public.products`
3. Create at least 1 `public.product_skus` row under the product
4. Make sure pickup hub/store config exists and is active
5. Create `public.assets`
6. Create `public.asset_matches` from asset -> product
7. Validate storefront pages:
   - `/product-{group}/{slug}`
   - `/product-rental`
   - `/asset/{slug}`

## Main category rule for launch 1

Current agreed rule for the first launch:

- `public.main_categories` is the source of truth for the product primary category.
- `super_admin` manages this list at `/admin/main-categories`.
- Product create flow must select `main_category_key` from this managed list only.
- Free-text primary categories are intentionally not allowed.
- The fallback key `others` must remain in the system.

Validated status:

- Manually tested on 2026-04-24.
- `create` passed.
- `update` passed.
- `delete` passed.

Launch note:

- This rule is planned as the launch-1 catalog classification baseline.
- If anyone wants to change the main-category model, selection rule, or delete policy,
  review the impact carefully first because it affects admin workflow, product create,
  future search/filter behavior, and training/documentation.

## Set / package convention (current decision)

Current agreed direction for this branch:

- `asset` can be used as a **set / package / commercial offering**.
- Use `main_category_key` (from `public.main_categories`) plus `tag_keys` to classify the set; `category_keys` is auto-derived from those two by the `assets_before_sync_category_keys_trg` trigger (migration `026`).
- Do **not** require a business concept of anchor/primary product for the set.
- Use `asset_matches` as the membership relation from set -> related products.
- The same product may appear in multiple sets.

### Important technical note

Even though the business model does not require an anchor product, the current booking implementation still depends on product/SKU references for compatibility.

That means each bookable asset should still have:

- at least 1 matched product in `asset_matches`
- at least 1 usable SKU under that matched product

This is a **technical compatibility rule**, not a business rule about which item is the primary item in the set.

## Which tables admin should care about

| Table                                  | Who usually creates it           | Purpose                            | Admin should edit directly? |
| -------------------------------------- | -------------------------------- | ---------------------------------- | --------------------------- |
| `public.main_categories`               | super admin                      | primary product category registry  | Yes                         |
| `public.products`                      | internal staff/import            | sale catalog root                  | Yes                         |
| `public.product_skus`                  | internal staff/import            | price/stock/rental pricing per SKU | Yes                         |
| `public.assets`                        | internal staff                   | public rental offering             | Yes                         |
| `public.asset_matches`                 | internal staff                   | links asset to product             | Yes                         |
| `public.home_banners`                  | super admin                      | homepage hero banner slides        | Yes                         |
| `public.home_link_cards`               | super admin                      | homepage promotion/service rails   | Yes                         |
| `public.home_featured_products`        | super admin                      | curated homepage product rail      | Yes                         |
| `public.home_featured_assets`          | super admin                      | curated homepage rental rail       | Yes                         |
| `public.store_branches`                | internal staff                   | physical branches / hubs           | Yes                         |
| `public.inventories`                   | internal staff                   | inventory pools per branch         | Yes (except default row)    |
| `public.sku_branch_inventory`          | internal staff                   | per-inventory SKU stock rows       | Yes                         |
| `public.inventory_change_log`          | system                           | audit trail for stock mutations    | No (read-only)              |
| `public.rental_bookings`               | system                           | customer booking transactions      | Usually no                  |
| `public.orders` / `public.order_items` | system                           | sale checkout submissions          | Usually no                  |
| `public.addresses`                     | customer/user/organization admin | delivery addresses                 | No catalog setup            |

## 1. Product setup — `public.products`

### Purpose

`products` is the main sale catalog root. Product detail pages, search, category browse, and product-based rental handoff all depend on it.

### Minimum required fields

- `id` — stable text key
- `slug` — unique URL slug
- `type` — catalog type used by the storefront
- `name_th`, `name_en`
- `description_th`, `description_en`
- `main_category_key` — must match a row in `public.main_categories`
- `thumbnail_url`
- `is_hidden = false` if it should be publicly visible

### Strongly recommended fields

- `tag_keys`
- `name_cn`, `name_jp`
- `description_cn`, `description_jp`
- `brand`
- `image_urls`
- `spec`
- `documents`
- `supplier_ids`
- `store_location_ids` when the product can be rented
- rental rule fields:
  - `rental_min_days`
  - `rental_max_days`
  - `rental_buffer_days`

### Important notes

- The route pattern is `/product-{category_keys[0]}/{slug}`.
- `category_keys` is now expected to be derived from `main_category_key` + `tag_keys`,
  not treated as an open free-text primary-category field.
- For launch 1, create or rename the primary category from `/admin/main-categories`
  before creating products.
- If `category_keys[0]` is wrong, the product card URL can be wrong.
- If the product has no usable SKU rows, the storefront product mapping becomes invalid.
- `is_hidden = true` means public catalog queries will not show the product.

## 2. Product SKU setup — `public.product_skus`

### Purpose

Each product must have at least one SKU. SKU rows own pricing, stock, rental pricing, and SKU-specific media.

### Minimum required fields

- `id`
- `product_id`
- `label_th`, `label_en`
- `price`
- `rental_deposit`
- `rental_daily`
- `rental_weekly`
- `rental_monthly`

### Strongly recommended fields

- `label_cn`, `label_jp`
- `media_gallery` / `media_links` (managed via the admin photo manager)
- `attributes`
- `original_price`
- `discount_percent`
- `currency_code` (defaults to `THB`)

### Important notes

- At least 1 SKU is required for the product to work correctly.
- Stock counters previously stored on `product_skus` (sale `stock`, `rental_stock`, `reserved_stock`) have been moved to `sku_branch_inventory` rows since migration `018`. Do not write those columns directly anymore.
- Sale add-to-cart depends on `price` plus aggregated availability across `sku_branch_inventory`.
- If the product has no SKU, the admin product detail page exposes a one-click "Quick create default SKU" flow that creates a default SKU (price `0`, `useProductImages = true`, `skuCode = product.slug`) and immediately opens its inventory panel.
- If the item is sale-only, rental price fields can stay `0`.
- If the item is rentable, rental pricing fields should be meaningful; otherwise booking totals will be wrong or misleading.

## 3. Branch / hub config — `public.store_branches`

### Purpose

`store_branches` is the DB-backed source of truth for physical pickup/return locations. The cart hub picker, branch admin UI, and inventory rows all reference these rows.

### Minimum required fields

- `id`
- `code` — short business code, must be unique
- `name_th`, `name_en`
- `is_active`

### Strongly recommended fields

- `address_th`, `address_en`
- `phone`
- `operating_hours_th`, `operating_hours_en`
- `map_url`
- branch business fields added in migration `020` (tax id, contact, etc.)

### Important notes

- Rental submit from `/user/cart` requires a selected branch.
- Inactive branches are excluded from the public hub picker.
- Each branch automatically gets a single `inventories` row with `is_default = true` (created by the migration `021` trigger). That default row cannot be renamed or deleted.

## 4. Inventory pools — `public.inventories`

### Purpose

Each branch can hold multiple named inventory pools (e.g., "Default", "Damaged", "Quarantine", "Showroom"). All SKU stock rows must belong to one of these pools.

Hierarchy: `store_branches (1) → inventories (N) → sku_branch_inventory (N)`.

### Minimum required fields

- `id`
- `branch_id`
- `name`
- `is_default`

### Important notes

- Exactly one inventory per branch has `is_default = true`. A DB trigger blocks renaming or deleting that row.
- Admins can add additional inventories per branch via `/admin/branches-inventory`.
- Deleting a non-default inventory cascades stock-row deletion guarded by audit logging.

## 5. SKU stock rows — `public.sku_branch_inventory`

### Purpose

Per-`(sku, inventory)` stock counters. Replaces the SKU-level counters that existed before migration `018`.

### Minimum required fields

- `id`
- `sku_id`
- `branch_id`
- `inventory_id`
- `on_hand`
- `reserved`

### Important notes

- `available = on_hand - reserved` is the value used for availability checks.
- Stock changes must go through the admin endpoints; direct writes bypass audit logging.
- Each Add / Edit / Delete writes a row to `inventory_change_log` with the old/new values, actor, and reason.
- The product detail page (`/admin/products/[productId]`) exposes inline inventory management per SKU; the dedicated `/admin/branches-inventory` page is the cross-product view.

## 6. Inventory audit trail — `public.inventory_change_log`

Read-only table populated by the admin server endpoints whenever stock rows are added, updated, or deleted. Capture includes:

- `sku_id`, `branch_id`, `inventory_id`
- previous and new `on_hand` / `reserved`
- `actor_user_id`, `reason`, timestamp

Do not write to this table from admin UI; it is intended as an immutable history.

## 7. Rental access setup — `public.assets`

### Purpose

`assets` is the public rental offering layer. Customers browse asset cards on `/product-rental` and on related product detail pages.

This can also represent a:

- single rentable item
- grouped solution
- package
- set of related equipment

### Minimum required fields

- `code` — unique business code
- `slug` — unique URL slug for `/asset/{slug}`
- `status = 'active'` for public use
- `name_th`, `name_en`
- `description_th`, `description_en`
- `main_category_key` — must match a row in `public.main_categories`
- `daily_rate`
- `deposit_amount`
- `min_rental_days`
- `is_hidden = false`

### Strongly recommended fields

- `tag_keys`
- `name_cn`, `name_jp`
- `description_cn`, `description_jp`
- `brand`
- `thumbnail_url`
- `image_urls`
- `spec_summary`
- `weekly_rate`, `monthly_rate`
- `max_rental_days`, `buffer_days`
- `storage_location_code`, `storage_location_note`
- `service_cycle_value`, `service_cycle_unit`
- `last_serviced_at`, `next_service_due_at`
- `sort_order`

### Important notes

- Public browse should only use rows that are both `status = 'active'` and `is_hidden = false`.
- `code` should be stable and staff-friendly because it is snapped into booking rows.
- `slug` changes will change the public URL.
- `spec_summary` should be a JSON object, not an array/string payload.
- If this asset is being used as a set/package, the `description` and `spec_summary` should explain what is included in the set.

## 8. Rental access -> product mapping — `public.asset_matches`

### Purpose

This table controls where a asset appears under product detail and which product attribution is kept when a customer books.

For set/package usage, treat this table as the membership list of products related to the set.

### Minimum required fields

- `asset_id`
- `product_id`

### Strongly recommended fields

- `sort_order`
- `match_type`
- `note`

### Important notes

- Without a match row, the asset may still be reachable directly from `/product-rental`, but it will not appear under the related product detail page.
- Multiple products can point to one asset, but each `(asset_id, product_id)` pair must be unique.
- The same product can belong to many asset sets/packages.
- There is currently no required business meaning that one matched product must be marked as the primary product.
- However, the current booking flow still expects at least one matched product path to remain usable.

## 9. Homepage content setup — `public.home_*`

### Purpose

The homepage now has CMS-like content driven by four tables created in
`supabase/migrations/014_homepage_content.sql`.

Current admin surface:

- `/admin/home-content`
- `/api/admin/home-content/*`

Current access rule:

- `super_admin` only

### Tables in scope

- `public.home_banners`
  - Hero banner slides for the main home carousel.
  - Own localized title/subtitle/CTA, image URLs, link target, sort order, and active flag.
- `public.home_link_cards`
  - Horizontal cards for the `promotion` and `service` home sections.
  - `section_key` must be either `promotion` or `service`.
- `public.home_featured_products`
  - Curated product IDs for the homepage featured-products rail.
- `public.home_featured_assets`
  - Curated asset IDs for the homepage featured-rental rail.

### Important notes

- Banner and link-card image fields are currently URL-based; storage upload can be added later.
- Internal links should point to valid public routes such as `/product-all`, `/product-rental`, `/services/{slug}`, `/product-{group}/{slug}`, or `/asset/{slug}`.
- The storefront prefers curated featured products/assets when active rows exist.
- If curated featured rows are empty, the storefront intentionally falls back to deterministic-random live catalog items so the home rails never look blank.
- Promotion/service cards still have a mock fallback if the homepage schema is unavailable in a target environment.

## 10. System-managed tables — usually do not seed manually

### `public.rental_bookings`

Created by the storefront booking flow.

Current lifecycle:

- `draft` = staged in `/user/cart`
- `confirmed` = submitted from `/user/cart`
- `cancelled` = no longer active

Important notes:

- Newer environments support `asset_id` + access snapshot fields.
- Older environments may still work through the app's legacy-schema fallback.
- Do not manually insert fake `asset_id` values; it must be a valid UUID.

### `public.orders` + `public.order_items`

Created by sale checkout submit.

Important notes:

- `checkout_mode = 'payment'` requires a payment method.
- `checkout_mode = 'quotation'` requires `payment_method = null`.

### `public.addresses`

Created by customers or organization admins.

Important notes:

- An address must belong to either `user_id` or `company_id`.
- `is_default` is auto-normalized so only one default address remains per owner.

## 11. Publish checklist for a new rentable item

- [ ] Product row exists and is public (`is_hidden = false`)
- [ ] Product has at least 1 SKU row (use Quick Create on product detail if missing)
- [ ] SKU sale/rental pricing is correct
- [ ] SKU has at least one `sku_branch_inventory` row with non-zero `on_hand` in the right inventory pool
- [ ] Product category keys are correct for route generation
- [ ] Branch IDs used by the product are valid and `is_active = true` in `store_branches`
- [ ] Rental access row exists and is public (`status = active`, `is_hidden = false`)
- [ ] Rental access categories/grouping reflect the intended set/package placement
- [ ] Rental access has thumbnail, pricing, min rental days, and business code
- [ ] Rental access description/spec summary clearly explains what is included when sold as a set/package
- [ ] Rental access is matched to the correct product
- [ ] Product detail shows related asset card(s)
- [ ] `/asset/{slug}` opens correctly

## 12. Current branch caveats

- The storefront still supports a fallback mode when `assets` or newer booking columns are missing from the DB schema.
- That fallback keeps the app usable, but the preferred production path is to apply migration `013_asset_schema.sql`.
- Internal admin page `/admin/assets` also depends on migration `013_asset_schema.sql`; if the page or inline product matches show missing-table errors, check the remote migration state first.
- Main-category admin and strict product primary-category selection depend on migration `015_main_categories_and_product_admin_fields.sql`.
- Asset `main_category_key` + `tag_keys` (and the auto-derived `category_keys`) depend on migration `026_assets_main_category_and_tags.sql`; if `/admin/assets` shows write errors mentioning `main_category_key`, apply that migration on the remote DB.
- Asset tag autocomplete uses the central `catalog_terms` dictionary via migration `027_assets_catalog_terms_sync.sql` (trigger `assets_after_sync_catalog_terms_trg` upserts `tag_keys` into `catalog_terms`). The same dictionary feeds `/api/admin/products/suggestions`, so product and asset tag suggestions stay in sync.
- Homepage content depends on migration `014_homepage_content.sql`; if `/admin/home-content` or homepage content reads fail, check those tables and policies first.
- Empty curated `home_featured_products` / `home_featured_assets` is currently a valid state; the storefront will fall back to deterministic-random live catalog items instead of rendering an empty rail.
- Branches/hubs are now DB-backed via `store_branches` (migration `020_branch_business_fields_and_inventory_log.sql` adds business fields). Older code paths that still read `app/mock/stores.ts` should be migrated to `store_branches`.
- Multi-inventory per branch requires migration `021_multi_inventory_per_branch.sql`. The migration creates a default `inventories` row per branch and a trigger that protects it from rename/delete.
- Stock columns on `product_skus` (`stock`, `rental_stock`, `reserved_stock`) are deprecated since migration `018_sku_branch_inventory.sql`; use `sku_branch_inventory` rows instead.
- All stock mutations through `/api/admin/inventories/*` write to `inventory_change_log`. Direct DB writes bypass the audit trail and are discouraged.
