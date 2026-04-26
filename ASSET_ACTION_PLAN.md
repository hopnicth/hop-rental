# Asset Action Plan

Last updated: 2026-04-26
Owner: Augment continuity doc for future sessions
Status legend: `[ ]` not started, `[/]` in progress, `[x]` done, `[-]` dropped

## Purpose

This file is the continuity + todo plan for the new `asset` direction.
Future Augment sessions should read this file before changing rental schema/UI.

## How to update this file

1. When a decision is accepted, mark it `[x]`.
2. When implementation starts, change the task to `[/]`.
3. When implementation is complete and verified, change it to `[x]`.
4. Add a short note under the task if scope changed.
5. Keep this file aligned with `AUGMENT_MASTERPLAN.md`.

## Locked decisions

- [x] D1. Add a public-facing `asset` layer instead of exposing raw `rental_assets` directly.
- [x] D2. Matching is admin-managed, not automatic spec/fuzzy matching.
- [x] D3. Matching is at `product` level only for this phase. Do not block on SKU-level matching.
- [x] D4. `rental_bookings` should gain `asset_id` now.
- [x] D5. Product detail should show a rental list frame inline under the product instead of owning the booking flow directly.
- [x] D6. Reuse the existing `/product-rental` route shell, but change its data source from product catalog to asset catalog.
- [x] D7. Asset schema must include backoffice-ready service/doc/checklist support from the start.

## What this means in practice

- Product catalog remains the main sale catalog.
- Rental catalog becomes a separate public-facing layer.
- Product page shows related asset cards.
- Booking should move toward `asset` as the commercial root.
- Raw `rental_assets` remain operational/allocation layer, not the public browsing root.

## Non-goals for this phase

- [x] N1. Do not implement automatic spec matching logic.
- [x] N2. Do not redesign the whole asset ledger first.
- [x] N3. Do not require SKU-level matching before shipping the first asset flow.

## Recommended schema direction

## Approved schema v1 to implement

This section is the locked implementation summary for the first real schema migration.
Future Augment sessions should treat this as the approved baseline unless the user explicitly changes it.

### Why this schema exists

- Separate the public rental catalog from the sale product catalog.
- Keep admin-managed product matching simple and explicit.
- Move commercial rental booking root toward `asset`.
- Preserve booking meaning over time with asset snapshots.
- Add enough service/doc/checklist structure now so rental backoffice work is not blocked later.

### Tables to create in v1

- [x] V1.1 `assets`
  - Public/commercial rental catalog root.
  - Includes localized content, media, pricing, rental rules, transitional rental counters, storage location, and service cycle summary fields.

- [x] V1.2 `asset_matches`
  - Admin-managed relation from `assets` to `products`.
  - Product-level matching only in this phase.

- [x] V1.3 `asset_documents`
  - Asset-level document metadata.
  - Supports public docs, customer-visible docs after rental, and internal docs.

- [x] V1.4 `asset_service_events`
  - Service date list + service detail history.
  - Supports cost, vendor/actor, next due date, and optional attachment linkage via documents.

- [x] V1.5 `asset_checklist_templates`
  - Reusable admin-created checklist templates.

- [x] V1.6 `asset_checklist_template_items`
  - Checklist items/rows under each template.

- [x] V1.7 `rental_booking_checklists`
  - Booking-linked checklist instance for pickup/return/inspection/service workflows.

- [x] V1.8 `rental_booking_checklist_items`
  - Staff tick/remark rows for actual checklist execution.

- [x] V1.9 `rental_booking_documents`
  - Booking-specific docs such as repair docs, fine docs, damage evidence, and internal service outcome attachments.

### Existing table changes in v1

- [x] V1.10 Alter `rental_bookings`
  - Add `asset_id`.
  - Add access snapshot columns for history/analytics.
  - Keep existing product/sku fields during transition for compatibility.

### Booking snapshot rule approved for v1

