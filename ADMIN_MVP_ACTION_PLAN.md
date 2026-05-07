# Admin MVP Action Plan

Last updated: 2026-05-07
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
- [x] Dynamic filter assignments are tag-derived; manual assignment UI should remain read-only to avoid drift.
- [x] Home category-card config is `super_admin` editable. Desktop sub-options preserve `/search?q=...`; mobile group icon cards may use `/search?category=<mainCategoryKey>`.
- [x] Typed main categories support product, asset, service, promotion, blog, and review through `main_categories.entity_types`.

## Phase status

Phases 0–5 are complete and shipped. Each line below is a one-shot summary of
what was delivered; do not re-expand into checklists unless a regression appears.

- [x] **Phase 0 — foundation** — admin shell, guard, landing page
- [x] **Phase 1 — catalog CRUD** — product/SKU, asset, asset matches, homepage content, blog/service/promotion CMS
- [x] **Phase 4 — branches + inventory** — branch + inventory pool + stock CRUD with audit log, inline product stock
- [x] **Phase 5 — order operations** — customer-grouped dashboard, sale + rental detail pages, status transitions, tracking, docs/checklists, booker contact capture
- [x] **Home content live-reference CMS** — promotion/service cards on the home rail are now `content_pages` references; admin picks a CMS page instead of typing title/excerpt/image (migration `038`)
- [x] **Home category cards** — groups/options are DB-backed and editable from `/admin/home-categories`; storefront sends only `q` to `/search` (migration `044`)
- [x] **Content category filters** — `/admin/content` assigns typed Main Category and `/services`, `/reviews`, `/blog`, `/promotions` filter via `?category=...` (migration `047`)

### Phase 2 — media/admin usability (mostly done)

- [x] Media upload to Supabase Storage (product/asset/home/content), thumbnail sync, SVG partner logos, square-image frames, HOP theme tokens
- [ ] Required-field validation polish across remaining forms
- [ ] Quick storefront check links from admin surfaces

### Phase 3 — server/admin security (mostly done)

- [x] Privileged `/api/admin/*` pattern with role gates on server routes
- [ ] Continue removing places that still depend on read-only fallback assumptions

## Current important surfaces

- `/admin/products`, `/admin/assets`, `/admin/branches-inventory`
- `/admin/filter-groups` (super-admin dynamic filter setup)
- `/admin/orders`, `/admin/orders/[id]`, `/admin/rental-bookings/[id]`
- `/admin/home-content` (super_admin only), `/admin/home-categories`, `/admin/content`

## Current important server areas

- `server/api/admin/products/*`, `server/api/admin/assets/*`
- `server/api/admin/filter-groups/*`, `server/utils/admin-filter-groups.ts`
- `server/api/admin/orders/*`, `server/api/admin/rental-bookings/*`
- `server/api/admin/home-content/*`, `server/api/admin/home-categories/*`, `server/utils/admin-home.ts`, `server/utils/home-categories.ts`
- `server/api/admin/content/*`, `server/utils/content-pages.ts`
- `server/utils/admin-orders.ts`, `server/utils/admin-bookings-ops.ts`

## Highest-value next admin work

1. [ ] Decide/apply migration `045` for DB-level `/search` dynamic filters
2. [ ] Backfill existing `content_pages.main_category_key` values from `/admin/content`
3. [ ] Improve validation/messages on remaining admin forms
4. [ ] Add storefront quick-links for spot checking product/asset/admin edits
5. [ ] Add checklist-template management polish if ops team needs more control
6. [ ] Continue documenting which admin flows are staff vs super-admin only

## Notes to preserve

- The Photo Manager block in `app/pages/admin/products/[productId].vue` remains frozen unless explicitly requested.
- Admin order QR payloads are `order:<number>`, `booking:<uuid>`, `customer:<uuid>`.
- Incomplete sale/rental rows in the admin order list should remain visually highlighted.
- Booker contact on a rental booking should be preferred over account contact when present.
- Homepage admin covers banners, partner logos, curated featured rails, and CMS-linked promotion/service cards.
- Promotion/service rail rule: a `content_pages` row of the matching type must exist before it can be linked from `/admin/home-content`. Empty rails render empty states; do not reintroduce random fallbacks.
- Content Pages admin uses a localized TipTap editor (`th`/`en`/`cn`/`jp`) and shares the `catalog-media` bucket via the `content-pages/*` prefix.
- Partner logo uploads may be SVG only for `partner-logo`; other Home image uploads are processed to WebP.
- Storefront Home sections use shared `HomeHorizontalRail` carousel behavior; product/asset cards use listing components, and promotion/service cards use `HomeLinkCard`.
- Home category card (`CategoriesCard.vue`) should keep its current UX: main rows with sub-category dropdowns and click-through to `/search?q=<label>` only. Do not send `category` from Home shortcuts.
- Storefront card images should remain square `1:1`; card media defaults live in `CatalogCardShell.vue` and `HomeLinkCard.vue`.

## Cross refs

- `map.md`
- `PROJECT_SUMMARY.md`
- `API_INDEX.md`
- `DATABASE_ADMIN_MANUAL.md`
