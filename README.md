# HOP-RENTAL

Last updated: 2026-05-10

HOP-RENTAL is a Nuxt-based commerce + rental platform for HOPNIC.
This single app contains storefront, customer self-service, and internal admin surfaces.

## What the app currently does

- Sale catalog + checkout flow
- Asset-first rental browsing and booking
- Unified customer cart for sale items + rental drafts
- Universal Search across products, rental assets, services, reviews, blogs, and promotions
- Mobile Home category shortcut cards backed by the same Home category-card data
- Customer order history and rental history
- Internal admin for catalog, assets, stock, orders, rental operations, and POS
- Admin POS for branch-scoped sale/rental transactions, optional Sale-mode customer info, walk-in rentals, daily history, and accounting export
- Service pages can expose provider contact actions (phone, email, Line, Maps) managed from the content CMS

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

Dev targets the **LOCAL** Supabase stack by default: `npm run dev` loads
`.env.local` and a pre-flight guard (`scripts/check-dev-env.mjs`) refuses to
start if that file does not resolve to `127.0.0.1`/`localhost`.

Working against the remote project is an explicit opt-in — put its values in
`.env.remote` (gitignored) and run:

```bash
npm run dev:remote
```

That path prints a warning before starting, because every write it makes is
real. Do **not** keep remote values in a plain `.env`: Nuxt loads `.env` by
default, so `npx nuxt dev` and `nuxt build` would silently target production.
The guard fails on that file for the same reason.

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
- Admin POS can create Sale-mode orders without customer info; customer scan/search is optional and lives inside the customer info card.
- POS transaction history is daily/branch-scoped; only `super_admin` can void/cancel rows.
- `/admin/orders` is the sale-order-only operations queue with delivery, pickup, awaiting-payment, action-required, and all-order views.
- Legacy sale orders with unknown fulfillment stay visible in action-required/all views; do not infer delivery vs pickup from address data.
- Rental bookings must have either `user_id` or `walk_in_phone`.
- Rental booking status now includes `picked_up` and `returned` for fulfillment tracking.
- Booking cancellation is soft-delete via `status = 'cancelled'`.
- Excessive customer cancellation restriction is design-locked in `HOPNIC_POS_V2_Master_Implementation_Plan.md` but not implemented yet; do not infer qualifying cancellations from `status = 'cancelled'` alone.
- Booker name + phone are captured on rental submission.
- Rental booking form blocks invalid date ranges, shows lead-time/min/max hints, and scrolls back to missing booker contact fields after submit attempts.
- Admin POS rental mode reuses the same booking calendar/pricing summary as storefront booking, but intentionally does not enforce asset buffer days.
- Admin POS stores ID-card images, deposit proof files, and pickup signatures in `catalog-media`.
- Service pages can expose provider phone/email/Line/Google Maps contact actions; Line links are sanitized to HTTPS `line.me` / `lin.ee` URLs before storefront use.
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
