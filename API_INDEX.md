# API Index

Last updated: 2026-04-28
Audience: developers, QA, future Augment sessions

## Purpose

Quick map of important composables, pages, endpoints, and migration-sensitive behavior.
Read this after `map.md` when debugging or implementing features.

## Core conventions

- Public catalog reads rely on Supabase RLS.
- Customer-owned writes require authentication.
- Internal admin routes use `platform_role` (`staff`, `super_admin`).
- `/admin/home-content` is narrower and remains `super_admin` only.
- Some older environments may still rely on schema fallback in `useBooking()`.
- For PostgREST `ILIKE`, use `*term*`, not `%term%`.

## Main read paths

| Surface                        | Main code                                              | Source                                                                                                 |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Product browse/detail          | `app/composables/useProducts.ts`                       | `products`, `product_skus`                                                                             |
| Asset browse/detail            | `app/composables/useAssets.ts`                         | `assets`, `asset_matches`                                                                              |
| Cart                           | `app/composables/useCart.ts`                           | `carts`, `cart_items`                                                                                  |
| Rental booking store           | `app/composables/useBooking.ts`                        | `rental_bookings`                                                                                      |
| Orders history                 | `app/composables/useOrders.ts`                         | `orders`, `order_items`                                                                                |
| Branch picker                  | `app/composables/useBranches.ts`                       | `store_branches`                                                                                       |
| Homepage banners/content/logos | `useBanners.ts`, `useHomeContent.ts`, `usePartners.ts` | `home_banners`, `home_link_cards` joined with `content_pages`, `home_featured_*`, `home_partner_logos` |
| Content pages                  | `useContentPages.ts`, `ContentRenderer.vue`            | `content_pages` (localized TipTap body)                                                                |
| Admin order dashboard          | `app/composables/useAdminOrders.ts`                    | `/api/admin/orders/customers`                                                                          |

## Storefront UI conventions

- Home content sections render through `app/components/home/HomeHorizontalRail.vue`, a Nuxt UI `UCarousel`/Embla wrapper using loop + timed autoplay, arrows, and dots.
- Do not use the continuous Auto Scroll plugin for Home section cards unless explicitly requested.
- Product/asset listing cards share `CatalogCardShell.vue`; card media should stay `aspect-square w-full object-cover`.
- Home promotion/service cards use `HomeLinkCard.vue` and read title/excerpt/cover/link live from the linked `content_pages` row.
- Global HOP theme tokens live in `app/assets/css/main.css` (`--ui-primary`, `--ui-secondary`, status colors, and `0.2rem` radius scale).

## Main write paths

| Action                             | Main code                                                        | Writes to                                |
| ---------------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| Add sale item                      | `useCart().addToCart()`                                          | `carts`, `cart_items`                    |
| Create booking draft               | `useBooking().addBooking()`                                      | `rental_bookings`                        |
| Confirm booking                    | `useBooking().updateBookingStatus()`                             | `rental_bookings`                        |
| Submit sale order                  | `useOrders().submitOrder()`                                      | `orders`, `order_items`                  |
| Admin order update                 | `/api/admin/orders/[id].patch.ts`                                | `orders`                                 |
| Admin booking update               | `/api/admin/rental-bookings/[id].patch.ts`                       | `rental_bookings`                        |
| Admin booking ops                  | `/api/admin/rental-bookings/[id]/ops.get.ts` + nested ops routes | booking docs/checklists tables           |
| Admin homepage content CRUD/upload | `/api/admin/home-content/*`                                      | `home_*` tables + `catalog-media` bucket |
| Admin content pages CRUD/upload    | `/api/admin/content/*`                                           | `content_pages` + `catalog-media` bucket |

## Important customer routes

- `/user/cart`
- `/user/orders`
- `/user/rentals`
- `/asset/[slug]`

## Important admin routes

- `/admin/products`
- `/admin/assets`
- `/admin/branches-inventory`
- `/admin/orders`
- `/admin/orders/[id]`
- `/admin/rental-bookings/[id]`
- `/admin/home-content`
- `/admin/content`

