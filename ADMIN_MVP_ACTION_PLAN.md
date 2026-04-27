# Admin MVP Action Plan

Last updated: 2026-04-27
Owner: Augment continuity doc for future sessions
Status legend: `[ ]` not started, `[/]` in progress, `[x]` done, `[-]` dropped

## Purpose

This file is the continuity + todo plan for the first internal admin area.
Use it to track the smallest useful backoffice needed to maintain products, SKUs,
asset packages, matches, and catalog images.

## How to update this file

1. When work starts, change the checkbox to `[/]`.
2. When work is completed and verified, change it to `[x]`.
3. Keep notes short and factual under the relevant task.
4. Keep this file aligned with `ROLE_MATRIX.md`, `DATABASE_ADMIN_MANUAL.md`, and `API_INDEX.md`.

## Locked decisions

- [x] D1. Internal backoffice access should use `public.users.platform_role`.
- [x] D2. Allowed internal roles for `/admin` are `staff` and `super_admin`.
- [x] D3. Do not use `company_members.b2b_admin` as the internal admin gate.
- [x] D4. Start with a lightweight CRUD admin, not a full dashboard/CMS.
- [x] D5. Admin image flow should upload files to Supabase Storage, then save URLs/paths in DB fields.
- [x] D6. Rental package/set editing should treat `assets` as the commercial root and `asset_matches` as membership.
- [x] D7. UI/docs must distinguish HOPNIC internal roles from customer-organization roles.
- [x] D8. Homepage content curation lives in the same Nuxt admin area, but `/admin/home-content` and `/api/admin/home-content/*` must stay `super_admin` only.

## Phase 0 — foundation

- [x] P0.1 Add `/admin` route shell.
  - 2026-04-22: added `admin` layout and `/admin` entry route.
- [x] P0.2 Add route protection for logged-in users with allowed `platform_role` values.
  - 2026-04-22: extended `app/middleware/role.ts` with `platformRoles` support.
  - 2026-04-22: tightened first-navigation auth/profile resolution to prevent the admin nav from briefly falling back to `Customer` before route changes.
- [x] P0.3 Add a simple admin landing page with links to the first CRUD pages.
  - 2026-04-22: added `/admin`, `/admin/products`, and `/admin/assets` scaffold pages.
- [x] P0.4 Show clear unauthorized behavior for non-admin users.
  - 2026-04-22: unauthorized users are redirected away with a permission toast.

## Phase 1 — catalog CRUD MVP

- [x] P1.1 Products list page.
  - 2026-04-22: `/admin/products` now loads a real list through `/api/admin/products`.
- [x] P1.2 Product create/edit form.
  - 2026-04-22: minimal create flow lives on `/admin/products`; edit flow lives on `/admin/products/[productId]`.
- [x] P1.3 SKU list/create/edit flow under a product.
  - 2026-04-22: nested SKU manager is live on `/admin/products/[productId]` using `/api/admin/products/:productId/skus`.
- [x] P1.4 Asset list page.
  - 2026-04-22: `/admin/assets` now loads a real list through `/api/admin/assets`.
  - 2026-04-22: linked remote DB was brought up to migration `013_asset_schema.sql`, so the required asset tables now exist for this branch.
- [x] P1.5 Asset create/edit form.
  - 2026-04-26: full edit flow is live on `/admin/assets` with split form panels: identity/pricing/storage, media (thumbnail + gallery), inline product matches, and stock per inventory across matched products.
  - 2026-04-26: thumbnail/gallery sync hardened — `thumbnail_url` and `image_urls[0]` are always kept in sync via `setAsCover` upload flag + reorder-on-set-cover (see Phase 2 below).
  - 2026-04-26: assets gained `main_category_key` (FK → `main_categories`) + `tag_keys` (TEXT[]) via migration `026_assets_main_category_and_tags.sql`; a BEFORE trigger derives `category_keys` to keep storefront URLs stable.
  - 2026-04-26: asset tag input now reuses the central `catalog_terms` dictionary via migration `027_assets_catalog_terms_sync.sql` (AFTER trigger upserts asset tags into `catalog_terms`); UI uses `AdminCommaSuggestInput` with autocomplete fed from `/api/admin/products/suggestions`.
- [x] P1.6 Asset match editor (`asset` ↔ `product`).
  - 2026-04-26: product matches are managed inline from `/admin/assets` through nested asset match APIs (`/api/admin/assets/:id/matches/*`); standalone `/admin/matches` page removed.
  - 2026-04-22: remote DB migration `013_asset_schema.sql` was applied so `asset_matches` is available for admin validation.
- [x] P1.8 Asset stock per matched product (`sku_branch_inventory`) inline on `/admin/assets`.
  - 2026-04-26: matched-product SKUs surface a per-(branch, inventory) stock editor under each asset; reuses `/api/admin/assets/:id/stock/*`.
- [x] P1.7 Homepage content admin page + API.
  - 2026-04-23: added `/admin/home-content` for hero banners, promotion/service link cards, and curated featured product/rental rails.
  - 2026-04-23: added `/api/admin/home-content` GET/POST/PATCH endpoints backed by `home_banners`, `home_link_cards`, `home_featured_products`, and `home_featured_assets`.
  - 2026-04-23: applied `014_homepage_content.sql` to the linked remote DB and verified seeded `home_banners` rows exist.

## Phase 2 — media/admin usability

- [x] P2.1 Upload product and asset images to Supabase Storage.
  - 2026-04-25: `AdminMediaGalleryManager` (used by product detail + SKU galleries) is wired to Supabase Storage uploads.
  - 2026-04-26: asset admin reuses the same component for the gallery upload surface; thumbnail card uploads via `target=thumbnail`.
