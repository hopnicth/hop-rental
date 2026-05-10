# API Index

Last updated: 2026-05-10
Audience: developers, QA, future Augment sessions

## Purpose

Quick map of important composables, pages, endpoints, and migration-sensitive behavior.
Read this after `map.md` when debugging or implementing features.

## Core conventions

- Public catalog reads rely on Supabase RLS.
- Customer-owned writes require authentication.
- Internal admin routes use `platform_role` (`staff`, `super_admin`).
- `/admin/home-content` is narrower and remains `super_admin` only.
- Some older environments may still rely on schema fallback in `useBooking()`.
- For PostgREST `ILIKE`, use `*term*`, not `%term%`.
- Dynamic filter option matching is **case-sensitive exact**: `filter_options.key` must equal one item in `products.tag_keys` / `assets.tag_keys`.
- `products.category_keys` and `assets.category_keys` are derived compatibility/search arrays. They contain `[main_category_key] + tag_keys`, so do not treat every `category_keys` entry as a public category.
- Admin POS file uploads use `catalog-media` for customer IDs, deposit proofs, and fulfillment signatures.
- Admin POS is branch-scoped: staff only see branches from `admin_user_branch_access.can_pos`; `super_admin` sees all active branches.

## Main read paths

| Surface                        | Main code                                              | Source                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product browse/detail          | `app/composables/useProducts.ts`                       | `products`, `product_skus`                                                                                                                        |
| Asset browse/detail            | `app/composables/useAssets.ts`                         | `assets`, `asset_matches`                                                                                                                         |
| Cart                           | `app/composables/useCart.ts`                           | `carts`, `cart_items`                                                                                                                             |
| Rental booking store           | `app/composables/useBooking.ts`                        | `rental_bookings`                                                                                                                                 |
| Orders history                 | `app/composables/useOrders.ts`                         | `orders`, `order_items`                                                                                                                           |
| Branch picker                  | `app/composables/useBranches.ts`                       | `store_branches`                                                                                                                                  |
| Homepage banners/content/logos | `useBanners.ts`, `useHomeContent.ts`, `usePartners.ts` | `home_banners` (`image_url`, optional `mobile_image_url`), `home_link_cards` joined with `content_pages`, `home_featured_*`, `home_partner_logos` |
| Content pages                  | `useContentPages.ts`, `ContentRenderer.vue`            | `content_pages` (localized TipTap body) joined with `content_page_products`, `content_page_assets`                                                |
| Dynamic filter groups          | `app/composables/useFilterGroups.ts`                   | `/api/filter-groups?main_category=...` → `filter_groups`, `filter_options`                                                                        |
| Typed main categories          | `app/composables/useMainCategories.ts`                 | `/api/main-categories?entityType=...` → `main_categories.entity_types`                                                                            |
| Admin order dashboard          | `app/composables/useAdminOrders.ts`                    | `/api/admin/orders/customers`                                                                                                                     |
| Admin POS workflow/history     | `app/pages/admin/pos.vue`                              | `/api/admin/customers/lookup`, `/api/admin/pos/*`, `users`, `walk_in_customers`, `assets`, `product_skus`, `orders`, `rental_bookings`            |
| Cookie consent                 | `app/composables/useCookieConsent.ts`                  | `hop-rental-cookie-consent` cookie (versioned, 180-day TTL)                                                                                       |
| Search/filter guideline        | `SEARCH_AND_FILTER_GUIDELINE.md`                       | Current `/search` rules + future multi-type search direction                                                                                      |

## Catalog / category / dynamic-filter schema map

