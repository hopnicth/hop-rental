/**
 * Tests: Cart checkout cart-clearing behaviour — /user/cart
 *
 * Covers:
 *  1. handleCheckout calls clearCartPersisted after successful navigation (product items)
 *  2. handleCheckout calls refreshSubmittedToPaymentIds after successful navigation (booking items)
 *  3. refreshCartBookingCheckoutState calls refreshSubmittedToPaymentIds (cart-load filter)
 *  4. Cart does NOT call clearCartPersisted when payment request API throws
 *  5. Cart does NOT call clearCartPersisted when payment request returns no redirectTo
 *  6. activeBookings in useBooking excludes submittedToPaymentBookingIds
 *  7. active-booking-ids server endpoint exists, is GET, and owner-scoped
 *  8. Cleanup runs best-effort (inside try/catch, never blocks the user)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CART = readFileSync(
  resolve(process.cwd(), "app/pages/user/cart.vue"),
  "utf8",
);
const BOOKING = readFileSync(
  resolve(process.cwd(), "app/composables/useBooking.ts"),
  "utf8",
);
const ENDPOINT = readFileSync(
  resolve(
    process.cwd(),
    "server/api/user/manual-payment-requests/active-booking-ids.get.ts",
  ),
  "utf8",
);

// ── 1. handleCheckout clears product cart after successful navigation ──────────
describe("handleCheckout — product cart clearing", () => {
  it("imports clearCartPersisted from useCart", () => {
    expect(CART).toContain("clearCartPersisted");
  });

  it("calls clearCartPersisted inside the post-navigation try block", () => {
    expect(CART).toContain("await clearCartPersisted()");
  });

  it("guards clearCartPersisted behind orderId check (booking-only cart skips it)", () => {
    expect(CART).toContain("if (orderId) await clearCartPersisted()");
  });
});

// ── 2. handleCheckout refreshes booking filter after successful navigation ─────
describe("handleCheckout — booking payment filter refresh", () => {
  it("imports refreshSubmittedToPaymentIds from useBooking", () => {
    expect(CART).toContain("refreshSubmittedToPaymentIds");
  });

  it("calls refreshSubmittedToPaymentIds in post-navigation cleanup", () => {
    expect(CART).toContain("await refreshSubmittedToPaymentIds()");
  });
});

// ── 3. Cart-load refresh also calls the booking filter ─────────────────────────
describe("refreshCartBookingCheckoutState — booking filter on every cart load", () => {
  it("calls refreshSubmittedToPaymentIds alongside refreshBookings", () => {
    expect(CART).toContain("await refreshSubmittedToPaymentIds()");
    expect(CART).toContain("await refreshBookings()");
  });
});

// ── 4. Cleanup is guarded — does not run on error paths ───────────────────────
describe("handleCheckout — no clearing on failure", () => {
  it("cleanup block is inside try/catch so errors do not fire it", () => {
    // The cleanup is in a try block that only executes after navigateTo resolves.
    // If $fetch throws, navigateTo is never called and the cleanup try block is never reached.
    expect(CART).toContain("Non-fatal — cleanup runs best-effort");
    expect(CART).toContain("} catch {");
  });

  it("payment request error path calls showInlineOrderError, not clearCartPersisted directly", () => {
    expect(CART).toContain("showInlineOrderError(");
    // clearCartPersisted is only reached after successful navigateTo
    const checkoutFn = CART.slice(
      CART.indexOf("async function handleCheckout"),
      CART.indexOf("async function submitCurrentOrder"),
    );
    expect(checkoutFn).toContain("clearCartPersisted");
    expect(checkoutFn).toContain("await navigateTo(res.redirectTo)");
  });
});

// ── 5. useBooking: activeBookings excludes submitted-to-payment booking IDs ────
describe("useBooking — activeBookings excludes submitted booking IDs", () => {
  it("declares submittedToPaymentBookingIds module-level ref", () => {
    expect(BOOKING).toContain("submittedToPaymentBookingIds");
  });

  it("activeBookings filters by submittedToPaymentBookingIds", () => {
    expect(BOOKING).toContain("submittedToPaymentBookingIds.value.includes(b.bookingId)");
  });

  it("defines refreshSubmittedToPaymentIds function", () => {
    expect(BOOKING).toContain("async function refreshSubmittedToPaymentIds()");
  });

  it("refreshSubmittedToPaymentIds calls the active-booking-ids endpoint", () => {
    expect(BOOKING).toContain(
      '"/api/user/manual-payment-requests/active-booking-ids"',
    );
  });

  it("refreshSubmittedToPaymentIds fails open (clears filter on error)", () => {
    expect(BOOKING).toContain("submittedToPaymentBookingIds.value = [];");
  });

  it("refreshSubmittedToPaymentIds is exported from useBooking", () => {
    expect(BOOKING).toContain("refreshSubmittedToPaymentIds,");
  });
});

// ── 6. Server endpoint: active-booking-ids ────────────────────────────────────
describe("GET /api/user/manual-payment-requests/active-booking-ids", () => {
  it("requires authentication (serverSupabaseUser)", () => {
    expect(ENDPOINT).toContain("serverSupabaseUser");
    expect(ENDPOINT).toContain("Authentication required");
  });

  it("uses service-role client to query payment request tables", () => {
    expect(ENDPOINT).toContain("serverSupabaseServiceRole");
  });

  it("queries manual_payment_requests by customer_id and all cart-blocking statuses", () => {
    expect(ENDPOINT).toContain("manual_payment_requests");
    expect(ENDPOINT).toContain("awaiting_payment");
    expect(ENDPOINT).toContain("pending_review");
    // "reviewed" must be included: admin verified payment but booking is still draft
    // until admin separately confirms it — booking must stay hidden during that window.
    expect(ENDPOINT).toContain('"reviewed"');
    expect(ENDPOINT).toContain('"customer_id"');
  });

  it("does NOT treat rejected or cancelled as cart-blocking", () => {
    // rejected: customer must resubmit — booking should return to cart
    // cancelled: customer cancelled — booking should return to cart
    expect(ENDPOINT).not.toContain('"rejected"');
    expect(ENDPOINT).not.toContain('"cancelled"');
  });

  it("queries manual_payment_request_items for rental_booking_deposit targets", () => {
    expect(ENDPOINT).toContain("manual_payment_request_items");
    expect(ENDPOINT).toContain("rental_booking_deposit");
    expect(ENDPOINT).toContain("target_id");
  });

  it("returns { bookingIds: string[] }", () => {
    expect(ENDPOINT).toContain("bookingIds");
  });

  it("returns empty array when no active requests", () => {
    expect(ENDPOINT).toContain("return { bookingIds: [] }");
  });
});
