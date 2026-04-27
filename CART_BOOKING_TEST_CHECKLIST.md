# Cart & Booking Test Checklist

Last updated: 2026-04-27
Purpose: manual smoke checklist for the current sale + rental flow

## Expected baseline

- Sale items and rental drafts coexist in `/user/cart`
- Rental bookings are created as `draft`
- Rental confirmation happens from `/user/cart`
- Cancelled bookings are hidden from `/user/rentals` and shown in `/user/orders`
- Booker name + phone are required on rental submit

## Customer flow smoke tests

### 1. Sale cart
- [ ] Login as a normal user
- [ ] Add a sale item
- [ ] Verify `/user/cart` shows item, quantity, subtotal

### 2. Rental draft creation
- [ ] Open `/asset/[slug]`
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

## Notes

- If search filters hit PostgREST, use `*term*` wildcard style.
- If admin order contacts look empty, check both booking `booker_phone` and account `users.phone`.
- If booking ops fail, confirm migrations `032` and `033` are applied.