| Concept                  | Source of truth                                           | Public runtime field                                            | Notes                                                                                                  |
| ------------------------ | --------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Main category            | `main_categories.key` + `entity_types`                    | `mainCategoryKey` / `main_category_key` per entity              | Category pickers must filter by `entityType`; one key may belong to multiple domains.                  |
| Tags / sub-category keys | `products.tag_keys`, `assets.tag_keys`                    | included inside `category_keys` for legacy/search compatibility | Tags are machine keys. Put human/SEO phrases in `search_keywords`, not tags.                           |
| Derived category array   | trigger-maintained `category_keys`                        | `Product.categories`, `Asset.categories`                        | Equals `[main_category_key] + tag_keys`; never display raw values as all categories without filtering. |
| Filter assignment        | `product_filter_options`, `asset_filter_options`          | `filter_keys`                                                   | Junction rows are auto-synced from tags by migration `043`. Admin assignment UI is read-only.          |
| Fast filter token        | trigger-maintained `filter_keys`                          | `Product.filterKeys`, `Asset.filterKeys`                        | Token format: `<filter_group.key>__<filter_option.key>` (for example `sub_category__impact_drill`).    |
| Numeric dynamic filter   | `filter_groups.filter_type = 'number_range'` + `spec_key` | `product.spec[spec_key]`, `asset.specSummary[spec_key]`         | Not tag-based; no filter options required.                                                             |

### Dynamic-filter API map

| Route / function                                     | Role                | Purpose                                                                                |
| ---------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| `GET /api/filter-groups?main_category=:key`          | public/RLS          | Active groups + active options for storefront sidebar.                                 |
| `GET /api/admin/filter-groups`                       | staff + super_admin | Admin list/filter groups, optionally by `mainCategory`.                                |
| `POST /api/admin/filter-groups`                      | super_admin         | Create group (`key`, labels, `main_category_key`, `filter_type`, `match_logic`, etc.). |
| `PATCH/DELETE /api/admin/filter-groups/[groupId]`    | super_admin         | Update/delete group.                                                                   |
| `POST /api/admin/filter-groups/[groupId]/options`    | super_admin         | Create option. Option `key` is what tags must match exactly.                           |
| `PATCH/DELETE .../options/[optionId]`                | super_admin         | Update/delete option; migration `043` cascades resync for affected category.           |
| `GET /api/admin/products/[productId]/filter-options` | staff + super_admin | Read-only preview of current product assignments.                                      |
| `PUT /api/admin/products/[productId]/filter-options` | legacy/admin        | Legacy manual endpoint; UI should not use for normal edits after auto-sync from tags.  |

### Home category-card map

Current storefront implementation:

- `app/components/categories_card/CategoriesCard.vue` renders the desktop Home category card/sidebar.
- `app/components/home/HomeCategoryShortcutRail.vue` renders mobile Home category icon cards from the same data source.
- It reads DB-backed rows from `/api/home-category-cards` via `useCategories()`, with mock data only as a safe fallback.
- Selecting a desktop sub-category routes to `/search?q=<localized label>` only.
- Tapping a mobile icon-card group routes to `/search?category=<mainCategoryKey>` so `/search` browses the whole typed category group.
- Do **not** send Home sub-option shortcut keys as `category`; only real `mainCategoryKey` values are valid for the `category` query.

Persistence direction:

- Home category-card groups/options are super-admin editable.
- Keep `main_category_key` / `sub_category_key` values aligned with the dynamic-filter/tag convention.
- Store localized labels/icons/sort/is_active on the card config; route target should remain explicit (`/search?...`) or derive from selected sub-category key.

## Storefront UI conventions

- Home content sections render through `app/components/home/HomeHorizontalRail.vue`, a Nuxt UI `UCarousel`/Embla wrapper using loop + timed autoplay, arrows, and dots.
- Do not use the continuous Auto Scroll plugin for Home section cards unless explicitly requested.
- On Home mobile, partner-logo marquee is hidden and category shortcut cards are shown instead; do not re-add the Home category floating FAB unless explicitly requested.
- Product/asset listing cards share `CatalogCardShell.vue`; card media should stay `aspect-square w-full object-cover`.
- Home promotion/service cards use `HomeLinkCard.vue` and read title/excerpt/cover/link live from the linked `content_pages` row.
- Global HOP theme tokens live in `app/assets/css/main.css` (`--ui-primary`, `--ui-secondary`, status colors, and `0.2rem` radius scale).

