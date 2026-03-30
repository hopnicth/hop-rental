# Augment Master Plan: Catalog / Cart / Booking / Asset Ledger

Last updated: 2026-03-15
Checkpoint commit: `fa3e63e` (`chore: checkpoint current booking and cart work`)

## Purpose

This file is the continuity anchor for Augment and the team.
It now covers the aligned target state for:

- catalog (`products`, `product_skus`)
- purchase cart (`carts`, `cart_items`)
- rental booking (`rental_bookings`)
- full rental asset ledger for future staff assignment

## Primary Goal

Build one simple, scalable system for:

- product browsing
- SKU selection
- purchase cart
- rental booking
- unified review/cart experience
- asset-aware rental operations

Guiding principles:

- easy to change
- easy to extend
- simple mental model
- long-term maintainable
- i18n-friendly
- preserve pricing inputs used for calculation
- maximize existing libs: `@nuxt/ui`, `@nuxtjs/i18n`, `@nuxtjs/supabase`

## Current State Summary

### What already exists

- Product detail page supports SKU selection via `selectedSkuIndex`
- Product gallery already switches by selected SKU album
- `ProductCard` rules were simplified and validated
- `discount` already exists in frontend types, mapper, UI, and mock data
- `/user/cart` already aggregates confirmed bookings + purchase cart in the UI
- `cart` is already DB-backed via `carts` + `cart_items`
- booking snapshot types were hardened for future DB migration

### What is still transitional

- `useProducts()` is still mock-backed
- `useBooking()` is still localStorage-backed
- there is no migration yet for `products`, `product_skus`, or `rental_bookings`
- there is no rental asset ledger schema yet
- cart DB snapshot currently stores only final `unit_price`, not explicit discount snapshot fields

### Key current mismatch

- UI already presents a unified review/cart page
- runtime persistence is still split: DB cart + local booking
- rental availability is still count-based at SKU level, not asset-aware

## Locked Decisions

1. **Supabase is the long-term source of truth** for catalog, cart, booking, and rental operations.
2. **Booking stays a separate domain/table**, never forced into `cart_items`.
3. **`/user/cart` remains the unified review hub** for purchase + rental.
4. **Multi-SKU products require explicit SKU selection** before purchase/booking.
5. **Price stays at SKU level**, not product level.
6. **Cart and booking must preserve display + pricing snapshots** so later catalog changes do not rewrite historical meaning.
7. **Sale inventory and rental asset inventory are separate concepts** even when the same SKU supports both sale and rental.
8. **Rental asset ledger is required now**, because future staff assignment depends on it.
9. **Static UI copy stays in locale JSON; catalog/business content stays in localized DB fields.**
10. **Current product/SKU image fallback is correct for launch**:
    - `SKU.images`
    - `SKU.image`
    - `Product.images`
    - `Product.thumbnail`

## Source-of-Truth Policy

### `products`

Owns:

- product identity
- product grouping / brand / category
- localized product name + description
- common specs/docs
- product-level thumbnail + album
- high-level capability flags

### `product_skus`

Owns:

- variant identity and localized label
- commercial pricing for sale
- rental pricing inputs
- commercial offer counters for sale stock
- SKU-level image override / album

### `rental_bookings`

Owns:

- booking transaction lifecycle
- user ownership
- rental period snapshot
- pricing snapshot used at confirmation time
- display snapshot shown in review/history

### `rental_assets`

Owns:

- physical rentable unit identity
- serial / asset tag / hub / condition / status
- whether the unit is rentable right now
- operational state used for reservation, pickup, return, maintenance

### `rental_asset_events`

Owns:

- immutable operational ledger of asset changes
- status/location/assignment history for auditability

## Data Policies

### Localized data policy

- Static UI labels -> `i18n/locales/*.json`
- Product/SKU/admin-managed content -> explicit columns such as `name_th`, `name_en`, `description_th`, `description_en`, `label_th`, `label_en`
- Keep explicit locale columns for launch; do not add a generic translation table yet

### Media policy

- Keep product-level and SKU-level images together in the application model
- For launch DB schema, keep pragmatic columns such as `thumbnail_url`, `image_urls`, `image_url`
- Do not duplicate product album onto every SKU row when no SKU-specific media exists
- Only normalize into `product_media` / `sku_media` later if admin/media operations become complex

### Snapshot policy

Cart snapshot must preserve:

- `product_id`, `sku_id`
- display snapshot (`name`, `thumbnail`)
- pricing snapshot (`unit_price`)
- quantity / added time

Booking snapshot must preserve:

- `product_id`, `sku_id`, `hub_id`
- display snapshot (`product_name`, `thumbnail`, `hub_name`)
- rental period snapshot (`start_date`, `end_date`, `rental_days`)
- pricing snapshot (`pricing_model`, `currency_code`, `daily_rate`, `rental_total`, `deposit_amount`)

