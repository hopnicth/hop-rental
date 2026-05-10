# HOP-RENTAL Doc Map

Last updated: 2026-05-10
Purpose: lightweight entrypoint for Augment and developers. Read this first before opening other docs.

## Read order

1. `map.md` — this file
2. `PROJECT_SUMMARY.md` — current system snapshot
3. `API_INDEX.md` — routes, composables, endpoints, debug rules
4. `SEARCH_AND_FILTER_GUIDELINE.md` — search/filter state, URL persistence, multi-type search direction
5. `ADMIN_MVP_ACTION_PLAN.md` / `ASSET_ACTION_PLAN.md` — active backlog + decisions
6. `DATABASE_ADMIN_MANUAL.md` — admin data setup rules
7. `ROLE_MATRIX.md` — permission model
8. `CART_BOOKING_TEST_CHECKLIST.md` — manual smoke checklist

## Current product state

- Storefront supports sale orders and rental bookings in the same Nuxt app.
- Rental is now `asset`-first (`/product-rental`, `/asset/[slug]`).
- `/user/cart` is the unified review page for cart items + draft rental bookings.
- Sale orders and rental bookings both have customer history pages.
- Internal backoffice lives under `/admin` and is gated by `public.users.platform_role`.
- Admin now has product, asset, branch/inventory, order, rental-booking, and POS sale/rental operations surfaces.

## Most important docs by task

### If you need current business/technical context

- Read `PROJECT_SUMMARY.md`

### If you need routes, APIs, composables, or migration-sensitive behavior

- Read `API_INDEX.md`

### If you need search/filter behavior or future global search direction

- Read `SEARCH_AND_FILTER_GUIDELINE.md`

### If you need internal admin/backoffice scope

- Read `ADMIN_MVP_ACTION_PLAN.md`

### If you need asset/rental design rules

- Read `ASSET_ACTION_PLAN.md`

### If you need table setup / launch data rules

- Read `DATABASE_ADMIN_MANUAL.md`

### If you need permission rules

- Read `ROLE_MATRIX.md`

### If you need smoke-test scenarios

- Read `CART_BOOKING_TEST_CHECKLIST.md`

## High-signal rules to remember

- Internal admin access uses `public.users.platform_role` (`staff`, `super_admin`), not `company_members.role`.
- `/admin/home-content` is intentionally narrower than general admin and remains `super_admin` only.
- Homepage partner/logo marquee now comes from `home_partner_logos` with storefront fallback only for older schemas; it is hidden on small mobile in favor of category shortcut cards.
- Homepage hero banners support a required desktop image plus an optional mobile-specific image; mobile falls back to the desktop image when no phone version is set.
- Homepage curated product/asset rails are capped at 15 items each.
- Homepage promotion/service cards are pure references to `content_pages` rows; admin must create the content page first, then pick it from `/admin/home-content`.
- Homepage category card data is DB-backed through `/api/home-category-cards` with mock fallback only. Desktop sub-option selection routes to `/search?q=...`; mobile icon group cards route to `/search?category=<mainCategoryKey>` for whole-category browsing. Do not use sub-option shortcut keys as `category`.
- `content_pages.content_type` supports `blog`, `service`, `promotion`, and `review`. Reviews can be linked to one or more `products` and/or `assets` from `/admin/content`, and render as a "Product reviews" section on `/product-{group}/{slug}` and `/asset/{slug}`.
- Homepage card sections use Nuxt UI `UCarousel`/Embla rails with loop + timed autoplay, arrows, dots, and no continuous auto-scroll plugin.
- Storefront card images should preserve square `1:1` frames using `aspect-square` and `object-cover`; avoid reverting card media to fixed `h-48` heights.
- Card-based async lists/grids/rails must show `<CommonLoadingCat />` plus shape-matched skeleton cards while loading; never leave empty space or use ad-hoc spinners. See "Lazy load loading state standard" in `API_INDEX.md`.
- Homepage image uploads now use Supabase Storage via the shared `catalog-media` bucket.
- SVG uploads are allowed only for Home partner logos; other Home uploads are converted to WebP.
- The partner logo marquee is intentionally compact at 40px height and pauses on hover; mouse-wheel manual scrolling is disabled.
- Global UI colors/radius are overridden in `app/assets/css/main.css`; keep HOP tokens and the unified `0.2rem` radius unless product direction changes.
- Rental bookings can now be rooted by `asset_id` alone; `product_id` / `sku_id` may be null in newer schemas.
- Booking cancellation is soft-delete via `status = 'cancelled'`.
- Booker name + phone are captured on rental submission and should be preferred over account phone when present.
- Order tracking info belongs on sale orders and is customer-visible after admin update.
- For PostgREST `ILIKE` filters, use `*term*`, not `%term%`.
- Dynamic filters are tag-driven: `filter_options.key` must exactly equal a `tag_keys` entry; `filter_keys` are trigger-generated tokens like `sub_category__impact_drill`.
- `category_keys` contains `[main_category_key] + tag_keys`; do not render it directly as a public category list without whitelisting real main categories.
- Home category sub-option selections should route to `/search?q=...` only; Home mobile category icon cards may route to `/search?category=<mainCategoryKey>` because that is a real typed main category. `/search` should open dynamic filters after a real main category is active.
- Main categories are typed by `entity_types`; always scope category pickers by the current domain (`product`, `asset`, `service`, `promotion`, `blog`, `review`).
- Content listing pages (`/services`, `/reviews`, `/blog`, `/promotions`) use `content_pages.main_category_key` and persist filters in `?category=...`. Migration `047` is applied; existing content still needs category assignment in `/admin/content`.
- Future global search should support products, rental assets, services, blogs, reviews, and promotions. Migration `045` for DB-level product dynamic filters is prepared but still pending remote apply.
- Admin order QR payloads: `order:<number>`, `booking:<uuid>`, `customer:<uuid>`.
- Admin POS payloads/flows are branch-scoped; Sale customer info is optional, Rental customer info is required, and `Scan Customer` lives in the customer info card.
- Cookie consent is captured by `<CookieConsentBanner />` mounted in both `default` and `admin` layouts. Consent state lives in the `hop-rental-cookie-consent` cookie (180-day TTL, versioned). Categories: `necessary` (always on), `analytics`, `preferences`, `marketing`. Non-essential default off — never load analytics/marketing scripts before checking `useCookieConsent().isAllowed(...)`.
- Floating UI z-index ladder: ChatFab / MobileFloatingPanel `z-40` → generic Nuxt UI modals `z-50` → cookie consent banner `z-60` → cookie preferences modal `z-70`. Keep ChatFab below modal overlays; do not raise it back to `z-999`.

