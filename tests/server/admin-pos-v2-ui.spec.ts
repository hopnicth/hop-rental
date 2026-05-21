import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("admin POS V2 shell wiring", () => {
  it("adds a guarded admin route for /admin/pos-v2", () => {
    const page = read("app/pages/admin/pos-v2/index.vue");

    expect(page).toContain('layout: "admin"');
    expect(page).toContain('middleware: ["role"]');
    expect(page).toContain('platformRoles: ["staff", "super_admin"]');
    expect(page).toContain("/api/admin/customers/lookup");
    expect(page).toContain("AdminOrderQrScanner");
    expect(page).toContain("/api/admin/pos-v2/rental-bookings");
    expect(page).toContain("Pickup Readiness workspace");
    expect(page).toContain("pickup-readiness");
  });

  it("connects Phase 3 booking success and lookup results to readiness", () => {
    const page = read("app/pages/admin/pos-v2/index.vue");
    const quickLookup = read(
      "app/components/admin/pos/AdminPosQuickLookup.vue",
    );

    expect(page).toContain("Open pickup readiness");
    expect(page).toContain("openPickupReadinessForBooking");
    expect(quickLookup).toContain("openPickupReadiness");
    expect(quickLookup).toContain("Open pickup readiness");
  });

  it("renders Phase 4B2 pickup completion UI beside readiness", () => {
    const page = read("app/pages/admin/pos-v2/index.vue");

    expect(page).toContain("Pickup Completion");
    expect(page).toContain("pickup-complete");
    expect(page).toContain("Complete pickup");
    expect(page).toContain("pickupPaymentMethod");
    expect(page).toContain("pickupCollectedAmount");
    expect(page).toContain("DigitalSignaturePad");
  });

  it("maps pickup payment methods to the Phase 4B1 backend contract", () => {
    const page = read("app/pages/admin/pos-v2/index.vue");

    expect(page).toContain('value: "cash"');
    expect(page).toContain('value: "qr_transfer"');
    expect(page).toContain('value: "bank_transfer"');
    expect(page).toContain('value: "card"');
    expect(page).toContain('value: "other"');
  });

  it("surfaces blockers, checklist path, and explicit partial-failure errors", () => {
    const page = read("app/pages/admin/pos-v2/index.vue");

    expect(page).toContain("Pickup completion is blocked");
    expect(page).toContain("Complete checklist in booking detail");
    expect(page).toContain("payment was recorded");
    expect(page).toContain(
      "Pickup payment recorded; fulfillment follow-up needed",
    );
  });

  it("keeps Phase 4B2 scoped away from fiscal, return, and settlement controls", () => {
    const page = read("app/pages/admin/pos-v2/index.vue");

    expect(page).toContain("Fiscal documents, return, settlement");
    expect(page).not.toContain("Issue receipt");
    expect(page).not.toContain("Issue tax invoice");
    expect(page).not.toContain("Issue ABB");
    expect(page).not.toContain("Complete return");
    expect(page).not.toContain("Settle rental");
    expect(page).not.toContain("/api/admin/documents/issue");
  });

  it("surfaces POS V3 in the admin navigation and keeps legacy POS available", () => {
    const layout = read("app/layouts/admin.vue");
    const header = read("app/components/admin/pos/AdminPosHeader.vue");

    expect(layout).toContain('{ label: "POS", to: "/admin/pos" }');
    // POS V2 nav entry was replaced by POS V3 as part of Phase 2C
    expect(layout).toContain('{ label: "POS V3", to: "/admin/pos-v3" }');
    expect(header).toContain('to="/admin/pos"');
  });

  it("Phase 2E-B1: POS V2 pickup workspace shows legacy-policy warning directing staff to POS V3", () => {
    const page = read("app/pages/admin/pos-v2/index.vue");

    // Warning must be present in the Pickup Readiness workspace section
    expect(page).toContain("[Phase 2E-B1] ใช้ POS V3 สำหรับ Rental Pickup");
    // Must mention current deposit-only policy and deferred rental fee
    expect(page).toContain("เงินมัดจำประกัน");
    expect(page).toContain("ค่าเช่าไปเก็บที่วันคืนสินค้า");
    // Must redirect staff to POS V3 path
    expect(page).toContain("/admin/pos-v3");
    // Warning must be color="warning" (not suppressed as info)
    expect(page).toContain('color="warning"');
  });
});

// ── Phase 2E-B1: Customer-facing document print policy ──────────────────────────

