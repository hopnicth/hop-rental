# HOP-RENTAL Project Summary

Last updated: 2026-04-27
Audience: developers, operators, future Augment sessions

## Purpose

This file is the current-state snapshot.
Read this after `map.md` if you need fast context on what the system already does.

## Product snapshot

HOP-RENTAL is a Nuxt + Supabase app for:

- selling products
- booking rental assets
- customer self-service (`/user/*`)
- internal backoffice operations (`/admin/*`)

## Current architecture

- Frontend: Nuxt 4 + Vue 3 + TypeScript
- UI: `@nuxt/ui`
- Auth/data/storage: Supabase
- i18n locales: `th`, `en`, `cn`, `jp`
- State pattern: composables + refs, no Pinia/Vuex

## Current business flow

### Sale
- Browse products
- Add to cart
- Submit order from `/user/cart`
- Customer sees history in `/user/orders`
- Admin manages status from `/admin/orders`

### Rental
- Browse assets from `/product-rental`
- Open `/asset/[slug]`
- Create booking draft
- Confirm rental from `/user/cart`
- Customer sees active history in `/user/rentals`
- Cancelled bookings remain in DB and appear in `/user/orders`
- Admin manages rental operations from `/admin/orders` and `/admin/rental-bookings/[id]`

## Major completed slices

### Catalog + assets
- Product admin CRUD is live
- Asset admin CRUD is live
- Asset matching to products is live
- Multi-inventory branch stock management is live
- Homepage content admin exists and is `super_admin` only

### Booking + checkout
- Unified cart supports sale + rental review
- Asset-only bookings are supported
- Tiered rental pricing breakdown is persisted
- Shipping cost + breakdown are persisted on sale orders
- Pickup-at-branch flow is supported
- Booker name + contact phone are required for rental submit

### Admin order operations
- `/admin/orders` groups sale orders + rental bookings by customer
- QR scan supports `order:<number>`, `booking:<uuid>`, `customer:<uuid>`
- Incomplete rows are highlighted visually
- Sale orders support admin tracking updates
- Rental booking detail supports checklists + documents
- Booking docs store storage metadata for clean delete

## Key routes

### Storefront
- `/`
- `/product-{group}`
- `/product-{group}/{slug}`
- `/product-rental`
- `/asset/{slug}`

### Customer
- `/user/cart`
- `/user/orders`
- `/user/rentals`

### Admin
- `/admin/products`
- `/admin/assets`
- `/admin/branches-inventory`
- `/admin/orders`
- `/admin/orders/[id]`
- `/admin/rental-bookings/[id]`

## Important rules

- Internal admin access uses `public.users.platform_role`.
- `company_members.role` does not grant `/admin` access.
- Rental is `asset`-first; product matching is recommended, not always required.
- Booking cancellation is soft-delete.
- Booker phone/name should be preferred over account phone/name when present on a booking.
- For PostgREST `ILIKE`, use `*term*` instead of `%term%`.

## Highest-value next priorities

1. Customer-facing rental documents/history polish
2. Backoffice checklist-template management polish
3. Quotation/document workflows not yet implemented end-to-end
4. Payment/ops follow-through after order submit
5. Remove old schema fallbacks once all environments are migrated

## Read next

- `API_INDEX.md` for routes/endpoints/composables
- `ADMIN_MVP_ACTION_PLAN.md` for admin backlog
- `ASSET_ACTION_PLAN.md` for rental/asset decisions