## Key app surfaces

- Storefront: `/`, `/product-{group}`, `/product-{group}/{slug}`, `/product-rental`, `/asset/{slug}`, `/blog`, `/blog/[slug]`, `/services`, `/services/[slug]`, `/promotions`, `/promotions/[slug]`, `/reviews`, `/reviews/[slug]`
- Customer: `/user/cart`, `/user/orders`, `/user/rentals`
- Admin: `/admin`, `/admin/products`, `/admin/assets`, `/admin/filter-groups`, `/admin/main-categories`, `/admin/home-categories`, `/admin/branches-inventory`, `/admin/orders`, `/admin/orders/[id]`, `/admin/pos`, `/admin/walk-in`, `/admin/rental-bookings/[id]`, `/admin/home-content`, `/admin/content`

## Key server/API areas

- Public: `server/api/branches.get.ts`
- Public dynamic filters: `server/api/filter-groups.get.ts`
- Admin orders: `server/api/admin/orders/*`, `server/utils/admin-orders.ts`
- Admin rental ops: `server/api/admin/rental-bookings/*`, `server/utils/admin-bookings-ops.ts`
- Admin POS: `server/api/admin/pos/*`, `server/utils/admin-pos.ts`
- Admin catalog/assets: `server/api/admin/products/*`, `server/api/admin/assets/*`
- Admin dynamic filters: `server/api/admin/filter-groups/*`, `server/utils/admin-filter-groups.ts`
- Public typed categories: `server/api/main-categories.get.ts`, `app/composables/useMainCategories.ts`
- Admin Home category cards: `server/api/admin/home-categories/*`, `server/utils/home-categories.ts`
- Admin home content: `server/api/admin/home-content/*`, `server/utils/admin-home.ts`, `server/utils/home-media.ts`
- Admin content pages: `server/api/admin/content/*`, `server/utils/content-pages.ts`, `server/utils/content-media.ts`

## Key migrations to know

- `028_assets_detail_blocks.sql`
- `014_homepage_content.sql`
- `029_rental_bookings_pricing_breakdown.sql`
- `030_shipping_cost.sql`
- `031_rental_bookings_asset_only.sql`
- `032_orders_tracking.sql`
- `033_rental_booking_docs_storage.sql`
- `034_home_partner_logos.sql`
- `035_catalog_media_svg_mime.sql`
- `036_content_pages.sql`
- `037_content_pages_localized_body.sql`
- `038_home_link_cards_content_page_ref.sql`
- `040_content_page_links.sql`
- `041_dynamic_product_filters.sql`
- `042_allow_filter_key_updates.sql`
- `043_auto_sync_filter_options_from_tags.sql`
- `044_home_category_cards.sql`
- `045_search_products_dynamic_filters.sql` (prepared; apply status must be checked per environment)
- `046_main_category_entity_types.sql` (applied; typed `main_categories.entity_types`)
- `047_content_pages_main_category.sql` (applied; content listing category filters)
- `058_rental_booking_atomic_overlap_guard.sql` (applied; rental overlap guard)
- `059_admin_pos_full_function.sql` (applied; branch-aware POS sale/rental support)
- `060_restore_sku_inventory_kind.sql` (applied; POS sale inventory compatibility)

## Recommended maintenance rule

- Keep docs short and current.
- Prefer updating the focused doc rather than adding a new long narrative file.
- If a new doc is added, link it here immediately.
