<!-- STALENESS WARNING: predates migrations 118-143 / minimal-launch — verify against decisions.md + the T-LAUNCH design doc before relying. -->
# Database Admin Manual

Last updated: 2026-05-11
Audience: internal staff, data-entry, developers

## Purpose

Practical guide for what data must exist before products/assets can go live.
This is an operational setup guide, not a schema transcript.

## Role note

In this document:

- internal admin = HOPNIC `staff` or `super_admin`
- organization admin = customer-side `b2b_admin`
- `/admin/home-content` remains `super_admin` only

Backoffice access is controlled by `public.users.platform_role` only.
Customer-company access is controlled separately by `public.company_members.role`.
Do not treat `b2b_admin` as HOPNIC backoffice access.

## Role administration quick reference

### Platform roles for `/admin`

Use `public.users.platform_role`:

| Value         | Use                                                           |
| ------------- | ------------------------------------------------------------- |
| `customer`    | Normal storefront/customer account; no `/admin` access        |
| `staff`       | Internal HOPNIC staff; can access most admin/POS pages        |
| `super_admin` | Internal highest privilege; can access super-admin-only pages |

Check role by email:

```sql
select au.email, au.id, u.platform_role
from auth.users au
left join public.users u on u.id = au.id
where lower(au.email) = lower('hopnic.th@gmail.com');
```

Ensure the `public.users` row exists:

```sql
insert into public.users (id, full_name, avatar_url)
select
  au.id,
  coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name'),
  au.raw_user_meta_data ->> 'avatar_url'
from auth.users au
where lower(au.email) = lower('hopnic.th@gmail.com')
on conflict (id) do nothing;
```

Grant super admin:

```sql
update public.users
set platform_role = 'super_admin'
where id = (
  select id from auth.users
  where lower(email) = lower('hopnic.th@gmail.com')
);
```

Grant staff:

```sql
update public.users
set platform_role = 'staff'
where id = (
  select id from auth.users
  where lower(email) = lower('staff@example.com')
);
```

Revoke backoffice access:

```sql
update public.users
set platform_role = 'customer'
where id = (
  select id from auth.users
  where lower(email) = lower('user@example.com')
);
```

### Organization roles for B2B

Use `public.company_members.role`:

| Value       | Use                             |
| ----------- | ------------------------------- |
| `b2b_user`  | Company member                  |
| `b2b_admin` | Company-side organization admin |

Check memberships:

```sql
select au.email, c.id as company_id, c.name as company_name, cm.role
from auth.users au
join public.company_members cm on cm.user_id = au.id
join public.companies c on c.id = cm.company_id
where lower(au.email) = lower('user@example.com');
```

Add/update membership:

```sql
insert into public.company_members (user_id, company_id, role)
values (
  (select id from auth.users where lower(email) = lower('member@example.com')),
  '<COMPANY_ID>',
  'b2b_user'
)
on conflict (user_id, company_id)
do update set role = excluded.role;
```

Promote to organization admin:

```sql
update public.company_members
set role = 'b2b_admin'
where user_id = (
  select id from auth.users
  where lower(email) = lower('admin@example.com')
)
and company_id = '<COMPANY_ID>';
```

Remove membership:

```sql
delete from public.company_members
where user_id = (
  select id from auth.users
  where lower(email) = lower('member@example.com')
)
and company_id = '<COMPANY_ID>';
```

### Debug `/admin` redirect in development

If a known admin is redirected to `/user/account`:

1. Open `/api/user` in the same browser session.
2. Confirm `profile.platform_role` is `staff` or `super_admin`.
3. If `/api/user` returns `401`, auth cookies are not reaching Nitro; restart Nuxt and verify local cookie settings.
4. If `/api/user` is correct but `/admin` redirects, restart `npm run dev`, clear localhost site data, and sign in again.

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

| Table                      | Purpose                    | Edit manually?         |
| -------------------------- | -------------------------- | ---------------------- |
| `inventory_change_log`     | stock audit trail          | No                     |
| `rental_bookings`          | booking transactions       | Usually no             |
| `orders` / `order_items`   | sale transactions          | Usually no             |
| `addresses`                | customer/company addresses | No catalog setup       |
| `admin_user_branch_access` | staff POS branch grants    | Use Super Admin UI/API |

## Rental operations tables

| Table                           | Purpose                                               | Edit manually?            |
| ------------------------------- | ----------------------------------------------------- | ------------------------- |
| `walk_in_customers`             | phone-primary POS customer records + ID-card metadata | Through `/admin/pos` only |
| `rental_booking_fulfillments`   | pickup/return audit trail + signature metadata        | No                        |
| `rental_booking_deposit_proofs` | uploaded deposit/refund proof files                   | No                        |

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

## Setup order for a POS / walk-in rental

