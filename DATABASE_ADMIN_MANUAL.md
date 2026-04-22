# Database Admin Manual

Last updated: 2026-04-22
Audience: internal staff/data-entry + developers who need a practical setup guide

## Purpose

This manual explains the important data that must be prepared so the storefront can sell products and accept rental bookings correctly.

Focus areas:

- what admin should create manually
- what fields are required vs recommended
- what must be configured before a product/rental item can go live
- what tables are system-managed and should usually **not** be created manually

## Role naming note for this manual

In this document:

- **internal admin / internal staff** means HOPNIC `staff` or `super_admin`
- **organization admin** means customer-side `b2b_admin`
- **organization member** means customer-side `b2b_user`

Important boundary:

- `b2b_admin` is for customer-organization approvals/management
- `staff` and `super_admin` are for HOPNIC internal backoffice work

See `ROLE_MATRIX.md` for the canonical role matrix.

## Admin API environment requirement

Internal admin routes under `/admin` and `/api/admin/*` use privileged server-side
Supabase access for HOPNIC backoffice operations.

Required local/server env:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SECRET_KEY` recommended
- or `SUPABASE_SERVICE_KEY` as a deprecated fallback

Important notes:

- `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_KEY` must stay server-only and must
  never be exposed to the browser.
- Without the server-only key, admin pages now fall back to read-only mode where
  possible and show setup warnings instead of failing with a raw 500.
- Create/edit actions for products, SKUs, rental accesses, and matches still
  require the server-only key.
- After changing `.env`, restart the Nuxt dev server.

## Quick setup order

Use this order when preparing a new rentable item:

1. Create `public.products`
2. Create at least 1 `public.product_skus` row under the product
3. Make sure pickup hub/store config exists and is active
4. Create `public.rental_accesses`
5. Create `public.rental_access_matches` from rental access -> product
6. Validate storefront pages:
   - `/product-{group}/{slug}`
   - `/product-rental`
   - `/rental-access/{slug}`

## Set / package convention (current decision)

Current agreed direction for this branch:

- `rental_access` can be used as a **set / package / commercial offering**.
- Use `category_keys` on `rental_accesses` to group or classify the set.
- Do **not** require a business concept of anchor/primary product for the set.
- Use `rental_access_matches` as the membership relation from set -> related products.
- The same product may appear in multiple sets.

### Important technical note

Even though the business model does not require an anchor product, the current booking implementation still depends on product/SKU references for compatibility.

That means each bookable rental access should still have:

- at least 1 matched product in `rental_access_matches`
- at least 1 usable SKU under that matched product

This is a **technical compatibility rule**, not a business rule about which item is the primary item in the set.

## Which tables admin should care about

| Table                                  | Who usually creates it                        | Purpose                            | Admin should edit directly? |
| -------------------------------------- | --------------------------------------------- | ---------------------------------- | --------------------------- |
| `public.products`                      | internal staff/import                         | sale catalog root                  | Yes                         |
| `public.product_skus`                  | internal staff/import                         | price/stock/rental pricing per SKU | Yes                         |
| `public.rental_accesses`               | internal staff                                | public rental offering             | Yes                         |
| `public.rental_access_matches`         | internal staff                                | links rental access to product     | Yes                         |
| `public.rental_bookings`               | system                                        | customer booking transactions      | Usually no                  |
| `public.orders` / `public.order_items` | system                                        | sale checkout submissions          | Usually no                  |
| `public.addresses`                     | customer/user/organization admin              | delivery addresses                 | No catalog setup            |
| store/hub master                       | currently code-backed in `app/mock/stores.ts` | pickup/return locations            | Not DB-backed yet           |

## 1. Product setup — `public.products`

### Purpose

`products` is the main sale catalog root. Product detail pages, search, category browse, and product-based rental handoff all depend on it.

### Minimum required fields

- `id` — stable text key
- `slug` — unique URL slug
- `type` — catalog type used by the storefront
- `name_th`, `name_en`
- `description_th`, `description_en`
- `category_keys` — include the main route group key the storefront should use
- `thumbnail_url`
- `is_hidden = false` if it should be publicly visible

### Strongly recommended fields

- `name_cn`, `name_jp`
- `description_cn`, `description_jp`
- `brand`
- `image_urls`
- `spec`
- `documents`
- `supplier_ids`
- `store_location_ids` when the product can be rented
- rental rule fields:
  - `rental_min_days`
  - `rental_max_days`
  - `rental_buffer_days`

### Important notes

- The route pattern is `/product-{category_keys[0]}/{slug}`.
- If `category_keys[0]` is wrong, the product card URL can be wrong.
- If the product has no usable SKU rows, the storefront product mapping becomes invalid.
- `is_hidden = true` means public catalog queries will not show the product.

## 2. Product SKU setup — `public.product_skus`

### Purpose

Each product must have at least one SKU. SKU rows own pricing, stock, rental pricing, and SKU-specific media.

### Minimum required fields

- `id`
- `product_id`
- `label_th`, `label_en`
- `price`
- `stock`
- `rental_deposit`
- `rental_daily`
- `rental_weekly`
- `rental_monthly`
- `rental_stock`
- `reserved_stock`

### Strongly recommended fields

- `label_cn`, `label_jp`
- `image_url`
- `image_urls`
- `attributes`
- `original_price`
- `discount_percent`

### Important notes

- At least 1 SKU is required for the product to work correctly.
- Sale add-to-cart depends on `price` and `stock`.
- Rental availability depends on `rental_stock` together with booking counts.
- If the item is sale-only, rental price fields can stay `0`.
- If the item is rentable, rental pricing fields should be meaningful; otherwise booking totals will be wrong or misleading.

## 3. Hub / store config

### Current source of truth

Right now pickup hubs are **not yet DB-backed** in this storefront branch. The UI reads active hub options from:

- `app/mock/stores.ts`

Each store includes:

- `id`
- localized `name`
- `shortCode`
- localized `address`
- `phone`
- localized `operatingHours`
- `mapUrl`
- `isActive`

### Important notes

- Rental submit from `/user/cart` requires a selected hub.
- If there are no active hubs, rental submit will be blocked.
- Product rental capability still references `store_location_ids` on `products`, so store IDs should stay consistent with the hub IDs used by the UI.

## 4. Rental access setup — `public.rental_accesses`

### Purpose

`rental_accesses` is the public rental offering layer. Customers browse rental access cards on `/product-rental` and on related product detail pages.

This can also represent a:

- single rentable item
- grouped solution
- package
- set of related equipment

### Minimum required fields

- `code` — unique business code
- `slug` — unique URL slug for `/rental-access/{slug}`
- `status = 'active'` for public use
- `name_th`, `name_en`
- `description_th`, `description_en`
- `category_keys`
- `daily_rate`
- `deposit_amount`
- `min_rental_days`
- `is_hidden = false`

### Strongly recommended fields

- `name_cn`, `name_jp`
- `description_cn`, `description_jp`
- `brand`
- `category_keys` that clearly describe the set/grouping
- `thumbnail_url`
- `image_urls`
- `spec_summary`
- `weekly_rate`, `monthly_rate`
- `max_rental_days`, `buffer_days`
- `storage_location_code`, `storage_location_note`
- `service_cycle_value`, `service_cycle_unit`
- `last_serviced_at`, `next_service_due_at`
- `sort_order`

### Important notes

- Public browse should only use rows that are both `status = 'active'` and `is_hidden = false`.
- `code` should be stable and staff-friendly because it is snapped into booking rows.
- `slug` changes will change the public URL.
- `spec_summary` should be a JSON object, not an array/string payload.
- If this rental access is being used as a set/package, the `description` and `spec_summary` should explain what is included in the set.

## 5. Rental access -> product mapping — `public.rental_access_matches`

### Purpose

This table controls where a rental access appears under product detail and which product attribution is kept when a customer books.

For set/package usage, treat this table as the membership list of products related to the set.

### Minimum required fields

- `rental_access_id`
- `product_id`

### Strongly recommended fields

- `sort_order`
- `match_type`
- `note`

### Important notes

- Without a match row, the rental access may still be reachable directly from `/product-rental`, but it will not appear under the related product detail page.
- Multiple products can point to one rental access, but each `(rental_access_id, product_id)` pair must be unique.
- The same product can belong to many rental access sets/packages.
- There is currently no required business meaning that one matched product must be marked as the primary product.
- However, the current booking flow still expects at least one matched product path to remain usable.

## 6. System-managed tables — usually do not seed manually

### `public.rental_bookings`

Created by the storefront booking flow.

Current lifecycle:

- `draft` = staged in `/user/cart`
- `confirmed` = submitted from `/user/cart`
- `cancelled` = no longer active

Important notes:

- Newer environments support `rental_access_id` + access snapshot fields.
- Older environments may still work through the app's legacy-schema fallback.
- Do not manually insert fake `rental_access_id` values; it must be a valid UUID.

### `public.orders` + `public.order_items`

Created by sale checkout submit.

Important notes:

- `checkout_mode = 'payment'` requires a payment method.
- `checkout_mode = 'quotation'` requires `payment_method = null`.

### `public.addresses`

Created by customers or organization admins.

Important notes:

- An address must belong to either `user_id` or `company_id`.
- `is_default` is auto-normalized so only one default address remains per owner.

## 7. Publish checklist for a new rentable item

- [ ] Product row exists and is public (`is_hidden = false`)
- [ ] Product has at least 1 SKU row
- [ ] SKU sale/rental pricing is correct
- [ ] SKU stock/rental stock is correct
- [ ] Product category keys are correct for route generation
- [ ] Hub/store IDs used by the product are valid in the current hub master
- [ ] Rental access row exists and is public (`status = active`, `is_hidden = false`)
- [ ] Rental access categories/grouping reflect the intended set/package placement
- [ ] Rental access has thumbnail, pricing, min rental days, and business code
- [ ] Rental access description/spec summary clearly explains what is included when sold as a set/package
- [ ] Rental access is matched to the correct product
- [ ] Product detail shows related rental access card(s)
- [ ] `/rental-access/{slug}` opens correctly

## 8. Current branch caveats

- The storefront still supports a fallback mode when `rental_accesses` or newer booking columns are missing from the DB schema.
- That fallback keeps the app usable, but the preferred production path is to apply migration `013_rental_access_schema.sql`.
- Internal admin pages `/admin/rental-accesses` and `/admin/matches` also depend on migration `013_rental_access_schema.sql`; if those pages show missing-table errors, check the remote migration state first.
- Hub/store master data is still code-backed, so operational changes to hubs currently require a code/config update, not only a DB change.
