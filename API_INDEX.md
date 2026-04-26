# API Index

Last updated: 2026-04-26
Audience: developers, QA, future Augment sessions

## Purpose

This index maps the main storefront flows to their composables, tables, and important compatibility notes.

This app is currently **Supabase-first**, so the practical API surface is mostly:

- Nuxt composables calling Supabase directly
- Supabase tables protected by RLS
- page routes that trigger these read/write flows

## Conventions

- Public catalog reads are allowed through RLS on visible rows.
- Customer-owned writes require authentication and pass through `auth.uid()` policies.
- Some flows include compatibility fallback for older DB schemas.
- Role model is split into two layers:
  - `public.users.platform_role` = `customer`, `staff`, `super_admin`
  - `public.company_members.role` = `b2b_user`, `b2b_admin`
- Internal backoffice routes (`/admin`, `/api/admin/*`) are gated by `platform_role`, not `company_members.role`.
- Some admin GET endpoints can fall back to read-only mode when `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_KEY` is missing; admin writes still require the server-only key.
- Company purchasing/approval behavior uses organization roles (`b2b_user`, `b2b_admin`).
- See `ROLE_MATRIX.md` for the canonical naming and responsibility split.

## 1. Read flows

| Feature                | Entry pages                                | Main file(s)                                                                                | Reads from                                                                                                | Notes                                                                                                                                                       |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home page content      | `/`                                        | `app/composables/useBanners.ts`, `app/composables/useHomeContent.ts`, `app/pages/index.vue` | `home_banners`, `home_link_cards`, `home_featured_products`, `home_featured_assets`, `products`, `assets` | Hero/link sections prefer curated DB rows; featured product/rental rails fall back to deterministic-random live catalog items when curated lists are empty. |
| Product catalog browse | `/`, `/product-{group}`                    | `app/composables/useProducts.ts`                                                            | `products` (+ nested `product_skus`)                                                                      | Falls back to mapped mock catalog if remote data is unusable. Product route uses `category_keys[0]` + `slug`.                                               |
| Product detail         | `/product-{group}/{slug}`                  | `app/pages/product-[group]/[id].vue`, `useProducts.ts`                                      | `products`, `product_skus`                                                                                | Also loads related asset cards through `useAssets()`.                                                                                                       |
| Rental access listing  | `/product-rental`                          | `app/composables/useAssets.ts`, `app/pages/product-[group]/index.vue`                       | `assets`, `asset_matches`                                                                                 | If asset schema is missing, app falls back to product-derived asset rows.                                                                                   |
| Rental access detail   | `/asset/{slug}`                            | `app/pages/asset/[slug].vue`, `useAssets.ts`                                                | `assets`, `asset_matches`, product catalog                                                                | Primary booking entry for asset flow.                                                                                                                       |
| Cart hydration         | `/user/cart`, feature bar                  | `app/composables/useCart.ts`                                                                | `carts`, `cart_items`                                                                                     | Guest state can exist locally. Logged-in state hydrates from Supabase.                                                                                      |
| Booking hydration      | `/user/cart`, `/user/rentals`, feature bar | `app/composables/useBooking.ts`                                                             | `rental_bookings`                                                                                         | Store exposes `draftBookings`, `confirmedBookings`, `activeBookings`, and availability helpers.                                                             |
| Orders history         | `/user/orders`                             | `app/composables/useOrders.ts`                                                              | `orders`                                                                                                  | Reads authenticated user's orders ordered by `created_at desc`.                                                                                             |
| Address book           | `/user/cart`, account flows                | `app/composables/useAddresses.ts`                                                           | `addresses`                                                                                               | Reads personal + company addresses filtered by RLS.                                                                                                         |

## 2. Write flows