- [x] V1.11 `rental_bookings` keeps an access-first snapshot.
  - Required direction:
    - `asset_id`
    - `asset_code`
    - `asset_slug`
    - `asset_name`
    - `asset_thumbnail`
    - `asset_snapshot JSONB`
    - `matched_product_id`
    - `matched_product_name`
  - Purpose:
    - preserve what the customer booked at that moment
    - support analytics even if access content changes later
    - preserve attribution from product -> asset

### Explicit defers after schema v1

- [x] V1.12 Do not make SKU-level matching part of this migration.
- [x] V1.13 Do not redesign `rental_assets` as the public browsing root in this migration.
- [x] V1.14 Do not implement auto spec matching logic in this migration.

### Core new tables

- [x] S1. `assets`
  - Public rental item shown on `/product-rental` and under product detail.
  - Should include localized name/description, slug, thumbnail, image list, pricing, rental rules, and active/hidden flags.
  - 2026-04-21: implemented in `supabase/migrations/013_asset_schema.sql`.

- [x] S2. `asset_matches`
  - Admin-managed relation from `assets` -> `products`.
  - Minimum columns: `asset_id`, `product_id`, `match_type`, `sort_order`, `note`, timestamps.
  - 2026-04-21: implemented in `supabase/migrations/013_asset_schema.sql`.

- [x] S3. `rental_bookings.asset_id`
  - Add nullable-first, then make required once the new flow is live.
  - Keep product snapshot fields for history readability during transition.
  - 2026-04-21: implemented with asset snapshot + matched product attribution in `013_asset_schema.sql`.

### Backoffice-ready rental support

- [x] S4. `asset_documents`
  - Document storage metadata per asset.
  - Must support `visibility = customer | internal`.
  - Must support customer-loadable docs after rental, plus internal repair/fine docs.
  - 2026-04-21: implemented with `public | customer_after_booking | internal` visibility modes.

- [x] S5. `asset_service_events`
  - Service date list + service detail history.
  - Fields should support event date, detail, actor/vendor, cost, note, attachments.
  - 2026-04-21: implemented in `013_asset_schema.sql`.

- [x] S6. Service cycle fields on `assets`
  - Minimum: cycle value/unit or days, last service date, next due date.
  - 2026-04-21: implemented on `public.assets`.

- [x] S7. Storage location on `assets`
  - Minimum MVP can be a simple text/code field.
  - Expand later if warehouse/location modeling becomes more complex.
  - 2026-04-21: implemented as `storage_location_code` + `storage_location_note`.

- [x] S8. `asset_checklist_templates`
  - Admin creates reusable checklist templates for receive/return/inspection work.
  - 2026-04-21: implemented in `013_asset_schema.sql`.

- [x] S9. `asset_checklist_template_items`
  - Checklist rows/items under each template.
  - 2026-04-21: implemented in `013_asset_schema.sql`.

- [x] S10. `rental_booking_checklists`
  - Checklist instance attached to a booking or operational handoff.
  - 2026-04-21: implemented in `013_asset_schema.sql`.

- [x] S11. `rental_booking_checklist_items`
  - Staff tick/remark status per checklist item during receive/return flow.
  - 2026-04-21: implemented in `013_asset_schema.sql`.

- [x] S12. `rental_booking_documents`
  - Booking-specific documents for repair, fine, handover, and damage evidence workflows.
  - 2026-04-21: implemented in `013_asset_schema.sql`.

## UI / flow direction

- [x] U1. Replace the meaning of `/product-rental`
  - Keep route shell.
  - Switch listing data source to `assets`.
  - Replace `ProductCard` usage with `AssetCard`.
  - 2026-04-21: listing now renders asset cards from `useAssets()`.

- [x] U2. Product detail: add `Asset List` frame under the product
  - Load related asset rows from `asset_matches`.
  - Show cards inline without requiring a separate detail page first.
  - 2026-04-21: product detail now shows related asset cards under the main product content.

- [/] U3. Product detail: remove direct booking ownership
  - Existing product-level `Book Now` should stop being the primary booking trigger.
  - Product page becomes discovery + handoff to asset.
  - 2026-04-21: when matched assets exist, product detail now hands off to the asset list; the legacy inline booking form remains only as a fallback when no asset match exists.

