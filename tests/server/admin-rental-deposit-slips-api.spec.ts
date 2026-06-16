/**
 * Tests: admin deposit-slip visibility + signed access
 *
 * Source-inspection contract. Covers:
 *  1. List route: requirePlatformAdmin, safe select (no storage path), newest
 *     first, returns mapped slips.
 *  2. Signed-url route: requirePlatformAdmin, slip-belongs-to-booking guard,
 *     short-lived signed URL via the util, never a permanent public URL.
 *  3. Admin component views slips only through the signed-url endpoint.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const LIST = read(
  "server/api/admin/rental-bookings/[id]/deposit-slips.get.ts",
);
const SIGNED = read(
  "server/api/admin/rental-bookings/[id]/deposit-slips/[slipId]/signed-url.get.ts",
);
const COMPONENT = read("app/components/admin/AdminBookingDepositSlips.vue");

describe("admin deposit-slips list route", () => {
  it("requires platform admin", () => {
    expect(LIST).toContain("requirePlatformAdmin");
    expect(LIST).not.toContain("serverSupabaseUser");
  });
  it("uses the safe select (no storage path/bucket) and newest-first order", () => {
    expect(LIST).toContain("RENTAL_DEPOSIT_SLIP_SAFE_SELECT");
    expect(LIST).toContain("toSafeRentalDepositSlip");
    expect(LIST).toContain('order("uploaded_at", { ascending: false })');
    expect(LIST).not.toContain("storage_path");
    expect(LIST).not.toContain("getPublicUrl");
  });
});

describe("admin deposit-slip signed-url route", () => {
  it("requires platform admin", () => {
    expect(SIGNED).toContain("requirePlatformAdmin");
  });
  it("guards that the slip belongs to the booking in the path", () => {
    expect(SIGNED).toContain("rental_booking_id");
    expect(SIGNED).toContain("Slip not found");
    expect(SIGNED).toContain("404");
  });
  it("returns a short-lived signed URL via the util, never a public URL", () => {
    expect(SIGNED).toContain("createRentalDepositSlipSignedUrl");
    expect(SIGNED).toContain("ttlSeconds");
    expect(SIGNED).not.toContain("getPublicUrl");
    expect(SIGNED).not.toContain('"catalog-media"');
  });
});

describe("admin deposit-slips component", () => {
  it("opens slips only through the signed-url endpoint", () => {
    expect(COMPONENT).toContain("/deposit-slips/");
    expect(COMPONENT).toContain("signed-url");
    expect(COMPONENT).toContain("View slip");
  });
  it("never references a permanent public URL or catalog-media", () => {
    expect(COMPONENT).not.toContain("getPublicUrl");
    expect(COMPONENT).not.toContain("catalog-media");
    expect(COMPONENT).not.toContain("fileUrl");
  });
});
