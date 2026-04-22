## Cart & Booking Test Checklist

Manual regression checklist before the next Git/GitHub update.

Current expected behavior in this branch:

- `Book` creates a rental booking as `draft`.
- Draft bookings appear in `/user/cart` in a separate rental section.
- Rental submit from `/user/cart` requires a pickup hub and changes `draft -> confirmed`.
- Confirmed bookings move to `/user/rentals` with a submitted-success state.
- Cart badge count = purchase item quantity + rental draft booking count.

### 1. Purchase cart only

- [ ] Login with a normal user.
- [ ] Add 1 purchase item from a product page.
- [ ] Open `/user/cart` and verify the item, quantity, and subtotal show correctly.

### 2. Rental booking only

- [ ] Open a rental access page, or a rental product that still uses the fallback booking form.
- [ ] Select SKU/dates and press `Book`.
- [ ] Verify loading state appears before success feedback.
- [ ] Verify redirect goes to `/user/cart` and the booking is shown in the Rental Items section as `draft`.
- [ ] Verify the cart badge increases for the rental draft.

### 3. Mixed cart + booking

- [ ] Keep at least 1 purchase item and 1 rental draft booking.
- [ ] Verify both sections render together on `/user/cart`.
- [ ] Verify totals include cart subtotal + booking rental + booking deposit.

### 4. Rental submit flow

- [ ] With at least 1 rental draft in `/user/cart`, select a pickup hub.
- [ ] Verify submit is blocked while any rental booking has no hub.
- [ ] Press `Submit Rental Booking`.
- [ ] Verify bookings are changed to `confirmed`.
- [ ] Verify redirect goes to `/user/rentals?submitted=1...` with success feedback.
- [ ] Verify submitted bookings no longer remain in the cart draft section.

### 5. Refresh persistence

- [ ] While logged in, refresh `/user/cart`.
- [ ] Verify purchase items still appear.
- [ ] Verify draft bookings still appear.
- [ ] After rental submit, refresh `/user/rentals` and verify confirmed bookings still appear.

### 6. Logout / login restore

- [ ] From a state with both cart item(s) and booking(s), logout.
- [ ] Verify UI/badge clears for the logged-out session.
- [ ] Login with the same account.
- [ ] Verify purchase items and draft bookings are restored.

### 7. Booking hub update

- [ ] Change the pickup/return hub for a draft booking in `/user/cart`.
- [ ] Verify the selected hub updates in UI and remains after refresh.

### 8. Remove actions

- [ ] Remove 1 purchase item and verify subtotal updates.
- [ ] Remove 1 draft booking and verify booking totals update.
- [ ] Refresh and verify removed entries do not return.

### 9. Quantity update

- [ ] Increase and decrease purchase item quantity in `/user/cart`.
- [ ] Verify line total and subtotal update correctly.

### 10. Availability re-check

- [ ] Add the same rental selection repeatedly until stock is exhausted.
- [ ] Verify draft + confirmed bookings both reduce availability.
- [ ] Verify the next attempt is blocked when no availability remains.

### 11. Guest-to-user merge sanity

- [ ] As guest, add purchase item(s).
- [ ] Login.
- [ ] Verify guest cart items merge into the logged-in cart without losing existing server data.

### 12. Routing sanity

- [ ] Click a product card from the listing page.
- [ ] Verify it opens in the same tab.
- [ ] Verify `/product-{group}/{slug}` resolves without connection or route errors while the dev server is running.

### 13. Empty-state sanity

- [ ] Remove all purchase items and all bookings.
- [ ] Verify `/user/cart` shows the empty-state UI without broken totals or errors.

### 14. Admin rental smoke check

- [ ] Confirm local `.env` includes `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_KEY`) before testing admin writes.
- [ ] Confirm the target DB has migration `013_rental_access_schema.sql` applied before testing rental admin pages.
- [ ] Open `/admin/products` and verify the first click navigates immediately without briefly showing `Customer` in the admin badge.
- [ ] Open `/admin/rental-accesses` and verify the page loads without missing-table errors.
- [ ] Open `/admin/matches` and verify the page loads without missing-table errors.