| Action                      | Trigger page/UI                                    | Main function(s)                                                                 | Writes to                                                                           | Auth required                               | Important notes                                                                                                             |
| --------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Add sale item to cart       | product detail, product card actions               | `useCart().addToCart()`                                                          | local cart state, then `carts` + `cart_items` for logged-in users                   | No for guest buffer, yes for DB persistence | Cart count uses quantity sum, not row count.                                                                                |
| Update cart quantity        | `/user/cart`                                       | `useCart().updateQuantity()`                                                     | local cart state, then `cart_items` sync                                            | Same as cart                                | Quantity `<= 0` removes the row.                                                                                            |
| Remove cart item            | `/user/cart`                                       | `useCart().removeFromCart()`                                                     | local cart state, then `cart_items` sync                                            | Same as cart                                | Used by unified cart review flow.                                                                                           |
| Create rental booking draft | `/asset/{slug}` and fallback product booking form  | `useBooking().addBooking()`                                                      | `rental_bookings`                                                                   | Yes                                         | Writes `status = draft`; redirects user to `/user/cart`.                                                                    |
| Confirm rental booking(s)   | `/user/cart`                                       | `useBooking().updateBookingStatus(bookingId, 'confirmed')`                       | `rental_bookings`                                                                   | Yes                                         | Submit is blocked until each active booking has a `hub_id`.                                                                 |
| Update rental booking hub   | `/user/cart`                                       | `useBooking().updateHub()`                                                       | `rental_bookings`                                                                   | Yes                                         | Stores both `hub_id` and `hub_name`.                                                                                        |
| Remove rental booking       | `/user/cart`                                       | `useBooking().removeBooking()`                                                   | `rental_bookings` or local state                                                    | Yes for DB rows                             | Draft bookings are removed from the cart section.                                                                           |
| Submit sale order           | `/user/cart`                                       | `useOrders().submitOrder()`                                                      | `orders`, `order_items`                                                             | Yes                                         | Uses address snapshot + cart item snapshots. Supports `payment` and `quotation` modes.                                      |
| Create address              | cart/account flows                                 | `useAddresses().createAddress()`                                                 | `addresses`                                                                         | Yes                                         | Address belongs to either a user or a company.                                                                              |
| Update address              | cart/account flows                                 | `useAddresses().updateAddress()`                                                 | `addresses`                                                                         | Yes                                         | Default address behavior is normalized at DB level.                                                                         |
| Delete address              | cart/account flows                                 | `useAddresses().deleteAddress()`                                                 | `addresses`                                                                         | Yes                                         | Protected by owner/company RLS.                                                                                             |
| Manage homepage content     | `/admin/home-content`                              | `/api/admin/home-content` (`GET`, `POST`, `PATCH`), `server/utils/admin-home.ts` | `home_banners`, `home_link_cards`, `home_featured_products`, `home_featured_assets` | Yes                                         | `super_admin` only. Product/rental curation stores curated IDs + order; storefront falls back when curated lists are empty. |
| Manage branches             | `/admin/branches-inventory`                        | `/api/admin/branches` (`GET`, `POST`), `/api/admin/branches/:branchId` (`PATCH`) | `store_branches`                                                                    | Yes                                         | `staff` + `super_admin`. Each new branch automatically gets a default inventory pool via DB trigger.                        |
| Manage inventories          | `/admin/branches-inventory`, `/admin/products/:id` | `/api/admin/branches/:branchId/inventories/*`                                    | `inventories`                                                                       | Yes                                         | Default inventory (`is_default = true`) cannot be renamed or deleted.                                                       |
| Manage stock rows           | `/admin/branches-inventory`, `/admin/products/:id` | `/api/admin/inventories/:inventoryId/stock/*`                                    | `sku_branch_inventory`, `inventory_change_log`                                      | Yes                                         | All add/edit/delete actions write to `inventory_change_log` automatically.                                                  |
| Quick create default SKU    | `/admin/products/:id` (zero-SKU empty state)       | `/api/admin/products/:productId/skus` (`POST`)                                   | `product_skus`                                                                      | Yes                                         | Creates a default SKU (`useProductImages = true`, price `0`, `skuCode = product.slug`) and auto-expands inventory panel.    |

## 3. Booking-specific compatibility behavior

### `useBooking.ts`

Important behavior in the current branch:

- `addBooking()` creates `draft` bookings.
- `confirmBooking()` still exists for direct confirmed creation, but the current storefront flow mainly uses `draft -> confirmed` from `/user/cart`.
- `updateBookingStatus()` is the main submit path from cart.
- `updateHub()` stores the pickup branch before submit.

### Legacy-schema fallback

`useBooking()` contains compatibility logic for older `rental_bookings` schemas:

- tries full payload first
- if Supabase returns missing-column errors for newer fields such as:
  - `matched_product_id`
  - `matched_product_name`
  - `asset_id`
  - `asset_code`
  - `asset_slug`
  - `asset_name`
  - `asset_thumbnail`
  - `asset_snapshot`
- then retries using a legacy payload

Additional safeguard:

- `asset_id` is only written when it is a valid UUID

## 4. Rental-access compatibility behavior

### `useAssets.ts`

Primary path:

- read `assets`
- include nested `asset_matches`
- map them to storefront `Asset` models

Fallback path:

- if the asset schema/relationship is missing or returns known 404-style errors
- derive fallback asset rows from rentable products instead of crashing the storefront

Result:

- newer DBs get the real asset catalog
- older DBs stay usable, but with reduced commercial separation

