# HOP-RENTAL Doc Map

Last updated: 2026-04-27
Purpose: lightweight entrypoint for Augment and developers. Read this first before opening other docs.

## Read order

1. `map.md` — this file
2. `PROJECT_SUMMARY.md` — current system snapshot
3. `API_INDEX.md` — routes, composables, endpoints, debug rules
4. `ADMIN_MVP_ACTION_PLAN.md` / `ASSET_ACTION_PLAN.md` — active backlog + decisions
5. `DATABASE_ADMIN_MANUAL.md` — admin data setup rules
6. `ROLE_MATRIX.md` — permission model
7. `CART_BOOKING_TEST_CHECKLIST.md` — manual smoke checklist

## Current product state

- Storefront supports sale orders and rental bookings in the same Nuxt app.
- Rental is now `asset`-first (`/product-rental`, `/asset/[slug]`).
- `/user/cart` is the unified review page for cart items + draft rental bookings.
- Sale orders and rental bookings both have customer history pages.
- Internal backoffice lives under `/admin` and is gated by `public.users.platform_role`.
- Admin now has product, asset, branch/inventory, order, and rental-booking operations surfaces.

## Most important docs by task

### If you need current business/technical context

- Read `PROJECT_SUMMARY.md`

### If you need routes, APIs, composables, or migration-sensitive behavior

- Read `API_INDEX.md`

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
- Homepage partner/logo marquee now comes from `home_partner_logos` with storefront fallback only for older schemas.
- Homepage curated product/asset rails are capped at 15 items each.
- Homepage image uploads now use Supabase Storage via the shared `catalog-media` bucket.
- SVG uploads are allowed only for Home partner logos; other Home uploads are converted to WebP.
- The partner logo marquee is intentionally compact at 40px height.
- Rental bookings can now be rooted by `asset_id` alone; `product_id` / `sku_id` may be null in newer schemas.
- Booking cancellation is soft-delete via `status = 'cancelled'`.
- Booker name + phone are captured on rental submission and should be preferred over account phone when present.
- Order tracking info belongs on sale orders and is customer-visible after admin update.
- For PostgREST `ILIKE` filters, use `*term*`, not `%term%`.
- Admin order QR payloads: `order:<number>`, `booking:<uuid>`, `customer:<uuid>`.

## Key app surfaces

- Storefront: `/`, `/product-{group}`, `/product-{group}/{slug}`, `/product-rental`, `/asset/{slug}`
- Customer: `/user/cart`, `/user/orders`, `/user/rentals`
- Admin: `/admin`, `/admin/products`, `/admin/assets`, `/admin/branches-inventory`, `/admin/orders`, `/admin/orders/[id]`, `/admin/rental-bookings/[id]`

## Key server/API areas

- Public: `server/api/branches.get.ts`
- Admin orders: `server/api/admin/orders/*`, `server/utils/admin-orders.ts`
- Admin rental ops: `server/api/admin/rental-bookings/*`, `server/utils/admin-bookings-ops.ts`
- Admin catalog/assets: `server/api/admin/products/*`, `server/api/admin/assets/*`
- Admin home content: `server/api/admin/home-content/*`, `server/utils/admin-home.ts`, `server/utils/home-media.ts`

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

## Recommended maintenance rule

- Keep docs short and current.
- Prefer updating the focused doc rather than adding a new long narrative file.
- If a new doc is added, link it here immediately.