## Cookie consent

- `<CookieConsentBanner />` (`app/components/cookie/CookieConsentBanner.vue`) is mounted in `app/layouts/default.vue` and `app/layouts/admin.vue`. Consent state is owned by `useCookieConsent()` (`app/composables/useCookieConsent.ts`) and persisted in the `hop-rental-cookie-consent` cookie with `maxAge = 180 days`, `sameSite=lax`, `secure=true`.
- Record shape: `{ v: <CONSENT_VERSION>, ts: <ISO>, categories: { necessary, analytics, preferences, marketing } }`. Bumping `CONSENT_VERSION` invalidates older records and re-prompts.
- Categories:
  - `necessary` — always `true`; covers Supabase auth (`sb-*`), cart (`hop-rental-cart-*`), i18n locale, color mode, and the consent cookie itself. Cannot be turned off.
  - `analytics`, `preferences`, `marketing` — opt-in (default `false`). Currently no scripts depend on these; reject is a no-op until tracking is added.
- Required pattern when adding analytics / marketing scripts (e.g. GA4, Meta Pixel, Hotjar): gate loading inside a client plugin and watch the consent state. Never load tracking before consent.

```ts
// app/plugins/analytics.client.ts
export default defineNuxtPlugin(() => {
  const consent = useCookieConsent();
  watchEffect(() => {
    if (consent.isAllowed("analytics")) loadAnalytics();
  });
});
```

- Public API: `hasResponded`, `categories`, `isAllowed(category)`, `acceptAll()`, `rejectNonEssential()`, `savePreferences(partial)`, `openPreferences()`, `closePreferences()`. Use `openPreferences()` from a future footer/settings link to let users withdraw consent at any time.
- i18n: keys live under `cookieConsent.*` in all four locales (`th`, `en`, `cn`, `jp`).
- `ChatFab` reads `useCookieConsent()` and hides itself while the banner or preferences modal is open. ChatFab z-index is `z-40`; consent banner is `z-60`; consent preferences modal overlay/content is `z-70`. Do not reintroduce `z-999` on floating UI — it shadows Nuxt UI modal overlays.

## Lazy load loading state standard

Every list/grid/rail that renders card-based data asynchronously must show a progress indicator and shape-matched skeletons while data is loading. Empty space is not an acceptable loading state.

### Building blocks

- `<CommonLoadingCat />` (`app/components/common/LoadingCat.vue`) — sleeping-cat GIF + localized "Loading…" label. Props: `label?`, `size?` (default `72`), `inline?` (default `false`). Reads `/loading-cat.gif` from `public/`.
- `<ProductsCatalogCardSkeleton />` (`app/components/products/CatalogCardSkeleton.vue`) — skeleton shaped like `CatalogCardShell` (header + square media + description + tags + footer actions). Use for product/asset grids and rails.
- `<HomeHomeLinkCardSkeleton />` (`app/components/home/HomeLinkCardSkeleton.vue`) — skeleton for promotion/service cards on home rails.
- `<HomeHorizontalRail :loading>` accepts a `loading` prop and a `#skeleton` slot; while `loading && items.length === 0` it auto-renders inline `<CommonLoadingCat />` plus `skeletonCount` (default 3) shape-matched cards.
- i18n key: `common.loading` (TH/EN/CN/JP).

### Required pattern for new list/grid views

