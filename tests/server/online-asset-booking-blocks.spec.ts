/**
 * Tests: Online Asset Booking Blocks
 *
 * Covers:
 *  1. API endpoint structure and privacy guardrails
 *  2. Asset page wiring (fetch + prop pass)
 *  3. RentalBookingForm prop threading to RentalBookingCalendar
 *  4. Regression: calendar falls back to useBooking only when no prop provided
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const ENDPOINT_PATH = "server/api/assets/[assetId]/booking-blocks.get.ts";
const ASSET_PAGE_PATH = "app/pages/asset/[slug].vue";
const FORM_PATH = "app/components/products/RentalBookingForm.vue";
const CALENDAR_PATH = "app/components/products/RentalBookingCalendar.vue";
const POS_ENDPOINT_PATH = "server/api/admin/pos/booking-blocks.get.ts";

// ─────────────────────────────────────────────────────────────────────────────
// 1. API Endpoint
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/assets/[assetId]/booking-blocks endpoint", () => {
  it("requires authenticated user session", () => {
    const src = read(ENDPOINT_PATH);
    expect(src).toContain("serverSupabaseUser");
    expect(src).toContain("getMixedCheckoutUserId");
    expect(src).toContain("statusCode: 401");
    expect(src).toContain('"Unauthorized"');
  });

  it("uses service role client to query rental_bookings globally", () => {
    const src = read(ENDPOINT_PATH);
    expect(src).toContain("serverSupabaseServiceRole");
    expect(src).toContain('"rental_bookings"');
    expect(src).toContain('.eq("asset_id", assetId)');
  });

  it("includes only confirmed and picked_up statuses — same as checkout guard", () => {
    const src = read(ENDPOINT_PATH);
    expect(src).toContain('"confirmed"');
    expect(src).toContain('"picked_up"');
    expect(src).toContain("BLOCKING_ONLINE_STATUSES");
    // Draft, cancelled, returned must not be included as blocking
    expect(src).not.toContain('"draft"');
    expect(src).not.toContain('"cancelled"');
    expect(src).not.toContain('"returned"');
  });

  it("selects only date and status columns — no sensitive fields in SELECT", () => {
    const src = read(ENDPOINT_PATH);
    // Only safe columns in the SELECT string
    expect(src).toContain('"asset_id, start_date, end_date, status"');
    // Sensitive column names must not appear in the select string
    expect(src).not.toContain('"user_id"');
    expect(src).not.toContain('"phone"');
    expect(src).not.toContain('"booker_phone"');
    expect(src).not.toContain('"deposit"');
    expect(src).not.toContain('"daily_rate"');
    expect(src).not.toContain('"payment_method"');
    expect(src).not.toContain('"notes"');
  });

  it("response items do not expose booking id, user id, or customer fields", () => {
    const src = read(ENDPOINT_PATH);
    // Map output: must NOT include id, userId, phone, pricing as output keys
    expect(src).not.toContain("bookingId:");
    expect(src).not.toContain("userId:");
    expect(src).not.toContain("row.id");
    // The endpoint must not select or output raw user_id column
    expect(src).not.toContain('.select("user_id');
    expect(src).not.toContain("userId: row");
  });

  it("response items include assetId, startDate, returnDate, status", () => {
    const src = read(ENDPOINT_PATH);
    expect(src).toContain("assetId: row.asset_id");
    expect(src).toContain("startDate: row.start_date");
    expect(src).toContain("returnDate: row.end_date");
    expect(src).toContain("status: row.status");
  });

  it("uses no-store cache header to prevent stale availability data", () => {
    const src = read(ENDPOINT_PATH);
    expect(src).toContain('"cache-control"');
    expect(src).toContain('"no-store"');
  });

  it("response shape mirrors POS booking-blocks (startDate/returnDate/status)", () => {
    const pos = read(POS_ENDPOINT_PATH);
    const online = read(ENDPOINT_PATH);
    // Both use the same calendar-compatible field names
    expect(pos).toContain("startDate: row.start_date");
    expect(online).toContain("startDate: row.start_date");
    expect(pos).toContain("returnDate: row.end_date");
    expect(online).toContain("returnDate: row.end_date");
    expect(pos).toContain("status: row.status");
    expect(online).toContain("status: row.status");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Online Asset Page Wiring
// ─────────────────────────────────────────────────────────────────────────────
describe("app/pages/asset/[slug].vue — booking-blocks wiring", () => {
  it("fetches from /api/assets/{id}/booking-blocks when asset id is available", () => {
    const src = read(ASSET_PAGE_PATH);
    expect(src).toContain("/api/assets/");
    expect(src).toContain("booking-blocks");
    expect(src).toContain("onlineBookingBlocks");
  });

  it("passes blockingBookings prop to ProductsRentalBookingForm", () => {
    const src = read(ASSET_PAGE_PATH);
    expect(src).toContain(':blocking-bookings="onlineBookingBlocks"');
    expect(src).toContain("ProductsRentalBookingForm");
  });

  it("initialises onlineBookingBlocks as an empty array (non-blocking page load)", () => {
    const src = read(ASSET_PAGE_PATH);
    expect(src).toContain("onlineBookingBlocks");
    expect(src).toContain("ref<OnlineBookingBlock[]>([])");
  });

  it("silently falls back to empty array on fetch error without crashing", () => {
    const src = read(ASSET_PAGE_PATH);
    expect(src).toContain("onlineBookingBlocks.value = []");
    expect(src).toContain("console.warn");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. RentalBookingForm prop threading
// ─────────────────────────────────────────────────────────────────────────────
describe("app/components/products/RentalBookingForm.vue — blockingBookings threading", () => {
  it("declares blockingBookings prop with correct shape", () => {
    const src = read(FORM_PATH);
    expect(src).toContain("blockingBookings");
    expect(src).toContain("RentalCalendarBlockingBooking");
  });

  it("passes blockingBookings prop down to ProductsRentalBookingCalendar", () => {
    const src = read(FORM_PATH);
    expect(src).toContain(':blocking-bookings="props.blockingBookings"');
    expect(src).toContain("ProductsRentalBookingCalendar");
  });

  it("defaults blockingBookings to null (safe when not provided)", () => {
    const src = read(FORM_PATH);
    expect(src).toContain("blockingBookings: null");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Regression: Calendar + checkout prevalidation unaffected
// ─────────────────────────────────────────────────────────────────────────────
describe("regression — calendar and checkout prevalidation unchanged", () => {
  it("RentalBookingCalendar uses blockingBookings prop when provided (not fallback)", () => {
    const src = read(CALENDAR_PATH);
    // The computed falls back to sessionBlockingBookings only when prop is null
    expect(src).toContain(
      "props.blockingBookings ?? sessionBlockingBookings.value",
    );
  });

  it("calendar still blocks confirmed and picked_up status dates", () => {
    const src = read(CALENDAR_PATH);
    expect(src).toContain('"confirmed"');
    expect(src).toContain('"picked_up"');
  });

  it("checkout prevalidation endpoint is unchanged", () => {
    const src = read("server/api/mixed-checkout/prevalidate.post.ts");
    // Endpoint delegates entirely to prevalidateMixedCheckout utility
    expect(src).toContain("prevalidateMixedCheckout");
    // No new dependencies introduced by this change
    expect(src).not.toContain("booking-blocks");
    // RENTAL_AVAILABILITY_CONFLICT lives in the utility (mixed-checkout.ts),
    // not in the thin endpoint handler — verify that separately
    const util = read("server/utils/mixed-checkout.ts");
    expect(util).toContain("RENTAL_AVAILABILITY_CONFLICT");
  });

  it("rental-booking-availability utility is unchanged", () => {
    const src = read("server/utils/rental-booking-availability.ts");
    expect(src).toContain('["confirmed", "picked_up"]');
    expect(src).toContain("assertRentalBookingAvailability");
    // No dependency on the new online endpoint
    expect(src).not.toContain("booking-blocks");
  });
});