- [x] U4. Asset booking CTA
  - Clicking an asset card should open the booking flow for that asset.
  - MVP can use inline card expansion, modal, drawer, or dedicated detail later.
  - 2026-04-21: cards navigate to the dedicated `/asset/[slug]` detail page where booking starts.

- [ ] U5. Customer docs in rental UI
  - If the user has a relevant rental/booking state, customer-facing docs should be loadable from asset flow/history.

- [ ] U6. Backoffice checklist/doc workflow UI
  - Separate admin/staff UI later; schema should not block it.

## Migration sequence

- [x] M1. Add schema first without breaking current product booking flow.
  - 2026-04-21: `013_asset_schema.sql` added new asset tables and nullable-first booking fields.
- [x] M2. Add typed models/composables/mappers for `asset`.
  - 2026-04-21: `useAssets`, asset types, and card/detail rendering are now wired into the storefront.
- [x] M3. Convert `/product-rental` listing to asset catalog.
  - 2026-04-21: `/product-rental` now browses asset entries instead of raw product cards.
- [x] M4. Add inline rental list under product detail.
  - 2026-04-21: related asset cards now appear on product detail when matches exist.
- [/] M5. Move booking submit path to use `asset_id`.
  - 2026-04-21: asset booking submits now send asset snapshot fields and use `asset_id` when it is a valid UUID; legacy-schema fallback keeps older DBs working.
- [ ] M6. Retire product-owned booking UI after new flow is verified.

## Current known code areas to change

- `AUGMENT_MASTERPLAN.md`
- `app/pages/product-[group]/index.vue`
- `app/pages/product-[group]/[id].vue`
- `app/components/products/ProductInfo.vue`
- `app/components/products/RentalBookingForm.vue`
- `app/composables/useBooking.ts`
- `app/composables/useProducts.ts`
- `app/mappers/catalog.ts`
- `supabase/migrations/004_catalog_booking_asset_ledger.sql`
- `supabase/migrations/013_asset_schema.sql`

## Immediate next implementation slice

- [x] I1. Finalize schema v1 for `assets`, `asset_matches`, docs, service, and checklist tables.
  - 2026-04-21: approved to implement.
- [x] I2. Decide exact booking snapshot fields that must be copied from asset into `rental_bookings`.
  - 2026-04-21: access snapshot + matched product attribution approved.
- [x] I3. Decide whether MVP booking entry opens as inline panel, modal, or drawer from the asset card.
  - 2026-04-21: MVP uses a dedicated asset detail page as the booking entry surface.
- [x] I4. Add the first migration for schema v1.
  - 2026-04-21: `supabase/migrations/013_asset_schema.sql` created.

## Latest implementation notes

- 2026-04-26: asset tag input uses the shared `catalog_terms` dictionary via migration `027_assets_catalog_terms_sync.sql` (AFTER INSERT/UPDATE trigger `assets_after_sync_catalog_terms_trg` mirrors the products one). `/admin/assets` now uses `AdminCommaSuggestInput` for `tag_keys` with autocomplete fed from `/api/admin/products/suggestions` (which reads central `catalog_terms`) plus active main categories. The previous comma-separated free-text input is gone; the form stores `tagKeys` as `string[]` directly.
- 2026-04-26: assets now carry `main_category_key` + `tag_keys` (mirroring products) via migration `026_assets_main_category_and_tags.sql`. A `BEFORE INSERT/UPDATE` trigger derives `category_keys` from `main_category_key` + `tag_keys` so the storefront URL pattern (`/product-{category_keys[0]}/{slug}`) stays consistent. `/admin/assets` exposes a `Main category` `USelectMenu` (sourced from `/api/admin/main-categories`) in place of the previous free-text `Category keys` field. Server util `server/utils/admin-asset.ts` accepts `mainCategoryKey` + `tagKeys` and returns them on list and detail.
- 2026-04-26: rental_access domain renamed to `asset` end-to-end (DB → API → UI) via migration `025_rename_rental_access_to_assets.sql`. All `/admin/rental-accesses/*` and `/admin/matches/*` routes/endpoints removed; canonical surface is now `/admin/assets` and `/api/admin/assets/*`.
- 2026-04-26: `/admin/assets` is now a full CRUD with three integrated panels: detail form, **inline product matches** (`asset_matches`), and **stock per inventory** (`sku_branch_inventory` for the matched products). Standalone `/admin/matches` page removed.
- 2026-04-26: `/admin/assets` ships a media block with two upload surfaces:
  - Thumbnail card (single-image, target=`thumbnail`)
  - `AdminMediaGalleryManager` (multi-image, target=`gallery`) with "Set as cover" / "Delete" actions per existing image.