1. Source `loading` from the data composable (e.g. `useProducts`, `useAssets`, `useHomeContent`, `useContentPages`). If it does not yet expose one, add a `useState`-backed boolean that flips around the fetch call and return it.
2. While `loading` is true and the list is empty, render `<CommonLoadingCat />` followed by a grid of the matching skeleton component using the same column/gap classes as the real grid.
3. Once data arrives, swap to the real cards. Keep skeleton dimensions aligned with the real card to prevent layout shift.
4. Do not introduce per-feature spinners or ad-hoc text like "Loading…" — always use `<CommonLoadingCat />` and `t('common.loading')`.
5. For rails fed by `HomeHorizontalRail`, just pass `:loading="..."`; do not duplicate the indicator outside the rail.
6. Asset reference: the GIF must live at `public/loading-cat.gif`. In `LoadingCat.vue` the path is bound via `:src` (not a static literal) so Vite does not resolve it at build time.

### Reference wiring

- `app/pages/index.vue` — passes `linkCardsLoading`, `featuredAssetsLoading`, `featuredProductsLoading` to four rails.
- `app/pages/product-[group]/index.vue` and `app/pages/product-[group]/[id].vue` — top-level `<CommonLoadingCat />` + grid of `<ProductsCatalogCardSkeleton />` for listing, matched assets, and recommended sections.
- `app/pages/search.vue` — replaces the old "Searching…" text with the standard pattern, sized to `pageSize`.
- `app/components/content/ContentCollectionPage.vue` — `<CommonLoadingCat />` above the existing `USkeleton` grid.

## Main write paths

| Action                             | Main code                                                        | Writes to                                |
| ---------------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| Add sale item                      | `useCart().addToCart()`                                          | `carts`, `cart_items`                    |
| Create booking draft               | `useBooking().addBooking()`                                      | `rental_bookings`                        |
| Confirm booking                    | `useBooking().updateBookingStatus()`                             | `rental_bookings`                        |
| Submit sale order                  | `useOrders().submitOrder()`                                      | `orders`, `order_items`                  |
| Chat messages/read state           | `/api/chat/conversations/*`, `/api/chat/messages/*`              | `chat_messages`, `chat_participants`     |
| Chat unread counts (badge init)    | `/api/chat/unread-counts.get.ts`                                 | reads `chat_participants` only           |
| Chat attachment upload/access      | `/api/chat/messages/*/attachments`, `/api/chat/attachments/*`    | `chat_attachments` + private storage     |
| Chat client state + realtime       | `useChat()` (`app/composables/useChat.ts`)                       | shared `useState`, Supabase realtime     |
| Admin order update                 | `/api/admin/orders/[id].patch.ts`                                | `orders`                                 |
| Admin booking update               | `/api/admin/rental-bookings/[id].patch.ts`                       | `rental_bookings`                        |
| Admin booking ops                  | `/api/admin/rental-bookings/[id]/ops.get.ts` + nested ops routes | booking docs/checklists tables           |
| Admin POS booking creation         | `/api/admin/pos/bookings.post.ts`                                | `rental_bookings`, `walk_in_customers`   |
| Admin POS sale creation            | `/api/admin/pos/sales.post.ts`                                   | `orders`, `order_items`, stock RPC       |
| Admin POS history cancel           | `/api/admin/pos/history/cancel.post.ts`                          | `orders` / `rental_bookings` status      |
| Admin customer ID-card upload      | `/api/admin/customers/id-card.post.ts`                           | `users`, `walk_in_customers`, storage    |
| Admin booking deposit proof upload | `/api/admin/rental-bookings/[id]/deposit-proof.post.ts`          | `rental_booking_deposit_proofs`, storage |
| Admin booking fulfillment          | `/api/admin/rental-bookings/[id]/fulfillment.post.ts`            | `rental_booking_fulfillments`, storage   |
| Admin homepage content CRUD/upload | `/api/admin/home-content/*`                                      | `home_*` tables + `catalog-media` bucket |
| Admin content pages CRUD/upload    | `/api/admin/content/*`                                           | `content_pages` + `catalog-media` bucket |
| Admin Home category-card CRUD      | `/api/admin/home-categories/*`                                   | `home_category_card_groups/options`      |

## Important customer routes

- `/user/cart`
- `/user/orders`
- `/user/rentals`
- `/asset/[slug]`

