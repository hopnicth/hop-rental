# HOP-RENTAL Project Summary

Last updated: 2026-04-28
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
- Homepage content admin exists and is `super_admin` only, including banners, partner logos, curated product/asset rails, upload, and delete flows
- Generic content page admin exists for blog, services, promotions, and product reviews with localized TipTap (ProseMirror) bodies and shared media upload
- Product reviews are a `content_pages` row of type `review` and can be linked to one or more products and/or assets from `/admin/content`; linked reviews render as a "Product reviews" section on `/product-{group}/{slug}` and `/asset/{slug}`, and have their own public routes at `/reviews` and `/reviews/{slug}`
- Homepage promotion/service cards are now live references to `content_pages` rows, so titles, excerpts, cover images, and `/services/{slug}` or `/promotions/{slug}` links stay in sync with the CMS
- Homepage curated sections (`promotions`, rentals, products, services) use a shared Nuxt UI `UCarousel`/Embla rail with loop + timed autoplay, arrows, dots, and no continuous auto-scroll plugin
- Homepage rental/product sections use the same card components as product/all-rental listing cards
- Storefront card images are standardized to square `1:1` media frames (`aspect-square` + `object-cover`) so responsive cards preserve consistent image geometry
- Partner logos are DB-backed, support SVG uploads, and render through a compact 40px marquee with hover-pause only
- Global Nuxt UI theme tokens are customized in `app/assets/css/main.css` for HOP colors and a unified `0.2rem` radius scale
- Hero banners are DB-backed, autoplay with loop, and align title/subtitle/CTA to the right with a right-side readability gradient
- Card-based lists/grids/rails share a standard loading state: `<CommonLoadingCat />` (sleeping-cat GIF at `public/loading-cat.gif`) plus shape-matched `<ProductsCatalogCardSkeleton />` / `<HomeHomeLinkCardSkeleton />` while async data is loading; see `API_INDEX.md` for the required pattern
- Dynamic filter groups/options are super-admin managed and auto-assigned from exact `tag_keys` matches for both products and assets. Product/asset `filter_keys` are trigger-generated for fast public filtering; admin product assignment UI is read-only.
- Homepage category cards are DB-backed and super-admin editable, with mock fallback only for older/empty schemas. Selecting an option sends `/search?q=...` only; it must not set the product `category` query.
- Main categories are typed through `main_categories.entity_types` for `product`, `asset`, `service`, `promotion`, `blog`, and `review`. Content pages can store `main_category_key`, and `/services`, `/reviews`, `/blog`, and `/promotions` expose URL-persistent category filters.

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
- `/blog`, `/blog/{slug}`
- `/services`, `/services/{slug}`
- `/promotions`, `/promotions/{slug}`
- `/reviews`, `/reviews/{slug}`

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
- `/admin/content`
- `/admin/home-categories`

## Important rules

- Internal admin access uses `public.users.platform_role`.
- `company_members.role` does not grant `/admin` access.
- Rental is `asset`-first; product matching is recommended, not always required.
- Booking cancellation is soft-delete.
- Booker phone/name should be preferred over account phone/name when present on a booking.
- Homepage promotion/service cards must reference an existing `content_pages` row; create the page in `/admin/content` first, then link it from `/admin/home-content`.
- For PostgREST `ILIKE`, use `*term*` instead of `%term%`.
- For dynamic filters, put machine keys in `tag_keys`, not only `search_keywords`. Matching is exact/case-sensitive against `filter_options.key`.
- `category_keys` includes tags by design, so UI category lists must whitelist real main categories before rendering.
- Content listing filters require both migration `047` and admin data assignment: create/enable a typed main category, then assign `Main category` on each `/admin/content` page.

## Highest-value next priorities

1. Decide/apply migration `045` when ready to enable DB-level `/search` dynamic filtering
2. Backfill `main_category_key` on existing `content_pages` rows so public content filters show useful results
3. Extend global `/search` beyond products to rental assets, services, blogs, reviews, and promotions
4. Customer-facing rental documents/history polish
5. Backoffice checklist-template management polish
6. Quotation/document/payment follow-through not yet implemented end-to-end

## Read next

- `API_INDEX.md` for routes/endpoints/composables
- `ADMIN_MVP_ACTION_PLAN.md` for admin backlog
- `ASSET_ACTION_PLAN.md` for rental/asset decisions
