# Database Admin Manual

Last updated: 2026-04-27
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

| Table | Purpose | Admin edits directly? |
| --- | --- | --- |
| `main_categories` | primary product category registry | Yes (`super_admin`) |
| `products` | sale catalog root | Yes |
| `product_skus` | pricing + SKU metadata | Yes |
| `store_branches` | hubs / pickup locations | Yes |
| `inventories` | inventory pools per branch | Yes |
| `sku_branch_inventory` | stock rows per inventory | Yes |
| `assets` | public rental offering | Yes |
| `asset_matches` | asset ↔ product links | Yes |
| `home_*` tables | homepage curation | Yes (`super_admin`) |

## System-managed tables

| Table | Purpose | Edit manually? |
| --- | --- | --- |
| `inventory_change_log` | stock audit trail | No |
| `rental_bookings` | booking transactions | Usually no |
| `orders` / `order_items` | sale transactions | Usually no |
| `addresses` | customer/company addresses | No catalog setup |

## Minimum publish checklist

### Product
- [ ] `slug` is correct
- [ ] `main_category_key` is valid
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
- [ ] asset is public (`status = 'active'`, `is_hidden = false`)
- [ ] daily/deposit pricing is correct
- [ ] min rental days is correct
- [ ] description/spec explain what is included
- [ ] add `asset_matches` if product-detail discoverability is required

## Important current rules

- `main_categories` is the source of truth for primary product category.
- Assets can be booked with `asset_id` alone in newer schemas.
- `asset_matches` are recommended for discoverability but are not always required for booking.
- Stock should be managed through admin endpoints, not direct DB writes, so audit logs remain correct.
- Booking docs/checklists are stored separately from asset-level docs.

## Migration-sensitive notes

- `029` adds rental pricing breakdown persistence
- `030` adds shipping size + shipping breakdown
- `031` allows asset-only bookings
- `032` adds sale-order tracking support
- `033` adds booking-doc storage metadata + booker name/phone

## Related docs

- `map.md`
- `API_INDEX.md`
- `ADMIN_MVP_ACTION_PLAN.md`
- `ASSET_ACTION_PLAN.md`
