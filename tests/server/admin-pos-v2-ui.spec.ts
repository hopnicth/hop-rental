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
    expect(page).toContain("Future Booking only");
  });

  it("keeps Phase 3 POS V2 UI scoped away from pickup/payment/documents", () => {
    const page = read("app/pages/admin/pos-v2/index.vue");

    expect(page).toContain("No pickup or payment in this phase");
    expect(page).toContain("fiscal document actions are");
    expect(page).toContain("all paid amounts remain zero");
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
