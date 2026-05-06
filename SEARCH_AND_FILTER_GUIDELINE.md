# Search & Filter Guideline

Last updated: 2026-04-29
Audience: developers, QA, future Augment sessions

## Purpose

This document defines how HOP search and storefront filters should evolve from
the current product-focused implementation into a multi-type search surface.
Use it before changing `/search`, `SearchFilters.vue`, dynamic filters, or admin
category/filter management.

## Current decision for the near-term fix

- Home category-card selections should route to `/search?q=...` only.
- Home should **not** send a product `category`, `main`, or Home shortcut key.
- On `/search`, dynamic filters should appear only after the customer selects a
  real main category from the filter sidebar.
- Selecting a main category in `/search` may update URL query state, but it must
  not cause a full page remount/flicker.

## Current Universal Search implementation

The public search experience now has two surfaces:

1. Header quick search dropdown (`SearchBar.vue`) with a `Search in` tab bar.
2. Full search page (`/search`) with scope tabs and persistent filters.

Both surfaces support these scopes:

- `all`
- `product`
- `rental`
- `service`
- `review`
- `blog`
- `promotion`

`/search` stores the selected scope in `?scope=...`. When no text query or
active filter is present, `/search` behaves as **Browse Mode** instead of a
failed search state: it shows browsable/default items and helper copy. Once a
text query or filter is active, it switches to **Search Mode** and may show the
normal no-results empty state.

Product filters remain visible for every `/search?scope=...` view because the
current UX decision is to keep filters discoverable across scopes. Be careful
when adding non-product facets later: the current filter component still applies
product-oriented filters to product result counts and product search RPC calls.

## Searchable types

The global search experience searches or browses these types:

| Type                | Source                                     | Public target             | Category model                                    |
| ------------------- | ------------------------------------------ | ------------------------- | ------------------------------------------------- |
| Product for sale    | `products`                                 | `/product-{group}/{slug}` | product main categories + dynamic filters         |
| Rental tool / asset | `assets`                                   | `/asset/{slug}`           | asset/tool categories + dynamic filters           |
| Service             | `content_pages.content_type = 'service'`   | `/services/{slug}`        | service categories, not always product categories |
| Blog                | `content_pages.content_type = 'blog'`      | `/blog/{slug}`            | editorial categories/tags                         |
| Review              | `content_pages.content_type = 'review'`    | `/reviews/{slug}`         | review categories + linked products/assets        |
| Promotion           | `content_pages.content_type = 'promotion'` | `/promotions/{slug}`      | campaign/promotion categories                     |

Current implementation uses a single typed `main_categories` registry with
`entity_types` to scope categories by domain. Do not show all categories
everywhere: public/admin category pickers must filter by the current type
(`product`, `asset`, `service`, `promotion`, `blog`, or `review`).

## Recommended future search contract

Future search should return a unified result shape:

| Field         | Meaning                                                      |
| ------------- | ------------------------------------------------------------ |
| `id`          | Source row id                                                |
| `type`        | `product`, `asset`, `service`, `blog`, `review`, `promotion` |
| `title`       | Localized title/name                                         |
| `excerpt`     | Localized short description/body excerpt                     |
| `imageUrl`    | Cover/card image                                             |
| `url`         | Public target path                                           |
| `score`       | Search rank                                                  |
| `categoryKey` | Type-specific category key, if any                           |
| `tags`        | Search/display tags                                          |
| `metadata`    | Type-specific light metadata                                 |

Prefer a server endpoint such as `GET /api/search` or `POST /api/search` over a
large client-only search. The endpoint should own ranking, pagination, result
type filtering, and facet counts.

## Category and filter principles

1. Category keys are scoped by searchable type through `main_categories.entity_types`.
2. Product/asset dynamic filters remain tied to `filter_groups.main_category_key`.
3. Content pages use `content_pages.main_category_key` for listing-page filters.
4. URL query should store active search state, not transient UI-only state.
5. Public category dropdowns must never render raw `category_keys` directly;
   those arrays contain `[main_category_key] + tag_keys`.

## Catalog keyword rules for admin/AI

Use these rules when creating or cleaning product/asset data:

