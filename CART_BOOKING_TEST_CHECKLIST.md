# Cart & Booking Test Checklist

Last updated: 2026-05-07
Purpose: manual smoke checklist for the current sale + rental + home-CMS flow

Reality sync — 2026-05-13:

- This checklist is **partially outdated** for confirmed rental cancellation. Current cancellation/refund/restriction work is design-locked but not implemented end-to-end.
- Do not treat the old “Cancel a confirmed booking” smoke item as proof that customer cancellation provenance/refund/restriction logic exists.
- Keep using this checklist for cart, draft booking, mixed sale/rental cart, shipping/pickup, and admin sanity checks until it is rewritten.

## Expected baseline

- Sale items and rental drafts coexist in `/user/cart`
- Rental bookings are created as `draft`, confirmed from `/user/cart`
- Cancelled bookings are hidden from `/user/rentals` and shown in `/user/orders`
- Booker name + phone are required on rental submit
- Rental form shows a red inline error and scrolls/focuses contact fields if the user tries to add to cart without booker name/phone
- Rental calendar shows earliest start/lead-time state and clamps below-min or above-max ranges before submit
- Home promotion/service rails read live from `content_pages`
- Home mobile category shortcut cards use the same Home category data and route to `/search?category=...`

## Customer flow smoke tests

### 1. Sale cart

- [ ] Login as a normal user
- [ ] Add a sale item
- [ ] Verify `/user/cart` shows item, quantity, subtotal

### 2. Rental draft creation

- [ ] Open `/asset/[slug]`
- [ ] Select a valid date range before filling contact fields
- [ ] Click add-to-cart with empty booker name/phone and verify a red footer error appears
- [ ] Verify the page scrolls/focuses the missing booker contact field
- [ ] Fill booker name + phone
- [ ] Select dates and create booking
- [ ] Verify redirect to `/user/cart`
- [ ] Verify booking is shown as `draft`

### 3. Mixed cart

- [ ] Keep at least one sale item and one rental draft
- [ ] Verify both sections render together
- [ ] Verify totals look correct

### 4. Rental confirmation

- [ ] Select pickup hub / branch
- [ ] Verify submit is blocked if hub is missing
- [ ] Confirm booking
- [ ] Verify redirect to `/user/rentals?submitted=1...`

### 5. Cancel flow

- [ ] Cancel a confirmed booking
- [ ] Verify it disappears from `/user/rentals`
- [ ] Verify it appears in `/user/orders`

### 6. Shipping / pickup

- [ ] Submit a sale order with delivery
- [ ] Verify shipping line + breakdown exist
- [ ] Submit with pickup-at-branch
- [ ] Verify shipping is zero and no address is required

### 7. Persistence

- [ ] Refresh `/user/cart` and `/user/rentals`
- [ ] Verify state persists correctly for logged-in user

## Admin smoke tests

### 8. Admin dashboard access

- [ ] Confirm local env includes `SUPABASE_SECRET_KEY`
- [ ] Open `/admin` and verify access for admin account

### 9. Admin order dashboard

- [ ] Open `/admin/orders`
- [ ] Verify grouped customer cards load
- [ ] Verify incomplete rows are highlighted
- [ ] Verify rental rows show booker phone/name when present

### 10. Sale order tracking

- [ ] Open `/admin/orders/[id]`
- [ ] Update tracking / fulfillment info
- [ ] Verify customer-visible order history reflects it

### 11. Rental booking ops

- [ ] Open `/admin/rental-bookings/[id]`
- [ ] Create/use a checklist
- [ ] Upload a booking document
- [ ] Delete a document and verify storage cleanup path works

### 12. Inventory/admin sanity

- [ ] Open `/admin/products`
- [ ] Open `/admin/assets`
- [ ] Open `/admin/branches-inventory`
- [ ] Verify key admin pages load without missing-table errors

### 13. Home CMS live reference

- [ ] In `/admin/content`, create an active `content_pages` row of type `promotion` and another of type `service`
- [ ] In `/admin/home-content`, add one promotion card and one service card pointing at those pages
- [ ] Open `/` and confirm the rails render the linked title/excerpt/cover image
- [ ] Click a card and confirm it routes to `/promotions/{slug}` or `/services/{slug}` for the same page
- [ ] Edit the page title/excerpt/image in `/admin/content` and confirm the home rail updates without re-saving the rail
- [ ] Mark the page inactive and confirm the card disappears from the rail

### 14. Home mobile category shortcuts

- [ ] Open `/` below the `sm` breakpoint and verify partner logos are hidden
- [ ] Verify square category cards are horizontally scrollable by touch
- [ ] Tap a category card and confirm it routes to `/search?category=<mainCategoryKey>`
- [ ] Verify product and rental results respect the selected category where data has that category
- [ ] Verify the old Home category floating FAB is not visible

## Notes

- See `API_INDEX.md` "Fast debug checklist" for shared troubleshooting (PostgREST wildcards, booker phone fallback, migration prerequisites).
- This checklist intentionally stays unchecked; it is rerun every release as a smoke pass.
