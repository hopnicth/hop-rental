# Augment Master Plan: Catalog / Cart / Booking MVP + Ops Minimum

Last updated: 2026-04-21
Checkpoint commit: `34bcf5e` (`feat: improve storefront search and mobile filters`)

## Purpose

This file is the continuity anchor for Augment and the team.
It now covers the aligned target state for the minimum market-test release first, then the longer-term operations layer.

Current priority scope:

- catalog (`products`, `product_skus`)
- purchase cart (`carts`, `cart_items`)
- rental booking (`rental_bookings`)
- quotation + document workflows
- baseline user/account flows
- minimum backoffice operations needed to actually run the business

## Primary Goal

Build the minimum viable online commerce and rental system that can be used to test the market fast.

MVP success means the business can:

- receive online orders
- receive rental bookings
- let users browse with simple search, basic filters, and category/group navigation
- generate quotation documents
- generate withholding-tax document templates for customers, receive signed uploads back, and review/import them
- provide complete-enough baseline user functions
- support minimum backoffice operations for alerts, docs, and delivery/return paperwork

Guiding principles:

- ship the minimum that can sell before building full operations sophistication
- easy to change
- easy to extend
- simple mental model
- long-term maintainable
- i18n-friendly
- preserve pricing inputs used for calculation
- maximize existing libs: `@nuxt/ui`, `@nuxtjs/i18n`, `@nuxtjs/supabase`

## MVP Launch Scope

### Storefront minimum required for market test

1. accept online orders end-to-end
2. accept rental bookings end-to-end
3. support simple search + basic filters + category/group browse
4. generate quotation documents
5. support withholding-tax document generation -> customer print/sign -> upload back -> staff review/import
6. provide baseline user/account functionality needed for real customer use

### Backoffice minimum required for market test

- booking report/list view
- LINE alerts for booking activity
- asset document storage
- inspection / maintenance reminder workflow
- order and booking alerts
- delivery note / return note workflow

## Current State Summary

### What already exists

- Product detail page supports SKU selection via `selectedSkuIndex`
- Product gallery already switches by selected SKU album
- `ProductCard` rules were simplified and validated
- `discount` already exists in frontend types, mapper, UI, and mock data
- `/user/cart` now acts as the unified review hub for purchase cart items + rental draft bookings
- `cart` is already DB-backed via `carts` + `cart_items`
- booking snapshot types were hardened and now map to DB-backed `rental_bookings`
- `useBooking()` now hydrates from Supabase and migrates legacy localStorage rows once per user
- `useProducts()` now reads Supabase-backed catalog data with fallback safety
- product listing/detail storefront flow now reads the DB-backed catalog path
- storefront search/filter UI now has real client-side sorting, filtering, pagination, and mobile filter access
- minimum sale order submission now writes `orders` + `order_items` from `/user/cart`
- `/user/orders` now shows a created-order success state and basic customer-visible order history/status badges
- `/user/rentals` now gives customers a booking history page with totals, hub display, status badges, and a submitted-success state after rental checkout
- the storefront rental flow now stages bookings as `draft`, requires hub selection in cart, and confirms them from `/user/cart`
- `useBooking()` now includes schema-fallback handling for pre-`013` environments where newer `rental_bookings` columns are still missing
- auth/profile/address/company-context flows now support the current checkout path well enough to continue MVP closure
- dev/runtime route noise was cleaned up enough to continue backend work without major warning spam
- migration `004_catalog_booking_asset_ledger.sql` already added `products`, `product_skus`, `rental_bookings`, asset-ledger tables, and cart discount snapshot columns
- migration `005_seed_minimal_rental_catalog.sql` already seeds a bridge catalog for DB-backed booking references
- migration `007_orders_schema.sql` already added the minimum order tables for sale checkout and quotation-mode persistence
- migration `009_split_order_status_dimensions.sql` already split order, payment, and fulfillment statuses for clearer customer/staff visibility

### What is still transitional

