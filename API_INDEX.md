# API Index

Last updated: 2026-04-22
Audience: developers, QA, future Augment sessions

## Purpose

This index maps the main storefront flows to their composables, tables, and important compatibility notes.

This app is currently **Supabase-first**, so the practical API surface is mostly:
- Nuxt composables calling Supabase directly
- Supabase tables protected by RLS
- page routes that trigger these read/write flows

## Conventions

- Public catalog reads are allowed through RLS on visible rows.
- Customer-owned writes require authentication and pass through `auth.uid()` policies.
- Some flows include compatibility fallback for older DB schemas.

## 1. Read flows

| Feature | Entry pages | Main file(s) | Reads from | Notes |
| --- | --- | --- | --- | --- |
| Product catalog browse | `/`, `/product-{group}` | `app/composables/useProducts.ts` | `products` (+ nested `product_skus`) | Falls back to mapped mock catalog if remote data is unusable. Product route uses `category_keys[0]` + `slug`. |
| Product detail | `/product-{group}/{slug}` | `app/pages/product-[group]/[id].vue`, `useProducts.ts` | `products`, `product_skus` | Also loads related rental access cards through `useRentalAccesses()`. |
| Rental access listing | `/product-rental` | `app/composables/useRentalAccesses.ts`, `app/pages/product-[group]/index.vue` | `rental_accesses`, `rental_access_matches` | If rental-access schema is missing, app falls back to product-derived rental access rows. |
| Rental access detail | `/rental-access/{slug}` | `app/pages/rental-access/[slug].vue`, `useRentalAccesses.ts` | `rental_accesses`, `rental_access_matches`, product catalog | Primary booking entry for rental access flow. |
| Cart hydration | `/user/cart`, feature bar | `app/composables/useCart.ts` | `carts`, `cart_items` | Guest state can exist locally. Logged-in state hydrates from Supabase. |
| Booking hydration | `/user/cart`, `/user/rentals`, feature bar | `app/composables/useBooking.ts` | `rental_bookings` | Store exposes `draftBookings`, `confirmedBookings`, `activeBookings`, and availability helpers. |
| Orders history | `/user/orders` | `app/composables/useOrders.ts` | `orders` | Reads authenticated user's orders ordered by `created_at desc`. |
| Address book | `/user/cart`, account flows | `app/composables/useAddresses.ts` | `addresses` | Reads personal + company addresses filtered by RLS. |

## 2. Write flows

| Action | Trigger page/UI | Main function(s) | Writes to | Auth required | Important notes |
| --- | --- | --- | --- | --- | --- |
| Add sale item to cart | product detail, product card actions | `useCart().addToCart()` | local cart state, then `carts` + `cart_items` for logged-in users | No for guest buffer, yes for DB persistence | Cart count uses quantity sum, not row count. |
| Update cart quantity | `/user/cart` | `useCart().updateQuantity()` | local cart state, then `cart_items` sync | Same as cart | Quantity `<= 0` removes the row. |
| Remove cart item | `/user/cart` | `useCart().removeFromCart()` | local cart state, then `cart_items` sync | Same as cart | Used by unified cart review flow. |
| Create rental booking draft | `/rental-access/{slug}` and fallback product booking form | `useBooking().addBooking()` | `rental_bookings` | Yes | Writes `status = draft`; redirects user to `/user/cart`. |
| Confirm rental booking(s) | `/user/cart` | `useBooking().updateBookingStatus(bookingId, 'confirmed')` | `rental_bookings` | Yes | Submit is blocked until each active booking has a `hub_id`. |
| Update rental booking hub | `/user/cart` | `useBooking().updateHub()` | `rental_bookings` | Yes | Stores both `hub_id` and `hub_name`. |
| Remove rental booking | `/user/cart` | `useBooking().removeBooking()` | `rental_bookings` or local state | Yes for DB rows | Draft bookings are removed from the cart section. |
| Submit sale order | `/user/cart` | `useOrders().submitOrder()` | `orders`, `order_items` | Yes | Uses address snapshot + cart item snapshots. Supports `payment` and `quotation` modes. |
| Create address | cart/account flows | `useAddresses().createAddress()` | `addresses` | Yes | Address belongs to either a user or a company. |
| Update address | cart/account flows | `useAddresses().updateAddress()` | `addresses` | Yes | Default address behavior is normalized at DB level. |
| Delete address | cart/account flows | `useAddresses().deleteAddress()` | `addresses` | Yes | Protected by owner/company RLS. |

## 3. Booking-specific compatibility behavior

### `useBooking.ts`

Important behavior in the current branch:

- `addBooking()` creates `draft` bookings.
- `confirmBooking()` still exists for direct confirmed creation, but the current storefront flow mainly uses `draft -> confirmed` from `/user/cart`.
- `updateBookingStatus()` is the main submit path from cart.
- `updateHub()` stores the pickup branch before submit.

### Legacy-schema fallback

`useBooking()` contains compatibility logic for older `rental_bookings` schemas:

- tries full payload first
- if Supabase returns missing-column errors for newer fields such as:
  - `matched_product_id`
  - `matched_product_name`
  - `rental_access_id`
  - `rental_access_code`
  - `rental_access_slug`
  - `rental_access_name`
  - `rental_access_thumbnail`
  - `rental_access_snapshot`
- then retries using a legacy payload

Additional safeguard:
- `rental_access_id` is only written when it is a valid UUID

## 4. Rental-access compatibility behavior

### `useRentalAccesses.ts`

Primary path:
- read `rental_accesses`
- include nested `rental_access_matches`
- map them to storefront `RentalAccess` models

Fallback path:
- if the rental-access schema/relationship is missing or returns known 404-style errors
- derive fallback rental access rows from rentable products instead of crashing the storefront

Result:
- newer DBs get the real rental-access catalog
- older DBs stay usable, but with reduced commercial separation

## 5. Table ownership summary

| Table | Main ownership | Used by |
| --- | --- | --- |
| `products` | admin/catalog | sale browse, product detail, rental attribution |
| `product_skus` | admin/catalog | pricing, stock, rental pricing |
| `rental_accesses` | admin/rental catalog | `/product-rental`, rental access detail |
| `rental_access_matches` | admin | related rental access placement on product detail |
| `carts` / `cart_items` | customer + system | sale cart persistence |
| `rental_bookings` | customer + system | rental cart, rental history, availability |
| `orders` / `order_items` | customer + system | sale checkout submit + order history |
| `addresses` | customer/company admin | checkout address selection |

## 6. Route index

| Route | Purpose | Main source |
| --- | --- | --- |
| `/product-{group}` | category/group browse | `useProducts()`, `useRentalAccesses()` |
| `/product-{group}/{slug}` | product detail + matched rental access list | `useProducts()`, `useRentalAccesses()` |
| `/rental-access/{slug}` | rental access detail + booking entry | `useRentalAccesses()`, `useBooking()` |
| `/user/cart` | unified sale + rental review/submit | `useCart()`, `useBooking()`, `useOrders()`, `useAddresses()` |
| `/user/rentals` | confirmed rental history | `useBooking()` |
| `/user/orders` | sale order history | `useOrders()` |

## 7. Quick debug checklist

When a flow looks broken, check these in order:

1. Is the user authenticated for customer-owned writes?
2. Does the target row exist and pass public/RLS visibility?
3. Does the product have at least one valid SKU?
4. Is the rental access `active` and not hidden?
5. Does the rental access have a valid match row to the product?
6. Is the booking blocked because no hub was selected?
7. Is the DB missing migration `013_rental_access_schema.sql`, causing fallback behavior?