# Asset Action Plan

Last updated: 2026-04-28
Owner: continuity doc for future sessions
Status legend: `[ ]` not started, `[/]` in progress, `[x]` done, `[-]` dropped

## Purpose

Track the approved direction for the `asset` rental model.
Use this for asset/rental decisions and next steps.

## Locked decisions

- [x] Public rental browsing uses `assets`, not raw operational asset rows.
- [x] `asset_matches` are explicit admin-managed links.
- [x] Product matching is product-level for MVP.
- [x] Rental bookings can root on `asset_id`.
- [x] An asset may represent a single item, package, or set.
- [x] Backoffice-ready docs/checklists belong in the schema from the start.

## Implemented state (summary)

All initial asset/rental scope is shipped; one-line summaries below.

- [x] **Data model** — `assets`, `asset_matches`, `asset_documents`, `asset_service_events`, asset checklist templates + items, `rental_booking_checklists` + items, `rental_booking_documents`
- [x] **Storefront flow** — `/product-rental` asset catalog, matched assets on product detail, `/asset/[slug]` booking entry, asset-only booking, tiered rental pricing, booker name + phone capture
- [x] **Admin flow** — `/admin/assets` CRUD with inline matches, asset media, asset detail blocks, rental booking docs/checklists on `/admin/rental-bookings/[id]`

## Business rules to preserve

- Assets are the commercial rental layer.
- `asset_matches` improve product discoverability but are not always required for booking.
- Asset booking should still work when no matched product exists, as long as the schema supports asset-only booking.
- Asset code/slug/name snapshots matter because booking history must remain readable.
- Booker contact on the booking is operationally more important than account phone when staff need to call about a specific booking.

## Remaining backlog

### Customer-facing rental docs/history

- [ ] Surface relevant customer-visible rental documents in customer history pages

### Template/ops management polish

- [ ] Add or refine checklist-template management if operations needs direct editing UI
- [ ] Add more operational document/report views if requested

### Cleanup

- [ ] Remove legacy schema fallback from booking code once all environments are on current migrations
- [ ] Continue reducing old terminology or obsolete `rental_access` references if any remain

## Key migrations

- `013_asset_schema.sql`
- `025_rename_rental_access_to_assets.sql`
- `026_assets_main_category_and_tags.sql`
- `027_assets_catalog_terms_sync.sql`
- `028_assets_detail_blocks.sql`
- `031_rental_bookings_asset_only.sql`
- `033_rental_booking_docs_storage.sql`

## Key code areas

- `app/composables/useAssets.ts`
- `app/pages/asset/[slug].vue`
- `app/components/products/RentalBookingForm.vue`
- `app/composables/useBooking.ts`
- `app/pages/admin/assets/index.vue`
- `server/utils/admin-bookings-ops.ts`
- `server/api/admin/rental-bookings/*`

## Cross refs

- `map.md`
- `PROJECT_SUMMARY.md`
- `API_INDEX.md`
- `ADMIN_MVP_ACTION_PLAN.md`