## Important admin routes

- `/admin/products`
- `/admin/assets`
- `/admin/branches-inventory`
- `/admin/orders`
- `/admin/orders/[id]`
- `/admin/pos`
- `/admin/walk-in` (redirect alias)
- `/admin/rental-bookings/[id]`
- `/admin/home-content`
- `/admin/home-categories`
- `/admin/content`
- `/admin/messages`, `/admin/messages/[id]`

## Important admin server areas

- `server/utils/admin-orders.ts`
- `server/utils/admin-bookings-ops.ts`
- `server/api/admin/orders/*`
- `server/api/admin/pos/*`
- `server/api/admin/customers/*`
- `server/api/admin/rental-bookings/*`
- `server/api/admin/assets/*`
- `server/api/admin/products/*`
- `server/utils/admin-pos.ts`
- `server/api/admin/home-content/*`
- `server/api/admin/home-categories/*`
- `server/utils/admin-home.ts`
- `server/utils/home-categories.ts`
- `server/utils/home-media.ts`
- `server/api/admin/content/*`
- `server/utils/content-pages.ts`
- `server/utils/content-media.ts`

### Admin POS API map

| Route                                      | Role                | Purpose                                                                   |
| ------------------------------------------ | ------------------- | ------------------------------------------------------------------------- |
| `GET /api/admin/pos/branches`              | staff + super_admin | Branch picker scoped by `admin_user_branch_access`; super admin sees all. |
| `GET /api/admin/pos/catalog`               | staff + super_admin | Rental assets or sale SKUs for the selected branch and mode.              |
| `POST /api/admin/pos/bookings`             | staff + super_admin | Create confirmed rental/walk-in booking; customer info remains required.  |
| `POST /api/admin/pos/sales`                | staff + super_admin | Create branch POS sale; customer fields are optional in Sale mode.        |
| `GET /api/admin/pos/history?date&branchId` | staff + super_admin | Daily sale+rental transaction list plus payment summary.                  |
| `POST /api/admin/pos/history/cancel`       | super_admin         | Void/cancel POS sale or rental transaction.                               |
| `GET /api/admin/pos/accounting-export`     | staff + super_admin | CSV export for accounting/reconciliation.                                 |
| `GET/PATCH /api/admin/pos/branch-access`   | super_admin         | Maintain staff POS branch grants.                                         |

### `014_homepage_content.sql`

- `home_banners`, `home_link_cards`, `home_featured_products`, `home_featured_assets`
- `home_banners.mobile_image_url` stores optional phone-specific hero artwork; storefront falls back to `image_url` when it is empty

## Migration-sensitive behavior

### `029_rental_bookings_pricing_breakdown.sql`

- `pricing_breakdown`, `weekly_rate`, `monthly_rate`

### `030_shipping_cost.sql`

- `products.shipping_size`
- `orders.shipping_cost`, `orders.shipping_breakdown`

### `031_rental_bookings_asset_only.sql`

- rental bookings may be rooted by `asset_id` alone
- `product_id` / `sku_id` can be null

### `032_orders_tracking.sql`

- sale orders support tracking/admin fulfillment metadata

### `033_rental_booking_docs_storage.sql`

- booking docs store `storage_bucket`, `storage_path`
- rental bookings store `booker_name`, `booker_phone`

### `034_home_partner_logos.sql`

- `home_partner_logos`
- homepage partner/logo marquee is DB-backed

### `035_catalog_media_svg_mime.sql`

- `catalog-media` storage bucket allows `image/svg+xml`
- SVG upload is accepted only for Home `partner-logo` media
- non-SVG Home media is still processed to WebP

### `036_content_pages.sql`

- `content_pages` stores blog, service, and promotion pages
- Admin uploads share `catalog-media` with `content-pages/*` storage prefix

### `037_content_pages_localized_body.sql`

