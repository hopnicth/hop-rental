## Cart & Booking Test Checklist

Manual regression checklist before the next Git/GitHub update.

### 1. Purchase cart only
- Login with a normal user.
- Add 1 purchase item from a product page.
- Open `/user/cart` and verify the item, quantity, and subtotal show correctly.

### 2. Rental booking only
- Open a rental product.
- Select SKU, dates, and confirm booking.
- Verify loading state appears before success feedback.
- Verify redirect goes to `/user/cart` and the booking is shown.

### 3. Mixed cart + booking
- Keep at least 1 purchase item and 1 confirmed booking.
- Verify both sections render together on `/user/cart`.
- Verify totals include cart subtotal + booking rental + booking deposit.

### 4. Refresh persistence
- While logged in, refresh `/user/cart`.
- Verify purchase items still appear.
- Verify confirmed bookings still appear.

### 5. Logout / login restore
- From a state with both cart item(s) and booking(s), logout.
- Verify UI/badge clears for the logged-out session.
- Login with the same account.
- Verify purchase items and bookings are restored.

### 6. Booking hub update
- Change the pickup/return hub for a confirmed booking in `/user/cart`.
- Verify the selected hub updates in UI and remains after refresh.

### 7. Remove actions
- Remove 1 purchase item and verify subtotal updates.
- Remove 1 booking and verify booking totals update.
- Refresh and verify removed entries do not return.

### 8. Quantity update
- Increase and decrease purchase item quantity in `/user/cart`.
- Verify line total and subtotal update correctly.

### 9. Availability re-check
- Confirm the same rental selection multiple times until stock is exhausted.
- Verify the next attempt is blocked when no availability remains.

### 10. Guest-to-user merge sanity
- As guest, add purchase item(s).
- Login.
- Verify guest cart items merge into the logged-in cart without losing existing server data.

### 11. Empty-state sanity
- Remove all purchase items and all bookings.
- Verify `/user/cart` shows the empty-state UI without broken totals or errors.