- online order acceptance now exists for sale items, but payment completion, customer instructions, and staff/backoffice handling are still not fully closed
- rental booking submit/confirmation now works through the unified cart, but manual smoke coverage, staff/backoffice handling, and document follow-through are still not fully closed
- simple search/filter/category browse is much more real now, but route-aware group behavior and keyword search still need to be finalized as a clear MVP feature
- quotation request can now persist as `checkout_mode = quotation`, but actual quotation document generation is not finished
- withholding-tax document generation, signed upload return, and review/import flow are not finished
- baseline user/account functions are partially real now, but several account/document/business workflow sections are still not complete enough to call done
- backoffice MVP features (booking reports, LINE alerts, asset docs, maintenance reminders, order/booking alerts, delivery/return docs) are not finished
- rental availability is still enforced from SKU-level counters, not asset allocation rows
- asset ledger schema exists, but full operational allocation/staff tooling is intentionally deferred behind MVP unless required
- Supabase DB types and automated regression tests have not been added yet

### Key current mismatch

- the technical foundation is moving faster than the sellable/document/business-operating workflows
- sale-order and baseline rental-acceptance flows now exist, but document workflows and staff/ops handling are still the main MVP gap
- rental availability is still count-based at SKU level, which is acceptable for MVP but not the final operating model

## Urgent Fix Plan From Storefront Audit

The current storefront audit shows the MVP gap is not the catalog foundation anymore; it is the missing acceptance and document workflows that turn browsing into real business.

### Highest urgency gaps found in the audit

1. **Sale orders are now minimally submit-ready, but not operationally closed**
   - `orders` + `order_items` persistence exists, and customers can reach a basic order-history page, but payment follow-through and staff/backoffice handling still need to be locked.
2. **Bookings persist and are visible, but the operating acceptance flow is still incomplete**
   - `rental_bookings` persistence exists, and the minimum `draft -> confirmed` submit path now works from `/user/cart`, but staff-facing handling, alerts, and document workflows still need to be locked.
3. **Search/filter/category browsing is only partially real**
   - the catalog source is DB-backed, and client-side filters now work, but route/group behavior and keyword search are not yet aligned to the intended MVP browse model.
4. **Quotation and withholding-tax flows are not operational yet**
   - quotation requests can now persist in order mode, but quotation document generation and the withholding-tax print/sign/upload-back/review flow are still missing.
5. **Account is only partially launch-ready**
   - profile/address basics exist, and order/booking visibility now exists at a minimum level, but document visibility and several sections are still placeholder-level.

### Urgent fix sequence

1. **Close minimum rental booking acceptance**
   - define the booking statuses required for MVP operation
   - connect the current confirmed booking/cart UX to a real submit/confirmation path the business will actually operate
   - keep booking submit/review flow simple and staff-usable
   - add post-submit confirmation, reference visibility, and minimum customer/staff visibility
2. **Harden minimum online order acceptance**
   - keep the existing `/user/cart` -> `orders` submit path as the launch baseline
   - lock minimum payment instructions / pending states / customer messaging
   - make the submitted order visible to staff/backoffice in a usable minimum way
3. **Make browse/search/filter behavior real enough to sell**
   - wire route group/category behavior to actual product filtering
   - add simple keyword search
   - add basic sale/rental filter forms that affect real results
4. **Ship the minimum document workflows required for revenue**
   - generate quotation documents from current order/cart/booking context
   - generate withholding-tax template documents
   - support customer print -> sign -> upload-back
   - support minimum staff review/import workflow
5. **Reduce account to the minimum real customer baseline**
   - keep auth/profile/address flows working
   - expose minimum order/booking/document status visibility
   - defer or hide placeholder sections that are not launch-critical

### Rental clarification for the next implementation slice

What rental already has:

- `addBooking()` now writes rental bookings as `draft` rows to `rental_bookings`
- `/user/cart` shows rental draft bookings together with the sale cart and requires hub selection before submit
- `/user/cart` can now change rental bookings from `draft -> confirmed`
- `/user/rentals` now gives customers a booking list/history view plus a submitted-success state
- the booking write path includes schema fallback so older DBs without the newer rental-access columns still remain usable