- `content_pages.blocks` accepts a localized TipTap (ProseMirror) document object keyed by `th`, `en`, `cn`, `jp`
- Legacy array-style blocks remain readable; default is `'{}'::jsonb`

### `038_home_link_cards_content_page_ref.sql`

- `home_link_cards.content_page_id` references `content_pages(id)` with `ON DELETE CASCADE`
- Legacy text columns (`title_*`, `description_*`, `image_url`, `link_url`) are nullable when `content_page_id` is set
- Row guard `home_link_cards_source_present`: either `content_page_id` is present, or all legacy text fields are filled
- Unique `(section_key, content_page_id)` prevents duplicating the same page in one section
- Migration drops unlinked legacy rows; admin must pick a `content_pages` row to populate the rail

### `040_content_page_links.sql`

- `content_pages.content_type` check constraint extended to include `review`
- `content_page_products(content_page_id, product_id, sort_order)` junction (PK on the pair) links a review to one or more `products`
- `content_page_assets(content_page_id, asset_id, sort_order)` junction (PK on the pair) links a review to one or more `assets`
- RLS: public `SELECT` on both junction tables is gated by `content_pages.is_active = true` for the linked content page; writes are admin-only via the API
- `useContentPages().fetchReviewsForProduct(productId)` and `fetchReviewsForAsset(assetId)` use distinct select strings (`REVIEWS_FOR_PRODUCT_SELECT` / `REVIEWS_FOR_ASSET_SELECT`) so the `!inner` filter is unambiguous on the targeted junction; both filter `content_type = 'review'` + `is_active = true` and cap at 6 rows
- `pathForContent` routes review pages to `/reviews/{slug}`; the public listing/detail routes live at `app/pages/reviews/index.vue` and `app/pages/reviews/[slug].vue`
- `/admin/content` shows multi-select pickers (`USelectMenu multiple searchable`) for `linkedProductIds` and `linkedAssetIds` only when `contentType === 'review'`; `GET /api/admin/content` returns `productOptions` + `assetOptions` for these pickers, and `POST` / `PATCH` sync junction rows via `syncContentPageLinks` in `server/utils/content-pages.ts`

### `041_dynamic_product_filters.sql` through `043_auto_sync_filter_options_from_tags.sql`

- `041` creates dynamic filter source-of-truth tables: `filter_groups`, `filter_options`, `product_filter_options`, plus product-side `filter_keys` denormalization.
- `042` allows safe filter key updates and keeps denormalized tokens aligned when keys are renamed.
- `043` extends parity to rentals with `asset_filter_options` + `assets.filter_keys`, then auto-syncs product/asset assignments from `tag_keys`.
- Matching rule is exact and case-sensitive: option key `impact_drill` only matches tag `impact_drill`.
- Number-range groups do not use tags/options; they read `spec_key` from product `spec` or asset `spec_summary`.
- Public listing dynamic filters use `app/utils/dynamic-filters.ts`; it accepts any object shaped like `{ filterKeys, spec }`.

### `044_home_category_cards.sql`

- Adds DB-backed Home category-card groups/options.
- Public endpoint: `GET /api/home-category-cards`.
- Admin surface: `/admin/home-categories` with server routes under `/api/admin/home-categories/*`.
- Storefront click-through sends only `q` to `/search`; it must not set `category`.

### `045_search_products_dynamic_filters.sql`

- Prepared but intentionally not applied on the current remote at the time of this update.
- Extends `search_products` with `p_dynamic_filters jsonb` for DB-level `/search` dynamic filtering.
- `/search` has a legacy fallback for environments where `045` is not applied.

### `046_main_category_entity_types.sql`

- Adds typed taxonomy support through `main_categories.entity_types`.
- `/api/main-categories?entityType=...` and `useMainCategories()` must be used instead of showing all categories.

### `047_content_pages_main_category.sql`

