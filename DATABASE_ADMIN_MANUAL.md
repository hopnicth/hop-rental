# Database Admin Manual

Last updated: 2026-04-28
Audience: internal staff, data-entry, developers

## Purpose

Practical guide for what data must exist before products/assets can go live.
This is an operational setup guide, not a schema transcript.

## Role note

In this document:

- internal admin = HOPNIC `staff` or `super_admin`
- organization admin = customer-side `b2b_admin`
- `/admin/home-content` remains `super_admin` only

## Environment requirement

Admin write flows depend on:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SECRET_KEY`

Notes:

- Keep the secret key server-only.
- Admin pages may degrade to read-only if the server key is missing.
- Restart Nuxt after `.env` changes.

## Setup order for a new rentable item

1. Confirm `main_categories` has the right primary category
2. Create the `products` row
3. Create at least one `product_skus` row
4. Ensure the target `store_branches` row exists and is active
5. Ensure inventory pools exist if stock will be tracked immediately
6. Create the `assets` row
7. Add `asset_matches` if the asset should appear under product detail
8. Verify storefront pages:
   - `/product-{group}/{slug}`
   - `/product-rental`
   - `/asset/{slug}`

## Tables admins usually edit

| Table                  | Purpose                           | Admin edits directly? |
| ---------------------- | --------------------------------- | --------------------- |
| `main_categories`      | typed category registry           | Yes (`super_admin`)   |
| `products`             | sale catalog root                 | Yes                   |
| `product_skus`         | pricing + SKU metadata            | Yes                   |
| `store_branches`       | hubs / pickup locations           | Yes                   |
| `inventories`          | inventory pools per branch        | Yes                   |
| `sku_branch_inventory` | stock rows per inventory          | Yes                   |
| `assets`               | public rental offering            | Yes                   |
| `asset_matches`        | asset ↔ product links             | Yes                   |
| `home_*` tables        | homepage curation                 | Yes (`super_admin`)   |
| `content_pages`        | blog/service/promotion/review CMS | Yes                   |

## System-managed tables

| Table                    | Purpose                    | Edit manually?   |
| ------------------------ | -------------------------- | ---------------- |
| `inventory_change_log`   | stock audit trail          | No               |
| `rental_bookings`        | booking transactions       | Usually no       |
| `orders` / `order_items` | sale transactions          | Usually no       |
| `addresses`              | customer/company addresses | No catalog setup |

## Minimum publish checklist

### Product

- [ ] `slug` is correct
- [ ] `main_category_key` is valid
- [ ] `tag_keys` describe filterable facets, not duplicate the main category
- [ ] `search_keywords` contain only synonyms/aliases not already in name/brand/tags
- [ ] product is public (`is_hidden = false`)
- [ ] at least one usable SKU exists
- [ ] shipping size is set correctly

### SKU / stock

- [ ] sale price is correct
- [ ] rental pricing is correct if rentable
- [ ] at least one `sku_branch_inventory` row exists when stock tracking is needed
- [ ] target branch is active

### Asset

- [ ] `code` and `slug` are stable and correct
- [ ] `main_category_key`, `tag_keys`, and `search_keywords` follow catalog search rules
- [ ] asset is public (`status = 'active'`, `is_hidden = false`)
- [ ] daily/deposit pricing is correct
- [ ] min rental days is correct
- [ ] description/spec explain what is included
- [ ] add `asset_matches` if product-detail discoverability is required

## Setup order for a homepage promotion or service card

The home-rail promotion/service cards are pure references to `content_pages`.
There is no longer a way to type a title/excerpt/image directly on a card.

1. Open `/admin/content` and create a `content_pages` row of type `promotion` or `service`
2. Fill the localized title/excerpt/cover image and mark it active
3. Open `/admin/home-content` and use **Add promotion card** or **Add service card**
4. Pick the content page from the picker; the rail card derives title, excerpt, image, and `/services/{slug}` or `/promotions/{slug}` link from it live
5. To remove a card from the rail, delete the home-content card (the source page stays); to remove the page everywhere, delete the `content_pages` row (the linked card cascades)

## Setup order for content listing filters

Use this for `/services`, `/reviews`, `/blog`, and `/promotions`.

1. Open `/admin/main-categories`
2. Create or edit a category with the matching entity type enabled (`service`, `review`, `blog`, or `promotion`)
3. Open `/admin/content`
4. Set the page Type first, then choose **Main category** from the type-scoped dropdown
5. Save the page and verify the public listing with `?category=<main_category_key>`

Notes:

- Migration `047_content_pages_main_category.sql` is applied on remote.
- Category matching is exact by `main_category_key`; unassigned content appears only under All.
- Admin labels should remain English even when public labels are localized.

## Important current rules

- `main_categories` is the typed category source of truth. Use `entity_types` to scope categories to product, asset, service, promotion, blog, and/or review.
- `category_keys` is derived/catalog-facing. Admin/AI should fill `main_category_key`, `tag_keys`, and `search_keywords` instead of manually mixing meanings into `category_keys`.
- Use `search_keywords` only for natural-language aliases, spelling variants, Thai/English synonyms, and customer wording. Do not duplicate code, slug, exact name, brand, main category, or tag values.
- Assets can be booked with `asset_id` alone in newer schemas.
- `asset_matches` are recommended for discoverability but are not always required for booking.
- Stock should be managed through admin endpoints, not direct DB writes, so audit logs remain correct.
- Booking docs/checklists are stored separately from asset-level docs.
- Homepage promotion/service rails read live data from `content_pages`; do not edit `home_link_cards` text fields directly.
- Home category-card options are managed separately from content pages in `/admin/home-categories`; storefront selection sends only `/search?q=...`.

## Migration-sensitive notes

- `029` adds rental pricing breakdown persistence
- `030` adds shipping size + shipping breakdown
- `031` allows asset-only bookings
- `032` adds sale-order tracking support
- `033` adds booking-doc storage metadata + booker name/phone
- `036` introduces `content_pages` for blog/service/promotion CMS
- `037` switches `content_pages.blocks` to a localized TipTap document
- `038` adds `home_link_cards.content_page_id` and drops unlinked legacy rows
- `044` adds DB-backed Home category-card groups/options
- `046` adds typed `main_categories.entity_types`
- `047` adds `content_pages.main_category_key` for content listing filters

## Related docs

- `map.md`
- `API_INDEX.md`
- `ADMIN_MVP_ACTION_PLAN.md`
- `ASSET_ACTION_PLAN.md`