## Important admin server areas

- `server/utils/admin-orders.ts`
- `server/utils/admin-bookings-ops.ts`
- `server/api/admin/orders/*`
- `server/api/admin/rental-bookings/*`
- `server/api/admin/assets/*`
- `server/api/admin/products/*`
- `server/api/admin/home-content/*`
- `server/utils/admin-home.ts`
- `server/utils/home-media.ts`
- `server/api/admin/content/*`
- `server/utils/content-pages.ts`
- `server/utils/content-media.ts`

### `014_homepage_content.sql`

- `home_banners`, `home_link_cards`, `home_featured_products`, `home_featured_assets`

## Migration-sensitive behavior

### `029_rental_bookings_pricing_breakdown.sql`

- `pricing_breakdown`, `weekly_rate`, `monthly_rate`

### `030_shipping_cost.sql`

- `products.shipping_size`
- `orders.shipping_cost`, `orders.shipping_breakdown`

### `031_rental_bookings_asset_only.sql`

- rental bookings may be rooted by `asset_id` alone
- `product_id` / `sku_id` can be null

### `032_orders_tracking.sql`

- sale orders support tracking/admin fulfillment metadata

### `033_rental_booking_docs_storage.sql`

- booking docs store `storage_bucket`, `storage_path`
- rental bookings store `booker_name`, `booker_phone`

### `034_home_partner_logos.sql`

- `home_partner_logos`
- homepage partner/logo marquee is DB-backed

### `035_catalog_media_svg_mime.sql`

- `catalog-media` storage bucket allows `image/svg+xml`
- SVG upload is accepted only for Home `partner-logo` media
- non-SVG Home media is still processed to WebP

### `036_content_pages.sql`

- `content_pages` stores blog, service, and promotion pages
- Admin uploads share `catalog-media` with `content-pages/*` storage prefix

### `037_content_pages_localized_body.sql`

- `content_pages.blocks` accepts a localized TipTap (ProseMirror) document object keyed by `th`, `en`, `cn`, `jp`
- Legacy array-style blocks remain readable; default is `'{}'::jsonb`

### `038_home_link_cards_content_page_ref.sql`

- `home_link_cards.content_page_id` references `content_pages(id)` with `ON DELETE CASCADE`
- Legacy text columns (`title_*`, `description_*`, `image_url`, `link_url`) are nullable when `content_page_id` is set
- Row guard `home_link_cards_source_present`: either `content_page_id` is present, or all legacy text fields are filled
- Unique `(section_key, content_page_id)` prevents duplicating the same page in one section
- Migration drops unlinked legacy rows; admin must pick a `content_pages` row to populate the rail

## Fast debug checklist

1. Is the user authenticated for customer-owned writes?
2. Does the user have the correct `platform_role` for admin routes?
3. Is the target DB on migrations `029` through `038`?
4. If search fails on PostgREST, are you using `*term*` wildcards?
5. If asset booking fails, is `asset_id` valid and allowed by the current schema?
6. If booking docs fail to delete cleanly, are `storage_bucket` and `storage_path` present?
7. If admin order list lacks contact info, check both `booker_phone` and account `users.phone`.
8. If a cancelled booking still shows in `/user/rentals`, verify the row is `status = 'cancelled'`.
9. If homepage uploads fail, verify `catalog-media` bucket access and `/api/admin/home-content/upload`.
10. If SVG partner logo upload fails, verify migration `035` reached the remote storage bucket config.
11. If Home carousel cards feel wrong, check `HomeHorizontalRail.vue` first for `UCarousel` item basis, arrows, loop, and autoplay options.
12. If a promotion/service rail is empty, confirm an active `content_pages` row of that type exists and is linked from `/admin/home-content`.

## Cross refs

- `map.md`
- `PROJECT_SUMMARY.md`
- `ADMIN_MVP_ACTION_PLAN.md`
- `ASSET_ACTION_PLAN.md`
