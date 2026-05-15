# HOP-RENTAL Project Summary

Last updated: 2026-05-15
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
- Admin triages sale orders from `/admin/orders` using the Sale Order Operations Queue, then manages status from `/admin/orders/[id]`
- Staff can create branch-scoped POS sales from `/admin/pos`; customer info is optional in Sale mode

### Rental

- Browse assets from `/product-rental`
- Open `/asset/[slug]`
- Create booking draft
- Confirm rental from `/user/cart`
- Staff can also create confirmed rentals from `/admin/pos` for account or walk-in customers
- Customer sees active history in `/user/rentals`
- Cancelled bookings remain in DB and appear in `/user/orders`
- Customer rental detail at `/user/rentals/[bookingId]` exposes QR, documents, cancellation/refund status, refund proof shortcuts, and the eligible self-service cancellation/refund form.
- Eligible customer cancellation creates an immutable cancellation event and a manual Booking Deposit refund request; admin completes the refund from `/admin/refunds` and uploads proof before the customer refund confirmation is exposed.
- Staff can manually mark overdue confirmed rental bookings as `no_show`; this records a no-show event, creates Booking Deposit disposition + financial recognition events, marks Booking Deposit as forfeited/refund-not-applicable, and releases availability because `no_show` is not a blocking rental status.
- Booking Deposit forfeiture Phase 3.1 foundation is implemented for terms references and no-show disposition/recognition. Ordinary receipt, operational notices, customer/admin document access, POS V2, and admin-agreed cancellation forfeiture remain future work documented in `docs/booking-deposit-forfeiture-accounting-document-design.md`.
- Admin manages rental operations from `/admin/rental-bookings/[id]`; `/admin/orders` is sale-order-only

## Major completed slices

### Catalog + assets

- Product admin CRUD is live
- Asset admin CRUD is live
- Asset matching to products is live
- Multi-inventory branch stock management is live
- Homepage content admin exists and is `super_admin` only, including banners, partner logos, curated product/asset rails, upload, and delete flows
- Generic content page admin exists for blog, services, promotions, and product reviews with localized TipTap (ProseMirror) bodies and shared media upload
- Service pages can store provider phone/email/Google Maps plus optional Line ID / Line URL in `/admin/content`; public service detail pages expose floating contact actions and sanitize Line links to HTTPS `line.me` / `lin.ee` hosts only
- Product reviews are a `content_pages` row of type `review` and can be linked to one or more products and/or assets from `/admin/content`; linked reviews render as a "Product reviews" section on `/product-{group}/{slug}` and `/asset/{slug}`, and have their own public routes at `/reviews` and `/reviews/{slug}`
- Homepage promotion/service cards are now live references to `content_pages` rows, so titles, excerpts, cover images, and `/services/{slug}` or `/promotions/{slug}` links stay in sync with the CMS
- Homepage curated sections (`promotions`, rentals, products, services) use a shared Nuxt UI `UCarousel`/Embla rail with loop + timed autoplay, arrows, dots, and no continuous auto-scroll plugin
- Homepage rental/product sections use the same card components as product/all-rental listing cards
- Storefront card images are standardized to square `1:1` media frames (`aspect-square` + `object-cover`) so responsive cards preserve consistent image geometry
- Partner logos are DB-backed, support SVG uploads, and render through a compact 40px marquee with hover-pause only
- Global Nuxt UI theme tokens are customized in `app/assets/css/main.css` for HOP colors and a unified `0.2rem` radius scale
- Hero banners are DB-backed, autoplay with loop, align title/subtitle/CTA to the right with a right-side readability gradient, and can use a dedicated mobile image (`mobile_image_url`) with desktop fallback when omitted
- Card-based lists/grids/rails share a standard loading state: `<CommonLoadingCat />` (sleeping-cat GIF at `public/loading-cat.gif`) plus shape-matched `<ProductsCatalogCardSkeleton />` / `<HomeHomeLinkCardSkeleton />` while async data is loading; see `API_INDEX.md` for the required pattern
- Dynamic filter groups/options are super-admin managed and auto-assigned from exact `tag_keys` matches for both products and assets. Product/asset `filter_keys` are trigger-generated for fast public filtering; admin product assignment UI is read-only.
- Header quick search and `/search` are now Universal Search surfaces covering products, rental assets, services, reviews, blog articles, and promotions. Results are grouped/scoped with `all`, `product`, `rental`, `service`, `review`, `blog`, and `promotion` tabs.
- `/search` persists `?scope=...`, keeps filters visible across scopes, and uses Browse Mode when there is no `q` or active filter so empty tabs do not show a false no-results state.
- Homepage category cards are DB-backed and super-admin editable, with mock fallback only for older/empty schemas. Desktop sidebar option selections send `/search?q=...` only. The Home mobile shortcut rail uses the same group data as icon cards and routes to `/search?category=<mainCategoryKey>` to browse the whole group.
- Home partner logos remain DB-backed but are hidden on small mobile; mobile uses category shortcut cards instead of the logo marquee and no longer mounts the Home category floating panel.
- Main categories are typed through `main_categories.entity_types` for `product`, `asset`, `service`, `promotion`, `blog`, and `review`. Content pages can store `main_category_key`, and `/services`, `/reviews`, `/blog`, and `/promotions` expose URL-persistent category filters.