- Applied to remote.
- Adds `content_pages.main_category_key` for public content listing filters.
- `/admin/content` lets admins assign a type-scoped Main Category.
- `/services`, `/reviews`, `/blog`, and `/promotions` filter content cards by `?category=...`.

### `048_chat_constraints.sql`

- Adds `chat_conversations`, `chat_participants`, `chat_messages`, `chat_attachments` and private `chat-attachments` bucket.
- Message rows stay minimal and are capped at 4,000 characters; longer content must be an attachment.
- Attachment metadata only: JPEG/PNG/WebP <= 5MB, PDF <= 10MB, no base64/inline storage paths.
- Pagination API caps message reads at 50 rows; default initial page is 30 rows.
- No per-message read receipt table; unread state is conversation-level via `chat_participants.last_read_at`.
- DB trigger rate-limits inserts to 10 messages/second per sender; server API also applies the same burst guard.
- RLS allows reads only for conversation participants or platform staff; mutations are intended to go through server APIs so `sender_id` is derived from the authenticated session.

### `056_admin_walkin_fulfillment.sql`

- Adds rental status values `picked_up` and `returned`.
- Creates `walk_in_customers` for phone-primary POS customer records and ID-card metadata.
- Creates `rental_booking_fulfillments` for pickup/return audit events, optional signature storage path, and operator attribution.

### `057_admin_pos_booking_deposits.sql`

- Allows `rental_bookings.user_id` to be null when `walk_in_phone` is present.
- Adds booking-level deposit fields: paid amount, payment method/status, refund status, timestamps, and notes.
- Creates `rental_booking_deposit_proofs` for uploaded payment/refund proof files.
- `GET /api/admin/customers/lookup`, `POST /api/admin/pos/bookings`, and `/admin/pos` all assume this schema.

### `058_rental_booking_atomic_overlap_guard.sql`

- Adds DB-side booking overlap protection for confirmed/picked-up rental rows.
- POS booking creation and admin/customer confirmation paths recheck availability before status changes.

### `059_admin_pos_full_function.sql`

- Adds `admin_user_branch_access`, POS branch metadata, unified payment fields, scanner code indexes, and POS sale support fields.
- Sale mode allows optional customer information; Rental/Booking mode still requires an account or walk-in phone.
- `/admin/pos` uses a segmented Rental/Sale mode control, has branch selection, scanner actions, sale cart, accounting export, and daily history.

### `060_restore_sku_inventory_kind.sql`

- Restores `sku_branch_inventory.inventory_kind` expected by branch-aware sale catalog/inventory logic.
- POS catalog/sale APIs include compatibility fallback for older schemas, but production DBs should apply this migration.

### Chat realtime + client conventions

- Supabase Realtime `postgres_changes` are RLS-filtered server-side; the client must call `supabase.realtime.setAuth(accessToken)` before/while subscribing or no events are delivered. `useChat` does this in `subscribe()` and re-applies on `onAuthStateChange`.
- `@nuxtjs/supabase` v2 `useSupabaseUser()` returns decoded JWT claims, so user id must be resolved as `user.id ?? user.sub` everywhere it is compared with `sender_id`/`customer_id`.
- `useChat` keeps its state in shared `useState` keys so the FAB badge and `/admin/messages` views see the same `conversations`, `messages`, and `unreadEntries` across routes.
- `loadConversations` / `loadMessages` / `loadUnreadCounts` accept a `silent` flag so realtime-driven refreshes do not toggle the full-page loading spinners; only initial loads should run non-silent.
- INSERT events on the channel that is subscribed to a specific conversation auto-call `markRead` (the user is viewing it), so the badge does not bump for messages already on screen. Other conversations bump via `bumpUnreadFor`.
- The user FAB always calls `markRead` on open (idempotent) and pre-positions `scrollTop = scrollHeight` synchronously when `isOpen` flips so the panel paints its first frame at the latest message instead of scrolling visibly.

## Search roadmap against current schema

Detailed guideline: read `SEARCH_AND_FILTER_GUIDELINE.md` before changing search/filter behavior.