Discount policy:

- Discount already exists in the frontend model
- For DB transition, do not lose pricing explanation data
- `cart_items` should eventually add explicit snapshot fields for `original_unit_price` and `discount_percent`
- `rental_bookings` should preserve monetary inputs, not only computed totals

Retention policy:

- guest/session buffers may expire
- abandoned cart data may be cleaned up operationally
- confirmed booking snapshots must not be TTL-deleted from primary business records

## Target Database Shape

### Catalog layer

- `products`
- `product_skus`

### Cart layer

- `carts`
- `cart_items`

### Rental commercial layer

- `rental_bookings`

### Rental asset ledger layer

- `rental_assets`
- `rental_booking_assets` (allocation bridge: booking <-> asset)
- `rental_asset_events` (immutable ledger)

### Staff-assignment-ready operations layer

- `rental_tasks` (prepare / pickup / return / inspect / maintain)
- `rental_task_assignees` (task <-> staff user mapping)

## Availability Model

### Before asset ledger migration completes

- listing/detail may still show SKU-level rental availability counters
- booking confirmation must re-check availability before persisting

### Final target

- `product_skus.stock.available` is no longer the final authority for rental fulfillment
- actual rentable capacity comes from `rental_assets` filtered by status + hub + allocation window
- `rental_bookings` is the commercial promise
- `rental_booking_assets` is the operational allocation of actual units

## Hybrid Sale + Rental Rule

If one SKU supports both sale and rental:

- keep one commercial SKU
- keep sale stock counters at SKU level
- keep rental asset pool separately in `rental_assets`
- do not auto-share the same counter between sale and rental
- if business later wants to convert units between pools, handle it as an explicit admin operation

## End-to-End Flow Target

1. User browses product -> selects SKU if needed
2. Sale action -> add snapshot to `cart_items`
3. Rental action -> create `rental_bookings` row with pricing/display snapshot
4. `/user/cart` aggregates `cart_items` + confirmed `rental_bookings`
5. Operations/admin allocate physical units in `rental_booking_assets`
6. Asset movements and state changes are written to `rental_asset_events`
7. Staff work can later be assigned through `rental_tasks` + `rental_task_assignees`

## Implementation Order

### Phase 1 — Close the current architecture gaps first

- add missing DB schema for `products`, `product_skus`, `rental_bookings`
- extend cart snapshot schema to retain discount explanation fields
- keep current image/localized strategy compatible with current mapper

### Phase 2 — Move runtime onto DB-backed booking

- migrate `useBooking()` from localStorage to Supabase
- keep `/user/cart` aggregator UI, but read bookings from DB
- preserve current confirmed-only cart/review behavior

### Phase 3 — Add full rental asset ledger

- add `rental_assets`
- add `rental_booking_assets`
- add `rental_asset_events`
- define operational statuses and allocation rules per hub

### Phase 4 — Make operations staff-ready

- add `rental_tasks`
- add `rental_task_assignees`
- connect booking + asset lifecycle to staff work queues

### Phase 5 — Hardening

- generate Supabase DB types
- add regression tests for cart/booking snapshot mapping
- add mixed sale+rental smoke validation
- clean up remaining warnings and consistency issues

## What Is Already Done vs Not Done

### Already done

- SKU selection policy
- `ProductCard` behavior policy
- SKU image album switching
- booking/cart review UX alignment in UI
- source-of-truth comments in type layer
- booking/cart snapshot type hardening
- frontend discount model and display

### Not done yet

- DB schema for catalog
- DB schema for rental bookings
- DB schema for rental assets / allocations / events
- DB-backed booking runtime
- cart DB discount snapshot expansion
- staff assignment tables

## Immediate Next Implementation Slice

Build the backend foundation in this order:

1. add `products` + `product_skus` migration
2. add `rental_bookings` migration
3. extend `cart_items` snapshot columns for discount retention
4. add `rental_assets` + `rental_booking_assets` + `rental_asset_events`
5. migrate `useBooking()` to Supabase

## Files Most Relevant Right Now

- `AUGMENT_MASTERPLAN.md`
- `app/types/product.ts`
- `app/types/catalog.ts`
- `app/types/cart.ts`
- `app/types/booking.ts`
- `app/types/rental-booking.ts`
- `app/composables/useCart.ts`
- `app/composables/useBooking.ts`
- `app/pages/product-[group]/[id].vue`
- `app/pages/user/cart.vue`
- `supabase/migrations/003_cart_schema.sql`

## Continuation Rule for Future Augment Sessions

If the project is still unfinished:

1. Read this file first.
2. Preserve the locked decisions above unless the user explicitly changes them.
3. Do not treat localStorage booking as the final architecture.
4. Keep the unified `/user/cart` UX while separating commercial and operational tables.
5. Do not collapse rental assets into sale stock counters.
6. Do not remove pricing snapshot data that explains how money was calculated.