### Booking + checkout

- Unified cart supports sale + rental review
- Asset-only bookings are supported
- Tiered rental pricing breakdown is persisted
- Shipping cost + breakdown are persisted on sale orders
- Pickup-at-branch flow is supported
- Booker name + contact phone are required for rental submit
- Rental date selection exposes earliest start, buffer/lead-time state, min/max clamp hints, and blocks submit until the date range is valid.
- Shared `<ProductsRentalBookingCalendar />` now owns the rental range + pricing-summary logic so storefront booking and admin POS rental creation stay aligned.
- If a valid date range is selected but booker name/phone are missing, the add-to-cart button stays clickable, shows a red inline error, and scrolls/focuses the missing contact field instead of submitting.

### Admin order operations

- `/admin/orders` is a sale-order-only operations queue backed by `GET /api/admin/orders/queue`
- The order queue has summary cards/tabs for `ต้องจัดการ`, `ต้องจัดส่ง`, `ลูกค้ารับเอง`, `รอชำระ`, and `ทั้งหมด`
- Queue counts come from the backend summary and pagination is order-level, not customer-grouped
- Legacy sale orders with `shipping_mode = NULL` stay visible in action-required/all queues but are not guessed into delivery/pickup
- QR scan on `/admin/orders` searches sale order queue rows for `order:<number>` / customer payloads
- Sale orders support admin tracking updates
- `/admin/pos` combines customer lookup, walk-in capture, rentable-asset search, deposit entry, and immediate booking creation
- `/admin/pos` now has separated Rental/Sale mode tabs, branch-scoped catalog, sale cart, unified payment capture, and daily POS transaction history
- POS rental mode reuses the storefront booking calendar/pricing breakdown component, but intentionally passes `bufferDays = 0` for front-desk booking.
- POS history shows sale+rental rows with daily summaries; print buttons are placeholders and `super_admin` can void/cancel rows
- POS supports ID-card upload for account or walk-in customers and reuses `walk_in_customers` as the phone-primary record
- POS pickup flow stores a customer signature and creates a fulfillment audit row before moving the booking to `picked_up`
- POS return flow records a fulfillment event and moves the booking to `returned`
- POS keeps pending ID-card uploads / booking drafts in `localStorage` for retry on flaky connections
- Rental booking detail supports checklists + documents
- Admin rental booking detail supports operational pickup/return document preview, issue, browser print, and reprint audit using immutable `official_documents` snapshots
- Booking docs store storage metadata for clean delete

### Customer cancellation / Booking Deposit refunds

- Phase C.1E refund proof and queue smoke is passed: admin can upload refund proof, admin detail shows it, and customer-facing proof access works through signed/customer-safe routes.
- Customer refund bank account entry now sanitizes the displayed value and submitted model to digits only; backend validation still enforces 6-25 digits after limited formatting normalization.
- Admin refund queue has segmented status filters with counts for all refund statuses and an unresolved-work badge in the admin navigation. Unresolved means pending admin review + processing + needs customer contact.
- Refund confirmation documents remain gated until the refund is marked refunded and proof is linked; customer payloads do not expose raw storage bucket/path metadata.
- No backend refund workflow semantics were changed by the latest UI polish/input UX batch.