## 5. Table ownership summary

| Table                    | Main ownership                | Used by                                         |
| ------------------------ | ----------------------------- | ----------------------------------------------- |
| `products`               | internal staff/catalog        | sale browse, product detail, rental attribution |
| `product_skus`           | internal staff/catalog        | pricing, rental pricing, media                  |
| `store_branches`         | internal staff                | branch admin, hub picker, inventory ownership   |
| `inventories`            | internal staff                | inventory pool per branch                       |
| `sku_branch_inventory`   | internal staff                | per-pool stock on hand / reserved               |
| `inventory_change_log`   | system                        | audit trail for stock mutations                 |
| `assets`                 | internal staff/rental catalog | `/product-rental`, asset detail                 |
| `asset_matches`          | internal staff                | related asset placement on product detail       |
| `carts` / `cart_items`   | customer + system             | sale cart persistence                           |
| `rental_bookings`        | customer + system             | rental cart, rental history, availability       |
| `orders` / `order_items` | customer + system             | sale checkout submit + order history            |
| `addresses`              | customer/organization admin   | checkout address selection                      |

## 6. Route index

| Route                       | Purpose                                              | Main source                                                                                                                                   |
| --------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/product-{group}`          | category/group browse                                | `useProducts()`, `useAssets()`                                                                                                                |
| `/product-{group}/{slug}`   | product detail + matched asset list                  | `useProducts()`, `useAssets()`                                                                                                                |
| `/asset/{slug}`             | asset detail + booking entry                         | `useAssets()`, `useBooking()`                                                                                                                 |
| `/user/cart`                | unified sale + rental review/submit                  | `useCart()`, `useBooking()`, `useOrders()`, `useAddresses()`                                                                                  |
| `/user/rentals`             | confirmed rental history                             | `useBooking()`                                                                                                                                |
| `/user/orders`              | sale order history                                   | `useOrders()`                                                                                                                                 |
| `/admin`                    | internal backoffice landing page                     | `app/middleware/role.ts`, `app/layouts/admin.vue`                                                                                             |
| `/admin/products`           | internal product list/create (with price aggregates) | `server/api/admin/products/*`                                                                                                                 |
| `/admin/products/{id}`      | internal product edit + SKU rows + inline inventory  | `server/api/admin/products/*`, `server/api/admin/products/:productId/skus/*`, `server/api/admin/branches/*`, `server/api/admin/inventories/*` |
| `/admin/assets`             | internal asset list/create/edit + inline matching    | `server/api/admin/assets/*`, `server/api/admin/assets/:id/matches/*`                                                                          |
| `/admin/home-content`       | internal homepage content curation                   | `server/api/admin/home-content/*`, `app/pages/admin/home-content.vue`                                                                         |
| `/admin/main-categories`    | super-admin main-category registry                   | `server/api/admin/main-categories/*`                                                                                                          |
| `/admin/branches-inventory` | branch + multi-inventory + stock CRUD                | `server/api/admin/branches/*`, `server/api/admin/inventories/*`                                                                               |

## 7. Quick debug checklist

When a flow looks broken, check these in order:

1. Is the user authenticated for customer-owned writes?
2. Does the target row exist and pass public/RLS visibility?
3. Does the product have at least one valid SKU?
4. Is the asset `active` and not hidden?
5. Does the asset have a valid match row to the product?
6. Is the booking blocked because no hub was selected?
7. Is the admin server missing `SUPABASE_SECRET_KEY`, causing read-only fallback or blocked writes?
8. Is the DB missing migration `013_asset_schema.sql`, causing fallback behavior or missing-table errors?
9. Is the DB missing migration `014_homepage_content.sql`, causing `/admin/home-content` or homepage-content reads to fail?
10. If the hero banner is missing, do the `home_banners.link_url` values resolve to valid internal or external destinations?
11. If stock numbers look off, is the DB missing migration `018_sku_branch_inventory.sql` (per-branch stock) or `021_multi_inventory_per_branch.sql` (per-inventory pools)?
12. If `/admin/branches-inventory` shows empty inventory dropdowns, has the migration `021` trigger created the default inventory rows for each branch?
13. If a stock change does not appear in audit history, was the change made through `/api/admin/inventories/*` (which writes `inventory_change_log`) or via direct DB write (which bypasses it)?
14. If `/admin/assets` write fails on save, is the DB missing migration `026_assets_main_category_and_tags.sql` (adds `main_category_key` + `tag_keys`) or `027_assets_catalog_terms_sync.sql` (mirrors product trigger that upserts asset tags into `catalog_terms`)?
