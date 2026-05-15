# Admin MVP Action Plan

Last updated: 2026-05-15
Owner: continuity doc for future sessions
Status legend: `[ ]` not started, `[/]` in progress, `[x]` done, `[-]` dropped

Reality sync — 2026-05-15:

- Admin rental booking detail now has operational pickup/return document preview/issue/print using `official_documents` snapshots.
- Customer self-service rental cancellation + manual Booking Deposit refund tracking are implemented and smoke-passed for the C.1E proof/refund queue flow.
- Admin refund queue polish is done: short subtitle, segmented status filters with all-status counts, and unresolved refund work badge on the admin `Refunds` nav item.
- `/admin/orders` has been converted from customer-grouped sale+rental history into the Sale Order Operations Queue backed by `GET /api/admin/orders/queue`.
- Customer refund bank account input UX is fixed to keep the displayed/model value digits-only while preserving backend validation as source of truth.
- Latest refund/cancellation polish did not change backend workflow semantics, DB schema, refund statuses, or proof/document gating rules.
- No-show Lifecycle Foundation is implemented: staff can manually mark overdue confirmed rental bookings as `no_show`, Booking Deposit is recorded as forfeited/refund-not-applicable, and `no_show` no longer blocks rental availability.
- Booking Deposit Forfeiture Phase 3.1 foundation is implemented: `booking_deposit_terms` is supported by agreement governance, payment acceptance can link canonical evidence, and no-show now creates disposition + financial recognition events.
- For that track, forfeiture ordinary receipt, no-show notice, customer/admin document access, POS V2, admin-agreed cancellation forfeiture, and tax invoice conversion blocking remain future implementation.
- Late cancellation remains unchanged: customer self-service cancellation is still blocked after the Bangkok calendar-day refund cutoff and must stay separate from no-show.
- Official POS receipts, abbreviated/full tax invoices, WHT automation, and POS history document menus remain future work.
- Excessive customer cancellation restriction is design-locked but not implemented.

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
- [x] **Phase 5 — order operations** — sale order operations queue, sale + rental detail pages, status transitions, tracking, docs/checklists, booker contact capture
- [x] **Home content live-reference CMS** — promotion/service cards on the home rail are now `content_pages` references; admin picks a CMS page instead of typing title/excerpt/image (migration `038`)
- [x] **Home category cards** — groups/options are DB-backed and editable from `/admin/home-categories`; storefront sends only `q` to `/search` (migration `044`)
- [x] **Content category filters** — `/admin/content` assigns typed Main Category and `/services`, `/reviews`, `/blog`, `/promotions` filter via `?category=...` (migration `047`)
- [x] **Admin POS rollout** — customer scanner moved into customer card, Rental/Sale mode tabs, optional customer for Sale, branch-scoped catalog, sale cart, daily history, accounting CSV, super-admin void/cancel, and print placeholders

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
- `/admin/refunds` for manual Booking Deposit refund work queue and proof upload
- `/admin/pos`, `/admin/walk-in` (POS route alias)
- `/admin/home-content` (super_admin only), `/admin/home-categories`, `/admin/content`

## Current important server areas

- `server/api/admin/products/*`, `server/api/admin/assets/*`
- `server/api/admin/filter-groups/*`, `server/utils/admin-filter-groups.ts`
- `server/api/admin/orders/*`, `server/api/admin/rental-bookings/*`
- `server/api/admin/refunds/*`, `server/utils/admin-refunds.ts`
- `server/api/user/rental-bookings/*`, `server/utils/rental-booking-cancellation.ts`, `server/utils/customer-rental-booking-detail.ts`
- `server/api/admin/pos/*`, `server/utils/admin-pos.ts`
- `server/api/admin/home-content/*`, `server/api/admin/home-categories/*`, `server/utils/admin-home.ts`, `server/utils/home-categories.ts`
- `server/api/admin/content/*`, `server/utils/content-pages.ts`
- `server/utils/admin-orders.ts`, `server/utils/admin-bookings-ops.ts`

## Highest-value next admin work

1. [ ] Decide/apply migration `045` for DB-level `/search` dynamic filters
2. [ ] Backfill existing `content_pages.main_category_key` values from `/admin/content`
3. [ ] Continue Booking Deposit Forfeiture after Phase 3.1: derived allocation/admin review hardening or ordinary receipt design-to-runtime; receipt/notice/UI remain pending implementation
4. [ ] Review no-show foundation in browser/admin ops and decide whether to add an overdue pickup dashboard queue
5. [ ] Decide whether customer late non-refundable cancellation should remain support-only or become a separate recorded lifecycle
6. [ ] Implement official POS document generation: receipt, abbreviated tax invoice, full tax invoice, delivery note
7. [ ] Improve validation/messages on remaining admin forms
8. [ ] Add storefront quick-links for spot checking product/asset/admin edits
9. [ ] Add robust POS offline queue if front-desk offline use becomes frequent

## Notes to preserve

- The Photo Manager block in `app/pages/admin/products/[productId].vue` remains frozen unless explicitly requested.
- Admin order QR payloads are `order:<number>`, `booking:<uuid>`, `customer:<uuid>`.
- `/admin/orders` is sale-order-only; rental operations live under rental booking detail/POS flows.
- Legacy sale orders with `shipping_mode = NULL` must remain visible in `ต้องจัดการ`/`ทั้งหมด` but should not be guessed into delivery/pickup queues.
- Booker contact on a rental booking should be preferred over account contact when present.
- POS Sale mode customer info is optional; Rental/Booking mode still requires customer identity/contact.
- POS history cancel is `super_admin` only; print buttons are UI placeholders until document APIs are added.
- Forfeited Booking Deposit ordinary receipt is accepted design only, not runtime: `financial_recognition_events` now exist as the future receipt source, but receipt issuance, notice documents, and tax invoice conversion blocking are still not implemented.
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
- `docs/booking-deposit-forfeiture-accounting-document-design.md`