| Field               | Purpose                                                                  | Do not put here                                                               |
| ------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `main_category_key` | One primary typed category for the row                                   | Multiple categories, free-text keywords                                       |
| `tag_keys`          | Stable filter/facet tags such as material, application, package type     | Full search phrases, duplicate main category                                  |
| `category_keys`     | Derived/search helper array: `[main_category_key] + tag_keys`            | Manual AI/admin edits unless backfilling legacy data                          |
| `search_keywords`   | Synonyms, aliases, typo/spelling variants, Thai/English customer wording | Exact code, slug, product/asset name, brand, main category, or tag duplicates |

For AI-assisted cleanup, prefer adding fewer high-signal `search_keywords` over
many broad words. If a phrase should become a clickable/filterable facet, promote
it to `tag_keys` instead of keeping it only as a search keyword.

## Dynamic filter state model

Separate these concepts:

- `selectedDynamicFilters`: values that affect results and may be persisted in
  URL query, e.g. `{ groupId: ['optionId'] }`.
- `addedDynamicGroupIds`: UI state for which optional filter blocks are visible.

Clear and remove must behave differently:

- `Clear` empties a group's value but keeps the block visible.
- `X` removes the optional block and clears its value.
- Pinned groups such as `sub_category` stay visible while a category context is
  active and should not count as active unless they have a selected value.

## URL persistence rules

URL is the refresh/back/share source of truth for active filters:

| Query        | Meaning                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------- |
| `q`          | Text search                                                                                  |
| `scope`      | Active result scope: `all`, `product`, `rental`, `service`, `review`, `blog`, or `promotion` |
| `category`   | Real selected category for the current result type/context                                   |
| `type`       | Optional result/catalog type filter                                                          |
| `brands`     | Repeated or comma-separated brand values                                                     |
| `min`, `max` | Price bounds                                                                                 |
| `stock`      | `1` for in-stock only                                                                        |
| `df`         | JSON-encoded active dynamic filter values                                                    |

When code updates the URL itself, route watchers must not immediately re-apply
the same query and trigger duplicate loading. Guard query sync with explicit
`isApplyingRouteQuery` / `isSyncingToQuery` style flags.

## Loading and no-flicker rules

- Keep previous cards visible while filtering/searching if previous results exist.
- Use skeletons only for initial empty loading states.
- Add a lightweight progress bar/overlay for refetch/filter transitions.
- If a loading indicator is shown, keep it visible for at least 0.5 seconds.
- For very fast operations, prefer a short show delay before displaying loading
  to avoid unnecessary flicker.

## Browse Mode rules

- Empty `/search` and `/search?scope=...` should not say "no results".
- Show browse/helper copy until the customer types a query or chooses a filter.
- Product scope may show the product catalog/default RPC results.
- Rental scope may show available assets filtered client-side from `useAssets()`.
- Content scopes fetch active rows from `content_pages` through
  `fetchContentPages()` when there is no query, and use `searchContentPages()`
  when `q` is present.
- Only show the true no-results state after there is search intent
  (`q` or an active filter).

## Admin implications

Current `/admin/main-categories` supports type-scoped categories through
`entity_types`. A category may belong to one or more domains, for example
`product`, `asset`, `service`, `promotion`, `blog`, or `review`.

Future admin model should support:

1. Catalog main categories for products/assets.
2. Search/content categories scoped by content type through `entity_types`.
3. Search result type visibility and sort priority.
4. Optional per-type facet definitions.
5. Synonyms/search keywords for each result type.

Do not treat `main_categories` as product-only. Always pass the relevant
`entityType` to `/api/main-categories` or `useMainCategories()`.

## Implementation phases

1. Stabilize current product/search filters: separate UI-added groups from
   selected values, fix URL sync loops, and avoid flicker. **Done for current UI.**
2. Apply/complete DB-level product dynamic filtering for `/search` so pagination
   and total counts are correct. Migration `045` is prepared but still pending
   remote apply.
3. Add assets/rental results to search using a unified result shape. **Partially done client-side.**
4. Add `content_pages` search for services, blogs, reviews, and promotions. **Done client-side.**
5. Content listing filters are already wired through migration `047`:
   `/services`, `/reviews`, `/blog`, and `/promotions` read typed
   `main_categories` and persist `?category=...` in the URL.
6. Future improvement: replace the hybrid client/RPC implementation with one
   server-owned global search endpoint/RPC for ranking, pagination, and facets.