1. Open `/admin/pos` (or `/admin/walk-in`, which redirects there)
2. Search by phone or customer UUID; if no account exists, enter a walk-in phone + full name
3. Capture the customer's ID card before pickup; this stores a `walk_in_customers` row when needed
4. Select an active, non-hidden asset with a valid daily rental rate
5. Choose dates in the shared rental calendar; it blocks overlapping dates and enforces the asset's `min_rental_days` / `max_rental_days`
6. Record the deposit amount and payment method; attach a proof file if ops policy requires it
7. Create the booking; POS inserts it directly as `status = 'confirmed'`
8. At handover, confirm pickup from POS so a `rental_booking_fulfillments` row is written and the booking moves to `picked_up`
9. At return, confirm return from POS so another fulfillment row is written and the booking moves to `returned`

Notes:

- POS rental uses the same calendar/pricing logic as storefront booking, but intentionally passes `bufferDays = 0` so front-desk staff are not blocked by storefront lead buffers.

## Setup order for a POS sale

1. Confirm the staff user has POS access to the target branch, or use `super_admin`
2. Open `/admin/pos`, choose **Sale Mode**, and select the branch
3. Customer info is optional; use **Scan Customer** inside `1) Customer info (Optional)` only when a customer profile should be linked
4. Search/scan sale SKUs; ensure `sku_branch_inventory` has a row for the selected branch
5. Record payment method/status/amount, then create the sale
6. Check **POS Transaction History** by date/branch for the daily summary and reconciliation
7. Only `super_admin` can void/cancel a POS history row; stock reversal still requires the operational stock adjustment process

## Setup order for a homepage promotion or service card

The home-rail promotion/service cards are pure references to `content_pages`.
There is no longer a way to type a title/excerpt/image directly on a card.

1. Open `/admin/content` and create a `content_pages` row of type `promotion` or `service`
2. Fill the localized title/excerpt/cover image and mark it active; if it is a `service` page, also fill provider phone/email/Google Maps and optional Line ID / Line URL when the public page should show contact CTAs
3. Open `/admin/home-content` and use **Add promotion card** or **Add service card**
4. Pick the content page from the picker; the rail card derives title, excerpt, image, and `/services/{slug}` or `/promotions/{slug}` link from it live
5. To remove a card from the rail, delete the home-content card (the source page stays); to remove the page everywhere, delete the `content_pages` row (the linked card cascades)

## Setup order for a homepage hero banner

1. Open `/admin/home-content`
2. In **Create banner**, fill localized title/subtitle/CTA fields
3. Upload or paste the required desktop banner image into `image_url`
4. Upload or paste a phone-specific banner image into `mobile_image_url` if the crop for small screens should differ
5. If `mobile_image_url` is left empty, the storefront uses the desktop image as fallback on phones
6. Set `link_url`, `link_target`, `sort_order`, and active state
7. Save and verify `/` on both desktop and mobile widths

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
- `rental_bookings` must now satisfy `user_id IS NOT NULL OR walk_in_phone IS NOT NULL`.
- POS catalog reads only active, non-hidden assets with `daily_enabled = true` and `daily_rate > 0`.
- POS sale catalog reads sale SKUs from the selected branch; `inventory_kind` should exist on `sku_branch_inventory` after migration `060`.
- Sale mode customer fields are optional; Rental/Booking mode still requires a customer account or walk-in phone.
- POS customer ID-card files are stored privately under `kyc-documents`; admin viewing must use signed URLs. Deposit proofs and pickup signatures use operational storage paths under the media/document storage configured by their endpoints.
- POS pickup/return are operational events, not generic status edits; use the dedicated POS or admin booking endpoints so audit rows stay intact.
- Stock should be managed through admin endpoints, not direct DB writes, so audit logs remain correct.
- Booking docs/checklists are stored separately from asset-level docs.
- Homepage hero banners support a required desktop image plus an optional mobile-specific image; use the mobile field when the phone crop needs different artwork.
- Homepage promotion/service rails read live data from `content_pages`; do not edit `home_link_cards` text fields directly.
- Service pages can expose provider phone/email/Google Maps and optional Line contact. Prefer storing `line_id` when you only know the handle; if you store `line_url`, keep it as an HTTPS `line.me` / `lin.ee` URL.
- Home category-card options are managed separately from content pages in `/admin/home-categories`; desktop sub-option selection sends `/search?q=...`, while mobile group icon cards use real `mainCategoryKey` values in `/search?category=...`.

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
- `056` adds walk-in customer capture and rental fulfillment audit events
- `057` adds POS booking deposit fields + deposit proof storage
- `058` adds atomic rental booking overlap protection
- `059` adds full admin POS branch/sale/payment/scanner support
- `060` restores `sku_branch_inventory.inventory_kind` for POS sale inventory logic
- `066` adds `service_providers.line_id` / `line_url` for service-page contact actions

## Related docs

- `map.md`
- `API_INDEX.md`
- `ADMIN_MVP_ACTION_PLAN.md`
- `ASSET_ACTION_PLAN.md`