Current state:

- `/product-{group}` / `/product-all` / `/product-rental` use in-memory composable data (`useProducts`, `useAssets`) plus `SearchFilters.vue` for category, brand, price, stock, and dynamic filters.
- `/search` uses `useProductSearch()` and Supabase RPC `search_products`; migration `045` prepares DB-level dynamic filter support, with a legacy fallback in older environments. Current remote still has `045` pending.
- Home `CategoriesCard` jumps to `/search?q=<label>` only. Do not send Home shortcut keys as product categories.
- In `/search`, dynamic filters should appear after the user selects a real main category from the filter sidebar.
- Content listing pages (`/services`, `/reviews`, `/blog`, `/promotions`) use typed `main_categories` and `content_pages.main_category_key`; refresh/share state is `?category=...`.

Planned alignment:

1. Stabilize current search/listing filter state: separate selected dynamic values from UI-added groups, avoid URL sync loops, and keep cards visible during transitions.
2. Apply/complete DB-level product dynamic filtering so `/search` pagination and total counts match selected filters (`045`).
3. Evolve `/search` into a multi-type endpoint returning a unified result shape for products, rental assets, services, blogs, reviews, and promotions.
4. Backfill `content_pages.main_category_key` values so content listing filters are useful.
5. Do not make `category_keys` the UI category list source without whitelisting; it contains tags.

## Fast debug checklist

1. Is the user authenticated for customer-owned writes?
2. Does the user have the correct `platform_role` for admin routes?
3. Is the target DB on migrations `029` through `060` for POS/order work? Note: `045` may intentionally remain pending if DB-level `/search` dynamic filtering has not been enabled yet.
4. If search fails on PostgREST, are you using `*term*` wildcards?
5. If asset booking fails, is `asset_id` valid and allowed by the current schema?
6. If booking docs fail to delete cleanly, are `storage_bucket` and `storage_path` present?
7. If admin order list lacks contact info, check both `booker_phone` and account `users.phone`.
8. If a cancelled booking still shows in `/user/rentals`, verify the row is `status = 'cancelled'`.
9. If homepage uploads fail, verify `catalog-media` bucket access and `/api/admin/home-content/upload`.
10. If SVG partner logo upload fails, verify migration `035` reached the remote storage bucket config.
11. If Home carousel cards feel wrong, check `HomeHorizontalRail.vue` first for `UCarousel` item basis, arrows, loop, and autoplay options.
12. If a promotion/service rail is empty, confirm an active `content_pages` row of that type exists and is linked from `/admin/home-content`.
13. If reviews don't appear on a product/asset detail page, confirm the review row is `is_active = true`, has a matching row in `content_page_products` / `content_page_assets`, and that the public select uses `REVIEWS_FOR_PRODUCT_SELECT` or `REVIEWS_FOR_ASSET_SELECT` (a duplicated junction reference will silently return zero rows).
14. If dynamic filter auto-assignment does not appear, confirm the value is in `tag_keys` (not only `search_keywords`), the matching `filter_options.key` is exact/case-sensitive, and the row's `main_category_key` matches the option's group.
15. If tags appear as public categories, check code that reads `category_keys`; whitelist against `main_categories` or static `mainCategories` before rendering category UI.
16. If `/search` filters flicker or disappear after clearing an option, check whether UI-added dynamic groups are being stored only inside active filter values; see `SEARCH_AND_FILTER_GUIDELINE.md`.
17. If POS catalog errors mention `inventory_kind`, apply migration `060` and confirm `sku_branch_inventory` rows exist for the selected branch.
18. If a staff user sees no POS branches/history, check `admin_user_branch_access.can_pos`; `super_admin` bypasses this grant table.

## Cross refs

- `map.md`
- `PROJECT_SUMMARY.md`
- `ADMIN_MVP_ACTION_PLAN.md`
- `ASSET_ACTION_PLAN.md`
