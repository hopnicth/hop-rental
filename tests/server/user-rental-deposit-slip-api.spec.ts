/**
 * Tests: POST /api/user/rental-bookings/[id]/deposit-slip
 *
 * Source-inspection contract (route handlers need an H3 event; behavioral file
 * validation is covered in rental-deposit-slip-evidence.spec.ts). Covers:
 *  1. Customer auth via serverSupabaseUser (401 when unauthenticated)
 *  2. Ownership enforced (booking.user_id vs session user → 403)
 *  3. Upload eligible only for draft bookings
 *  4. Delegates to the private-bucket evidence util
 *  5. Does NOT confirm the booking and does NOT mutate money
 *  6. Never uses catalog-media / public URLs
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const SRC = read(
  "server/api/user/rental-bookings/[id]/deposit-slip.post.ts",
);

describe("customer deposit-slip upload route", () => {
  it("authenticates the customer via serverSupabaseUser and rejects anon (401)", () => {
    expect(SRC).toContain("serverSupabaseUser");
    expect(SRC).toContain("Authentication required");
    expect(SRC).toContain("401");
  });

  it("enforces booking ownership (user_id vs session user → 403)", () => {
    expect(SRC).toContain("booking.user_id");
    expect(SRC).toContain("Access denied");
    expect(SRC).toContain("403");
  });

  it("only allows uploads for draft bookings", () => {
    expect(SRC).toContain("SLIP_UPLOAD_ELIGIBLE_STATUSES");
    expect(SRC).toContain('"draft"');
    expect(SRC).toContain("BOOKING_NOT_ELIGIBLE_FOR_SLIP_UPLOAD");
  });

  it("delegates to the private-bucket evidence util", () => {
    expect(SRC).toContain("uploadRentalDepositSlipEvidence");
    expect(SRC).toContain("rental-deposit-slip-evidence");
    expect(SRC).toContain("readMultipartFormData");
  });

  it("never confirms the booking and never mutates deposit/payment money", () => {
    expect(SRC).not.toContain("confirmRentalBooking");
    expect(SRC).not.toContain("deposit_payment_status");
    expect(SRC).not.toContain("deposit_paid_amount");
    expect(SRC).not.toContain('status: "confirmed"');
    expect(SRC).not.toContain("rental_held_balance_events");
  });

  it("never uses catalog-media, public URLs, or the deposit-proof path", () => {
    expect(SRC).not.toContain('"catalog-media"');
    expect(SRC).not.toContain("CATALOG_MEDIA_BUCKET");
    expect(SRC).not.toContain("getPublicUrl");
    expect(SRC).not.toContain("deposit-proof");
    expect(SRC).not.toContain("rental_booking_payment_lines");
  });

  it("returns slip metadata (not a url)", () => {
    expect(SRC).toContain("return { slip }");
  });
});