What rental still needs before MVP can be called done:

- full manual smoke/regression coverage of the new rental flow
- a minimum staff-facing queue/report or alert path for new bookings
- alignment between booking status, quotation/document needs, and the actual review flow
- a locked answer on whether MVP booking acceptance happens directly, via staff review, or via quotation-first handling

### Explicit defers after the urgent fix plan

- full asset-aware allocation runtime
- richer staff-assignment workflow
- full operational polish beyond MVP acceptance

## Locked Decisions

1. **Supabase is the long-term source of truth** for catalog, cart, booking, documents, and rental operations.
2. **Booking stays a separate domain/table**, never forced into `cart_items`.
3. **`/user/cart` remains the unified review hub** for purchase + rental.
4. **MVP-first beats full sophistication**: if a simpler workflow lets the team test the market sooner, prefer that first.
5. **Multi-SKU products require explicit SKU selection** before purchase/booking.
6. **Price stays at SKU level**, not product level.
7. **Cart and booking must preserve display + pricing snapshots** so later catalog changes do not rewrite historical meaning.
8. **Sale inventory and rental asset inventory are separate concepts** even when the same SKU supports both sale and rental.
9. **Rental asset ledger remains the long-term direction**, but full asset-aware allocation and staff assignment are not blockers for the MVP launch unless the business workflow proves otherwise.
10. **Quotation and withholding-tax document flows are required launch workflows** for the MVP, not optional polish.
11. **Static UI copy stays in locale JSON; catalog/business content stays in localized DB fields.**
12. **Current product/SKU image fallback is correct for launch**:
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
2. Sale action -> add snapshot to `cart_items`, then submit from `/user/cart` into `orders` + `order_items`
3. Rental action -> create/confirm `rental_bookings` rows with pricing/display snapshot, then move through the minimum MVP acceptance path
4. `/user/cart` aggregates `cart_items` + confirmed `rental_bookings`
5. `/user/orders` and `/user/rentals` provide the minimum customer-visible history/reference baseline
6. User/staff can generate quotation documents when needed
7. Withholding-tax document template can be generated, printed/signed by the customer, uploaded back, and reviewed/imported by staff
8. Backoffice receives alerts and can produce delivery/return paperwork
9. Asset allocation and staff assignment remain the next operations layer after MVP unless urgently needed earlier

## Implementation Order

### Phase 1 — Stabilize the MVP technical base (completed enough to move on)

- added DB schema for `products`, `product_skus`, and `rental_bookings`
- extended cart snapshot schema to retain discount explanation fields
- migrated `useBooking()` from localStorage to Supabase with one-time legacy migration
- moved `useProducts()` onto the DB-backed catalog path for the current storefront flow
- cleaned the main runtime route warnings enough to continue feature work efficiently

### Phase 2 — Close the remaining market-test storefront MVP gaps (current priority)

- keep and harden the current sale order submission + order-history baseline from `/user/cart`
- define and ship a minimum rental booking acceptance flow with usable post-submit UX
- complete simple search + basic filters + category/group navigation with real result changes
- complete baseline auth/profile/address/account visibility needed for real usage

### Phase 3 — Close the market-test document workflows

- generate quotation documents
- generate withholding-tax document templates
- support customer print/sign/upload-back flow
- support staff review/import of uploaded signed documents
- generate delivery note / return note documents

### Phase 4 — Close the market-test backoffice minimum

- booking list/report view
- LINE alerts for booking activity
- order and booking alerts
- asset document storage
- inspection / maintenance reminders

### Phase 5 — Post-market hardening + full operations

- generate real Supabase DB types
- add regression tests for cart/booking snapshot mapping
- add mixed sale+rental smoke validation
- implement asset-aware allocation runtime on top of the ledger tables
- add staff assignment tables / queues
- clean up remaining warnings, consistency issues, and scaling gaps

## What Is Already Done vs Not Done

### Already done

