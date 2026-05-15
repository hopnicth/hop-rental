import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const calendarVue = readFileSync(
  "app/components/products/RentalBookingCalendar.vue",
  "utf8",
);
const useBookingTs = readFileSync("app/composables/useBooking.ts", "utf8");
const posVue = readFileSync("app/pages/admin/pos.vue", "utf8");
const posBookingPost = readFileSync(
  "server/api/admin/pos/bookings.post.ts",
  "utf8",
);
const availabilityTs = readFileSync(
  "server/utils/rental-booking-availability.ts",
  "utf8",
);
const confirmationTs = readFileSync(
  "server/utils/rental-booking-confirmation.ts",
  "utf8",
);

describe("rental date semantics source safeguards", () => {
  it("uses inclusive customer rental days on the storefront calendar", () => {
    expect(calendarVue).toContain("calculateInclusiveRentalDays");
    expect(calendarVue).toContain("toISO(startDate.value)");
    expect(calendarVue).toContain("toISO(returnDate.value)");
    expect(calendarVue).toContain("minDays.value - 1");
    expect(calendarVue).toContain("maxDays.value - 1");
  });

  it("checks selected customer return ranges through an exclusive boundary", () => {
    expect(calendarVue).toContain("toExclusiveEndDate(toISO(returnDate.value))");
    expect(calendarVue).toContain("booking.exclusiveEndDate || booking.returnDate");
    expect(calendarVue).toContain("while (cursor < end)");
  });

  it("maps booking store UI return dates to and from DB exclusive end dates", () => {
    expect(useBookingTs).toContain("toExclusiveEndDate(booking.returnDate)");
    expect(useBookingTs).toContain("toCustomerReturnDate(row.end_date as string)");
    expect(useBookingTs).toContain("exclusiveEndDate: (row.end_date as string)");
  });

  it("keeps POS customer return dates inclusive and stores exclusive DB end dates", () => {
    expect(posVue).toContain("calculateInclusiveRentalDays(start, end)");
    expect(posBookingPost).toContain("const customerReturnDate = asText(body.endDate)");
    expect(posBookingPost).toContain("diffDays(startDate, customerReturnDate)");
    expect(posBookingPost).toContain("toExclusiveEndDate(customerReturnDate)");
    expect(posBookingPost).toContain("endDate: exclusiveEndDate");
    expect(posBookingPost).toContain("end_date: exclusiveEndDate");
  });

  it("documents server utilities as internal half-open interval consumers", () => {
    expect(availabilityTs).toContain("[startDate, endDate)");
    expect(availabilityTs).toContain("[start_date, end_date)");
    expect(confirmationTs).toContain("[start_date, end_date)");
  });
});
