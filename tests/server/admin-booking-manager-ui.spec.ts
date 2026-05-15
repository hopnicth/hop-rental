import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminLayout = readFileSync("app/layouts/admin.vue", "utf8");
const bookingManagerPage = readFileSync(
  "app/pages/admin/rental-bookings/index.vue",
  "utf8",
);

describe("admin booking manager navigation", () => {
  it("adds Booking Manager to the admin rental ops navigation", () => {
    expect(adminLayout).toContain('label: "Booking Manager"');
    expect(adminLayout).toContain('to: "/admin/rental-bookings"');
    expect(adminLayout).toContain("isActiveNavItem(item)");
    expect(adminLayout).toContain("route.path.startsWith(`${item.to}/`)");
  });

  it("renders a rental booking manager index wired to the rental API", () => {
    expect(bookingManagerPage).toContain('layout: "admin"');
    expect(bookingManagerPage).toContain('platformRoles: ["staff", "super_admin"]');
    expect(bookingManagerPage).toContain('"/api/admin/rental-bookings"');
    expect(bookingManagerPage).toContain("Rental bookings");
    expect(bookingManagerPage).toContain("Booking manager");
    expect(bookingManagerPage).toContain(
      "`/admin/rental-bookings/${booking.id}`",
    );
    expect(bookingManagerPage).toContain('value: "no_show"');
  });
});