- SKU selection policy
- `ProductCard` behavior policy
- SKU image album switching
- booking/cart review UX alignment in UI
- source-of-truth comments in type layer
- booking/cart snapshot type hardening
- frontend discount model and display
- DB schema for catalog + rental bookings + rental asset ledger
- cart DB discount snapshot expansion
- DB-backed booking runtime with legacy localStorage migration
- DB-backed catalog runtime for the current storefront flow
- minimum sale order schema + submit runtime (`orders`, `order_items`)
- order status split into lifecycle / payment / fulfillment dimensions
- basic order success state + order history page
- basic rental history/visibility page
- current checkout-supporting auth/profile/address/company-context path
- real client-side search/filter UI, sorting, pagination, and mobile filter access
- product listing/detail pages reading the Supabase-backed catalog path
- minimal seeded catalog bridge for current booking flow
- runtime warning cleanup needed to keep MVP work moving

### Not done yet

- full online order acceptance flow after submit, especially payment completion, staff handling, and operational follow-through
- rental booking acceptance lifecycle from unified cart submit through confirmation/reference/staff visibility
- keyword search + route-aware category/group browse finalized as MVP behavior
- quotation document generation from persisted order/booking context
- withholding-tax document template + signed upload + review/import workflow
- baseline user/account functions required for launch, especially document visibility and removal of placeholder-only sections
- booking reports / LINE alerts / order-booking alerts
- asset document storage
- inspection / maintenance reminder workflow
- delivery note / return note workflow
- asset allocation runtime and operational UI on top of the ledger tables
- staff assignment tables
- generated Supabase DB types
- automated regression tests for cart/booking mapping and mixed flow validation

## Immediate Next Implementation Slice

Ship the minimum market-test release in this order:

1. define and ship the minimum rental booking acceptance flow from the current `/user/cart` + `/user/rentals` baseline
2. harden sale order acceptance after submit: payment messaging, minimum staff visibility, and customer follow-through
3. finish real keyword search + basic filters + route-aware category/group navigation
4. ship quotation document generation
5. ship withholding-tax document generation + signed upload-back + review/import flow
6. complete baseline user/account functions required for real customer use
7. deliver the minimum backoffice layer: booking list/report, LINE alerts, order/booking alerts, asset docs, maintenance reminders, and delivery/return documents
8. only after MVP is stable, move availability from SKU counters toward asset-aware allocation and add full staff-assignment operations

## Files Most Relevant Right Now

- `AUGMENT_MASTERPLAN.md`
- `CART_BOOKING_TEST_CHECKLIST.md`
- `app/types/product.ts`
- `app/types/catalog.ts`
- `app/types/cart.ts`
- `app/types/booking.ts`
- `app/types/rental-booking.ts`
- `app/mappers/catalog.ts`
- `app/composables/useCart.ts`
- `app/composables/useBooking.ts`
- `app/composables/useOrders.ts`
- `app/composables/useProducts.ts`
- `app/mock/catalog-products.ts`
- `app/mock/products.ts`
- `app/pages/product-[group]/[id].vue`
- `app/pages/product-[group]/index.vue`
- `app/pages/user/cart.vue`
- `app/pages/user/orders.vue`
- `app/pages/user/rentals.vue`
- `supabase/migrations/003_cart_schema.sql`
- `supabase/migrations/004_catalog_booking_asset_ledger.sql`
- `supabase/migrations/005_seed_minimal_rental_catalog.sql`
- `supabase/migrations/007_orders_schema.sql`
- `supabase/migrations/009_split_order_status_dimensions.sql`

## Continuation Rule for Future Augment Sessions

If the project is still unfinished:

1. Read this file first.
2. Preserve the locked decisions above unless the user explicitly changes them.
3. Do not regress booking persistence back to localStorage-only, and do not treat mock-backed catalog reads as the final architecture.
4. Keep the unified `/user/cart` UX while separating commercial and operational tables.
5. Do not collapse rental assets into sale stock counters.
6. Do not remove pricing snapshot data that explains how money was calculated.
7. Do not regress the current minimum sale order submission/history path while working on rental acceptance next.
8. When choosing between full ops sophistication and faster market validation, prefer the smaller MVP slice unless the user explicitly says otherwise.
