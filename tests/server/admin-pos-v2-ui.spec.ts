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

  it("surfaces POS V2 in the admin navigation and keeps legacy POS available", () => {
    const layout = read("app/layouts/admin.vue");
    const header = read("app/components/admin/pos/AdminPosHeader.vue");

    expect(layout).toContain('{ label: "POS", to: "/admin/pos" }');
    expect(layout).toContain('{ label: "POS V2", to: "/admin/pos-v2" }');
    expect(header).toContain('to="/admin/pos"');
  });
});
