# Admin MVP Action Plan

Last updated: 2026-04-27
Owner: continuity doc for future sessions
Status legend: `[ ]` not started, `[/]` in progress, `[x]` done, `[-]` dropped

## Purpose

Track the minimum useful internal backoffice for HOPNIC operations.
Use this as the active admin backlog, not as a historical transcript.

## Locked decisions

- [x] Admin access uses `public.users.platform_role`.
- [x] `/admin` allows `staff` + `super_admin` unless narrowed intentionally.
- [x] `/admin/home-content` stays `super_admin` only.
- [x] Admin writes go through privileged server APIs.
- [x] Assets are the rental/commercial root; matches are explicit admin-managed links.

## Phase status

### Phase 0 — foundation

- [x] Admin shell, guard, landing page

### Phase 1 — catalog CRUD

- [x] Product list/detail admin
- [x] SKU CRUD under product
- [x] Asset list/detail admin
- [x] Asset match management
- [x] Homepage content admin
- [x] Blog/service/promotion content page admin

### Phase 2 — media/admin usability

- [x] Product/asset media upload to Supabase Storage
- [x] Thumbnail/gallery sync rules
- [x] Homepage image upload flow instead of URL-only input
- [x] Homepage partner logo SVG upload and compact logo rail
- [x] Homepage storefront sections standardized on shared carousel/card behavior
- [x] Storefront card image frames standardized to square `1:1`
- [x] Global HOP UI theme colors and `0.2rem` radius tokens applied
- [ ] Required-field validation polish across remaining forms
- [ ] Quick storefront check links from admin surfaces

### Phase 3 — server/admin security

- [x] Privileged `/api/admin/*` pattern
- [x] Admin role gates enforced on server routes
- [ ] Continue removing places that still depend on read-only fallback assumptions

### Phase 4 — branches + inventory

- [x] Branch CRUD
- [x] Inventory pool CRUD
- [x] Stock CRUD with audit log
- [x] Admin branches/inventory page
- [x] Inline product inventory management

### Phase 5 — order operations

- [x] Customer-grouped admin order dashboard
- [x] Sale order detail page
- [x] Rental booking detail page
- [x] Admin status transitions for sale + rental
- [x] Sale order tracking support
- [x] Rental booking docs/checklists UI + APIs
- [x] Booker name/phone captured and shown in admin flows

## Current important surfaces

- `/admin/products`
- `/admin/assets`
- `/admin/branches-inventory`
- `/admin/orders`
- `/admin/orders/[id]`
- `/admin/rental-bookings/[id]`

## Current important server areas

- `server/api/admin/products/*`
- `server/api/admin/assets/*`
- `server/api/admin/orders/*`
- `server/api/admin/rental-bookings/*`
- `server/utils/admin-orders.ts`
- `server/utils/admin-bookings-ops.ts`

## Highest-value next admin work

1. [ ] Improve validation/messages on remaining admin forms
2. [ ] Add storefront quick-links for spot checking product/asset/admin edits
3. [ ] Add checklist-template management polish if ops team needs more control
4. [ ] Continue documenting which admin flows are staff vs super-admin only

## Notes to preserve

- The Photo Manager block in `app/pages/admin/products/[productId].vue` remains frozen unless explicitly requested.
- Admin order QR payloads are `order:<number>`, `booking:<uuid>`, `customer:<uuid>`.
- Incomplete sale/rental rows in the admin order list should remain visually highlighted.
- Booker contact on a rental booking should be preferred over account contact when present.
- Homepage admin now covers banners, partner logos, promotion/service cards, and curated featured rails with upload/delete flows.
- Content Pages admin covers blog, services, and promotions with reusable blocks: heading, paragraph, image, button, link, file download, callout, gallery, and FAQ.
- Partner logo uploads may be SVG only for `partner-logo`; other Home image uploads are processed to WebP.
- Storefront Home sections use shared `HomeHorizontalRail` carousel behavior; product/asset cards use listing components, and promotion/service cards use `HomeLinkCard`.
- Do not reintroduce random fallback items for admin-curated Home product/asset rails; empty curated rails should show empty states.
- Storefront card images should remain square `1:1`; card media defaults live in `CatalogCardShell.vue` and `HomeLinkCard.vue`.

## Cross refs

- `map.md`
- `PROJECT_SUMMARY.md`
- `API_INDEX.md`
- `DATABASE_ADMIN_MANUAL.md`
