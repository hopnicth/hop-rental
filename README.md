# HOP-RENTAL

Last updated: 2026-04-27

HOP-RENTAL is a Nuxt-based commerce + rental platform for HOPNIC.
This single app contains storefront, customer self-service, and internal admin surfaces.

## What the app currently does

- Sale catalog + checkout flow
- Asset-first rental browsing and booking
- Unified customer cart for sale items + rental drafts
- Customer order history and rental history
- Internal admin for catalog, assets, stock, orders, and rental operations

## Quick start

### Install

```bash
npm install
```

### Required `.env`

Minimum variables:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SECRET_KEY`

Important notes:

- `SUPABASE_SECRET_KEY` must remain server-only.
- Most `/api/admin/*` write routes require that server key.
- Restart the dev server after env changes.

### Run locally

```bash
npm run dev
```

App URL: `http://localhost:3000`

### Verification commands

```bash
npm test
npm run build
```

## Main routes

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
- `/admin`
- `/admin/products`
- `/admin/assets`
- `/admin/branches-inventory`
- `/admin/orders`
- `/admin/orders/[id]`
- `/admin/rental-bookings/[id]`

## Important current rules

- Rental is now `asset`-first.
- Rental bookings are created as `draft` and confirmed from `/user/cart`.
- Booking cancellation is soft-delete via `status = 'cancelled'`.
- Booker name + phone are captured on rental submission.
- Admin order tracking info is customer-visible after admin updates it.

## Documentation

Start with `map.md`.

Then use:

- `PROJECT_SUMMARY.md` — current state snapshot
- `API_INDEX.md` — routes, endpoints, composables, debug rules
- `ADMIN_MVP_ACTION_PLAN.md` — admin backlog and status
- `ASSET_ACTION_PLAN.md` — asset/rental decisions and backlog
- `DATABASE_ADMIN_MANUAL.md` — setup rules for admin data
- `ROLE_MATRIX.md` — permission model
- `CART_BOOKING_TEST_CHECKLIST.md` — manual smoke checklist

## UI notes

- UI: `@nuxt/ui`
- Icons: Boxicons (`bx:`)