### No-show lifecycle foundation

- No-show is now a first-class rental booking status: `no_show`.
- Staff mark no-show manually from admin rental booking detail only when booking is still `confirmed` and pickup date is before the current Bangkok local date.
- No-show creates `rental_booking_no_show_events` and mirrors metadata onto `rental_bookings.no_show_*` fields.
- No-show now also creates `rental_booking_deposit_disposition_events` and `financial_recognition_events` idempotently so forfeiture has a separate operational → disposition → recognition chain.
- Booking Deposit no-show outcome is explicit: `deposit_refund_status = forfeited`, `deposit_refund_amount = 0`, and no `payment_refunds` row is created.
- `confirmed` and `picked_up` continue blocking rental availability; `no_show` does not.

### Booking Deposit forfeiture accounting / receipt / terms

- Design track is complete and consolidated in `docs/booking-deposit-forfeiture-accounting-document-design.md`; Phase 3.1 foundation is implemented.
- Implemented chain for no-show: operational source event → `rental_booking_deposit_disposition_events` → `financial_recognition_events`; derived payment allocation trace and ordinary receipt/documents remain pending.
- `rental_bookings.deposit_refund_status` remains a mirror/status field; disposition events own terminal Booking Deposit outcome for implemented no-show forfeiture.
- `booking_deposit_terms` is now an allowed canonical agreement type; Booking Deposit payment acceptance links to active published agreement evidence when available and keeps legacy snapshot fallback.
- Future ordinary receipt must reuse `official_documents`, source from `financial_recognition_events`, and be ordinary receipt only: no tax invoice, no VAT, no WHT, and no tax invoice conversion.
- Next implementation should avoid receipt/notice scope creep unless explicitly selected; receipt, notice, document access, admin-agreed cancellation forfeiture, and POS V2 remain not implemented.

### Chat/support

- User support FAB on every storefront layout (left-bottom) with unread badge; cached snapshot via `localStorage` so the badge paints instantly before the realtime channel comes up.
- Admin inbox at `/admin/messages` with a thread list and `/admin/messages/[id]` detail view; staff/admin can read and reply.
- Backend in migration `048` with `chat_conversations`, `chat_participants`, `chat_messages`, `chat_attachments` plus a private `chat-attachments` bucket; RLS restricts reads to participants or platform staff and mutations go through server APIs so `sender_id` is derived from the session.
- Realtime via Supabase `postgres_changes` requires the WebSocket to be authenticated (`supabase.realtime.setAuth(accessToken)`); without it, RLS filters every event before it reaches the client. `useChat` re-applies the token on `onAuthStateChange`.
- Supabase v2 `useSupabaseUser()` returns decoded JWT claims, so user id must be resolved as `user.id ?? user.sub`.
- Unread badge clears whenever the panel opens (idempotent `markRead`) and auto-clears for messages that arrive while the panel is open and viewing the same conversation.

### Privacy & cookie consent

- Storefront and admin layouts mount `<CookieConsentBanner />` for PDPA/GDPR-style consent capture
- Consent state is stored in the `hop-rental-cookie-consent` cookie (180-day TTL, `sameSite=lax`, `secure=true`) and is versioned via `CONSENT_VERSION` so policy changes can re-prompt
- Categories: `necessary` (always on, covers Supabase auth, cart, language, color mode), `analytics`, `preferences`, `marketing`; non-essential default off (opt-in)
- `useCookieConsent()` exposes `hasResponded`, `categories`, `isAllowed(category)`, `acceptAll()`, `rejectNonEssential()`, `savePreferences()`, `openPreferences()` — analytics/marketing scripts must be gated behind `isAllowed(...)` before loading
- `ChatFab` is hidden while the consent banner or preferences modal is open; FAB z-index lowered to `z-40` so Nuxt UI modal overlays sit above it

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
- `/search`, `/search?scope=...`

### Customer

- `/user/cart`
- `/user/orders`
- `/user/rentals`
- `/user/rentals/[bookingId]`
- `/user/documents/[id]/print`

### Admin

- `/admin/products`
- `/admin/assets`
- `/admin/branches-inventory`
- `/admin/orders`
- `/admin/orders/[id]`
- `/admin/pos`
- `/admin/walk-in` (redirect alias)
- `/admin/rental-bookings/[id]`
- `/admin/refunds`
- `/admin/content`
- `/admin/home-categories`
- `/admin/messages`, `/admin/messages/[id]`