describe("user document print page — Phase 2E-B1 approved five-row money summary", () => {
  const PRINT_PAGE = "app/pages/user/documents/[id]/print.vue";

  it("shows row 1: เงินมัดจำประกันทั้งหมด using securityDepositTotal", () => {
    const page = read(PRINT_PAGE);
    expect(page).toContain("เงินมัดจำประกันทั้งหมด");
    expect(page).toContain("securityDepositTotal");
  });

  it("shows row 2: หักเงินมัดจำจองที่ชำระแล้ว using bookingDepositPaid", () => {
    const page = read(PRINT_PAGE);
    expect(page).toContain("หักเงินมัดจำจองที่ชำระแล้ว");
    expect(page).toContain("bookingDepositPaid");
  });

  it("shows row 3: เงินมัดจำประกันคงเหลือที่ต้องชำระวันรับสินค้า using remainingRefundableSecurityDepositDueAtPickup", () => {
    const page = read(PRINT_PAGE);
    expect(page).toContain("เงินมัดจำประกันคงเหลือที่ต้องชำระวันรับสินค้า");
    expect(page).toContain("remainingRefundableSecurityDepositDueAtPickup");
  });

  it("shows row 4: ค่าเช่า labeled as deferred to return, not due at pickup", () => {
    const page = read(PRINT_PAGE);
    // Old at-pickup wording must be gone
    expect(page).not.toContain("ค่าเช่าที่ชำระวันรับสินค้า");
    // Deferred label must be present
    expect(page).toContain("ชำระวันคืนสินค้า / หลังจบงาน");
    expect(page).toContain("rentalFeeDueAtPickup");
  });

  it("shows row 5: รวมยอดที่ต้องชำระวันรับสินค้า using deposit-only field", () => {
    const page = read(PRINT_PAGE);
    // New approved total label
    expect(page).toContain("รวมยอดที่ต้องชำระวันรับสินค้า");
    // Old combined-total labels must be gone
    expect(page).not.toContain("รวมยอดชำระวันรับสินค้า");
    expect(page).not.toContain("รวมยอดมัดจำวันที่รับสินค้า");
    // totalDueAtPickup (which included rental fee) must not appear anywhere
    expect(page).not.toContain("totalDueAtPickup");
    // The pickup-day total row must use the deposit-only field
    const totalRowIdx = page.indexOf("รวมยอดที่ต้องชำระวันรับสินค้า");
    const depositFieldAfterTotal = page.indexOf(
      "remainingRefundableSecurityDepositDueAtPickup",
      totalRowIdx,
    );
    expect(depositFieldAfterTotal).toBeGreaterThan(totalRowIdx);
    expect(depositFieldAfterTotal - totalRowIdx).toBeLessThan(300);
  });

  it("amount column uses accounting alignment: right-aligned and tabular-nums", () => {
    const page = read(PRINT_PAGE);
    // CSS must specify right-aligned amount column for .money-breakdown dd
    expect(page).toContain("text-align: right");
    expect(page).toContain("font-variant-numeric: tabular-nums");
    expect(page).toContain("white-space: nowrap");
    // Layout must use max-content for the amount column
    expect(page).toContain("max-content");
  });

  it("payment method/reference row is removed", () => {
    const page = read(PRINT_PAGE);
    expect(page).not.toContain("วิธีชำระเงิน / เลขอ้างอิง");
    // The "— / —" fallback pattern from that row must also be gone
    expect(page).not.toContain('payment.method || "—"');
    expect(page).not.toContain('payment.reference || "—"');
  });

  it("separate แหล่งที่มาของการจอง row is removed", () => {
    const page = read(PRINT_PAGE);
    expect(page).not.toContain("แหล่งที่มาของการจอง");
  });

  it("booking source is shown inline after QR การจอง via v-if", () => {
    const page = read(PRINT_PAGE);
    // The h2 must contain QR การจอง
    expect(page).toContain("QR การจอง");
    // The inline source bracket must be guarded by v-if so old snapshots omit it
    expect(page).toContain('v-if="bookingSourceLabel"');
    // The v-if must appear in the same h2 block as QR การจอง
    const qrIdx = page.indexOf("QR การจอง");
    const vifIdx = page.indexOf('v-if="bookingSourceLabel"', qrIdx);
    expect(vifIdx).toBeGreaterThan(qrIdx);
    expect(vifIdx - qrIdx).toBeLessThan(120);
  });

  it("bookingSourceLabel returns 'POS {hubName}' for pos, 'Online Booking' for online, null when absent", () => {
    const page = read(PRINT_PAGE);
    // POS branch uses hub name from snapshot
    expect(page).toContain("POS ${hub}");
    expect(page).toContain('"POS Booking"'); // fallback when hub absent
    // Online mapping
    expect(page).toContain('"Online Booking"');
    // Source values derived from bookingSource field
    expect(page).toContain('"pos"');
    expect(page).toContain('"online"');
    // Absent bookingSource returns null — no brackets rendered
    expect(page).toContain("return null");
    // Bracket must NOT be shown for missing source
    expect(page).not.toContain('"[—]"');
  });

  it("payment detail section shows วันชำระเงิน label (not วันเวลาที่ชำระ)", () => {
    const page = read(PRINT_PAGE);
    expect(page).toContain("วันชำระเงิน");
    expect(page).toContain("bookingDepositPaidAt");
    expect(page).not.toContain("วันเวลาที่ชำระ");
  });

  it("lower payment detail dl uses accounting alignment", () => {
    const page = read(PRINT_PAGE);
    expect(page).toContain("payment-detail");
    expect(page).toContain(".payment-detail dd");
    const pdIdx = page.indexOf(".payment-detail dd");
    const alignIdx = page.indexOf("text-align: right", pdIdx);
    expect(alignIdx).toBeGreaterThan(pdIdx);
    expect(alignIdx - pdIdx).toBeLessThan(200);
  });
});
