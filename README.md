# HOP-RENTAL

Last updated: 2026-05-08

HOP-RENTAL is a Nuxt-based commerce + rental platform for HOPNIC.
This single app contains storefront, customer self-service, and internal admin surfaces.

## What the app currently does

- Sale catalog + checkout flow
- Asset-first rental browsing and booking
- Unified customer cart for sale items + rental drafts
- Universal Search across products, rental assets, services, reviews, blogs, and promotions
- Mobile Home category shortcut cards backed by the same Home category-card data
- Customer order history and rental history
- Internal admin for catalog, assets, stock, orders, and rental operations
- Admin POS for phone-first customer lookup, walk-in rentals, deposit capture, and pickup/return fulfillment

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
- `NUXT_PUBLIC_OMISE_PUBLIC_KEY`
- `OMISE_SECRET_KEY`
- `OMISE_WEBHOOK_SECRET`

Important notes:

- `SUPABASE_SECRET_KEY` must remain server-only.
- `OMISE_SECRET_KEY` and `OMISE_WEBHOOK_SECRET` must remain server-only.
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
- `/admin/pos`
- `/admin/walk-in` → redirects to `/admin/pos`
- `/admin/rental-bookings/[id]`

## Important current rules

- Rental is now `asset`-first.
- Rental bookings are created as `draft` and confirmed from `/user/cart`.
- Admin POS can create `confirmed` rental bookings directly for account customers or walk-ins.
- Rental bookings must have either `user_id` or `walk_in_phone`.
- Rental booking status now includes `picked_up` and `returned` for fulfillment tracking.
- Booking cancellation is soft-delete via `status = 'cancelled'`.
- Booker name + phone are captured on rental submission.
- Rental booking form blocks invalid date ranges, shows lead-time/min/max hints, and scrolls back to missing booker contact fields after submit attempts.
- Admin POS stores ID-card images, deposit proof files, and pickup signatures in `catalog-media`.
- On Home mobile, category icon cards replace the partner-logo marquee; the Home category FAB is intentionally not mounted.
- Admin order tracking info is customer-visible after admin updates it.

## Documentation

Start with `map.md`.

Then use:

- `PROJECT_SUMMARY.md` — current state snapshot
- `API_INDEX.md` — routes, endpoints, composables, debug rules
- `ADMIN_MVP_ACTION_PLAN.md` — admin backlog and status
- `ASSET_ACTION_PLAN.md` — asset/rental decisions and backlog
- `DATABASE_ADMIN_MANUAL.md` — setup rules for admin data
- `admin-manual/README.md` — index of task-oriented admin manuals
- `ROLE_MATRIX.md` — permission model
- `CART_BOOKING_TEST_CHECKLIST.md` — manual smoke checklist

## UI notes

- UI: `@nuxt/ui`
- Icons: Boxicons (`bx:`)