## Important rules

- Internal admin access uses `public.users.platform_role`.
- `company_members.role` does not grant `/admin` access.
- Rental is `asset`-first; product matching is recommended, not always required.
- `rental_bookings` now allow account-backed or walk-in bookings, but each row must have either `user_id` or `walk_in_phone`.
- POS-created rentals are inserted directly as `confirmed` bookings instead of customer-side `draft` bookings.
- POS Sale mode does not require customer info; POS Rental/Booking mode still requires an account or walk-in phone.
- POS staff branch access is controlled by `admin_user_branch_access`; `super_admin` sees all active branches.
- POS sale void/cancel marks the transaction cancelled; stock reversal should be handled by the controlled stock adjustment process until a safe reverse-inventory RPC exists.
- Rental fulfillment introduces `picked_up` and `returned` statuses; POS pickup requires a confirmed booking and POS return requires a picked-up booking.
- Booking cancellation is soft-delete.
- Booker phone/name should be preferred over account phone/name when present on a booking.
- Deposit collection is tracked on the booking row, while uploaded proof files are stored separately for audit.
- Customer self-service cancellation is available only for eligible confirmed/paid rental bookings before the locked refund cutoff; late cancellation remains support-only after cutoff.
- No-show is handled separately from cancellation/refund: staff may manually mark overdue confirmed bookings `no_show`, which records Booking Deposit forfeiture/refund-not-applicable without creating a refund case.
- Forfeiture foundation is partially runtime: no-show creates deposit disposition and financial recognition events, and Booking Deposit Terms can use canonical agreement governance. Forfeiture ordinary receipt, no-show notice, admin-agreed cancellation notice/forfeiture, document access UI, and POS V2 remain pending implementation.
- Booking Deposit refunds are manual admin work in this phase; do not introduce automatic gateway refunds without a separate design decision.
- Refund confirmation visibility requires refunded status plus linked refund proof.
- Homepage promotion/service cards must reference an existing `content_pages` row; create the page in `/admin/content` first, then link it from `/admin/home-content`.
- Public service-provider Line links must be sanitized to HTTPS `line.me` / `lin.ee` URLs; raw IDs may be stored separately and converted at render time.
- For PostgREST `ILIKE`, use `*term*` instead of `%term%`.
- For dynamic filters, put machine keys in `tag_keys`, not only `search_keywords`. Matching is exact/case-sensitive against `filter_options.key`.
- `category_keys` includes tags by design, so UI category lists must whitelist real main categories before rendering.
- Content listing filters require both migration `047` and admin data assignment: create/enable a typed main category, then assign `Main category` on each `/admin/content` page.
- `/search` should distinguish Browse Mode from Search Mode: no `q` and no active filters means browse/default content, not a no-results state.
- Home mobile category cards may deep-link to `/search?category=<mainCategoryKey>` for whole-category browsing; desktop Home sub-option selects still use `/search?q=...` only.

## Highest-value next priorities

1. Decide/apply migration `045` when ready to enable DB-level `/search` dynamic filtering
2. Backfill `main_category_key` on existing `content_pages` rows so public content filters show useful results
3. Search schema alignment: consolidate current hybrid Universal Search into a server-owned global endpoint/RPC for ranking and facets
4. Continue Booking Deposit Forfeiture after Phase 3.1: choose derived allocation/admin-review hardening or ordinary receipt runtime as the next explicit batch
5. Review no-show browser/admin ops and decide whether to add an overdue pickup dashboard queue
6. Decide whether customer late non-refundable cancellation should remain support-only or become a separate recorded lifecycle
7. Official POS receipt/tax invoice/delivery-note PDF generation
8. Backoffice checklist-template management polish
9. Robust offline POS queue with idempotency keys

## Read next

- `API_INDEX.md` for routes/endpoints/composables
- `ADMIN_MVP_ACTION_PLAN.md` for admin backlog
- `ASSET_ACTION_PLAN.md` for rental/asset decisions
- `docs/booking-deposit-forfeiture-accounting-document-design.md` for accepted forfeiture accounting/receipt/terms design and Phase 3 roadmap