- 2026-04-26: thumbnail ↔ gallery sync hardened — `thumbnail_url` is now always kept consistent with `image_urls[0]`:
  - Server `POST /api/admin/assets/:id/media` honors a new `setAsCover=true` form field (sent for the first queued upload). When set, the new image is prepended to `image_urls` AND `thumbnail_url` is overwritten unconditionally.
  - Server `target=thumbnail` uploads also prepend the URL to `image_urls` if missing, so the gallery cover badge always reflects the listing thumbnail.
  - Client `setGalleryAsThumbnail()` reorders `imageUrls` so the chosen URL becomes index 0 and patches `thumbnail_url` in the same request.
  - Client `removeGalleryImage()` clears/replaces `thumbnail_url` when the removed image was the current thumbnail.
- 2026-04-21: added `supabase/migrations/013_asset_schema.sql`.
- 2026-04-21: booking lifecycle now stages rental items as `draft` in cart, then changes them to `confirmed` from `/user/cart` after hub selection.
- 2026-04-21: `useBooking` now retries with a legacy payload when newer `rental_bookings` columns are missing from the Supabase schema cache.
- 2026-04-21: rental booking insert sanitizes `asset_id` and only sends it when it is a valid UUID.
- 2026-04-21: cart badge now counts purchase quantities together with rental draft bookings.
- 2026-04-21: product cards now open in the same tab; local route check for `/product-measuring_tools/bosch-laser-level-gll-3-80` returned HTTP 200 while the dev server was running.
- Validation note:
  - IDE diagnostics for `013_asset_schema.sql` returned no issues.
  - `supabase db lint` could not run to completion because the local Postgres instance was not running (`127.0.0.1:54322 connection refused`).

## Next session focus

The catalog/inventory side has been rebuilt and is documented in `PROJECT_SUMMARY.md`, `ADMIN_MVP_ACTION_PLAN.md` (Phase 4), `DATABASE_ADMIN_MANUAL.md`, and `API_INDEX.md`. The next slice resumes here.

Priority order for the next asset slice:

1. **U3** — finish removing product-owned booking ownership; the legacy inline booking form should retire once U2 + access list are confirmed reliable.
2. **M5** — finalize the `asset_id`-driven booking submit path and remove the legacy-schema fallback once all environments are migrated to `013`.
3. **M6** — retire the product-owned booking UI after U3 + M5 land.
4. **U5** — surface customer-facing docs (`asset_documents` with `visibility` modes) inside the rental UI / booking history.
5. **U6** — start the backoffice checklist + doc workflow UI on top of the existing schema (`asset_checklist_templates`, `rental_booking_checklists`, `rental_booking_documents`).

Cross-references to keep aligned while doing this:

- `app/composables/useBooking.ts` — booking submit path
- `app/pages/product-[group]/[id].vue` — product-detail handoff to asset
- `app/pages/asset/[slug].vue` — asset detail + booking entry
- `app/components/products/RentalBookingForm.vue` — legacy fallback path scheduled for removal

## Continuation rule for future Augment sessions

1. Read this file first.
2. Preserve the locked decisions unless the user explicitly changes them.
3. Update checkbox status here when a case is started or closed.
4. If schema changes land, update `AUGMENT_MASTERPLAN.md` to stay consistent.
5. Do not reintroduce auto-matching logic unless the user explicitly asks for it.