- [x] P2.2 Save `thumbnail_url` and `image_urls` correctly from the admin UI.
  - 2026-04-25: products and SKUs now persist `media_gallery` + `media_links` JSONB through `server/utils/admin-catalog.ts`.
  - 2026-04-26: asset admin keeps `assets.thumbnail_url` and `assets.image_urls[0]` in sync — server `POST /api/admin/assets/:id/media` honors `setAsCover=true` (prepend + thumbnail override); client `Set as cover` reorders `imageUrls`; client `Delete` reassigns thumbnail when the removed image was the cover.
- [ ] P2.3 Add basic validation/error messaging for required fields.
- [ ] P2.4 Add quick links back to storefront-facing pages for spot checks.
- [ ] P2.5 Add image upload/storage flow for homepage banners and link cards instead of URL-only fields.

## Phase 3 — security + server flow

- [x] P3.1 Decide whether admin writes use privileged server API or new RLS admin policies.
  - 2026-04-22: current branch uses privileged server API for admin writes.
- [x] P3.2 If using server API, add `/server/api/admin/*` endpoints with platform-role checks.
  - 2026-04-22: added product, SKU, asset, and match admin endpoints with `platform_role` verification.
  - 2026-04-22: admin GET endpoints now support read-only fallback when the server-only Supabase key is missing; writes still require the server key.
- [ ] P3.3 If using browser writes temporarily, document the risk and scope clearly.
- [ ] P3.4 Never expose `service_role` in client code.

## Phase 4 — branches + multi-inventory operations

- [x] P4.1 Migration `018_sku_branch_inventory.sql` — move stock to `sku_branch_inventory`.
  - 2026-04-25: applied; SKU stock counters replaced by per-branch rows.
- [x] P4.2 Migration `020_branch_business_fields_and_inventory_log.sql` — branch business fields + `inventory_change_log` audit trail.
  - 2026-04-25: applied; all stock mutations now produce audit rows.
- [x] P4.3 Migration `021_multi_inventory_per_branch.sql` — introduce `inventories` table; one default inventory per branch.
  - 2026-04-26: applied; `is_default` triggers prevent rename/delete of the protected "Default" row.
- [x] P4.4 Branch + inventory CRUD admin page (`/admin/branches-inventory`).
  - 2026-04-26: three-level UI (branch → inventory → stock) with audit logging.
- [x] P4.5 Server endpoints for branches, inventories, and stock.
  - 2026-04-26: `/api/admin/branches/*`, `/api/admin/branches/:id/inventories/*`, `/api/admin/inventories/:id/stock/*` all live.
- [x] P4.6 Rebuild product detail (`/admin/products/[productId]`) around media + SKU rows + inline inventory panels.
  - 2026-04-26: each SKU row has an expandable inventory panel that reuses the branches/inventories endpoints.
- [x] P4.7 Quick Create Default SKU for products with zero SKUs.
  - 2026-04-26: one-click flow creates a default SKU (`useProductImages = true`, price `0`) and auto-expands its inventory panel.
- [x] P4.8 Show price aggregates (`minPrice` / `maxPrice` / `maxOriginalPrice`) on the admin product list.
  - 2026-04-26: list cards display single price or range with strike-through original price when discounted.
- 🔒 P4.X Photo Manager block in `app/pages/admin/products/[productId].vue` is **frozen** — do not modify until further notice.

## Phase 5 — order operations

- [ ] P5.1 Admin Order Dashboard page (`/admin/orders`).
  - List both `orders` (sale) and `rental_bookings` (rental) for the back office.
  - Filter by status, date range, customer, branch.
  - Status badges (sale: `pending` / `paid` / `shipped` / `cancelled`; rental: `draft` / `confirmed` / `cancelled`).
- [ ] P5.2 Order detail view.
  - Show line items, totals (incl. shipping breakdown for sale, pricing breakdown for rental), customer + address snapshot, branch, payment method.
- [ ] P5.3 Order/booking status transitions from the admin UI (with audit fields).
- [ ] P5.4 Server endpoints `/api/admin/orders/*` and `/api/admin/rental-bookings/*` with `staff` + `super_admin` gating.
- [ ] P5.5 Rental booking documents/checklists surface (ties into ASSET_ACTION_PLAN U6).

## Recommended implementation order for this branch

- [x] R1. Create this action plan doc.
- [x] R2. Scaffold `/admin` layout/page/guard.
- [x] R3. Implement `asset` admin first because package/set management is the current bottleneck.
  - 2026-04-26: `/admin/assets` now covers detail edit, media (thumbnail + gallery), inline matches, and inline stock per inventory.
- [x] R4. Implement product + SKU editor second.
- [x] R5. Implement match editor third.
  - 2026-04-26: matches now live inline inside `/admin/assets`; standalone `/admin/matches` page removed.
- [x] R6. Implement homepage content curation for banners, link cards, and featured rails.
- [x] R7. Add image upload flow after the first forms are working.
  - 2026-04-25: media gallery upload pipeline is live for products + SKUs.
- [x] R8. Add branches + multi-inventory CRUD with audit logging.
  - 2026-04-26: see Phase 4 above.

## Notes for future sessions

- Current repo already has `app/middleware/role.ts`, but it is oriented toward B2B context roles.
- Current repo already exposes `platformRole` through `useUserProfile()`.
- Prefer extending the existing middleware pattern instead of inventing a second access model if a clean extension is possible.
- Keep the first admin screens simple and form-first; do not block on charts, KPIs, or dashboard widgets.
- `useHomeContent()` now prefers curated homepage rows, but featured product/rental rails intentionally fall back to deterministic-random live catalog items when curated rows are empty.
- Promotions/services still have a compatibility fallback via mock home cards if the homepage schema is unavailable.
