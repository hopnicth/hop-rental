import { describe, expect, it } from "vitest";
import {
  addDateOnlyDays,
  calculateCalendarDayDiff,
  calculateInclusiveRentalDays,
  toCustomerReturnDate,
  toExclusiveEndDate,
} from "../../app/utils/rental-dates";

describe("rental date semantics", () => {
  it("counts customer-facing same-day rental as one day", () => {
    expect(calculateInclusiveRentalDays("2026-05-21", "2026-05-21")).toBe(1);
  });

  it("counts inclusive customer return dates", () => {
    expect(calculateInclusiveRentalDays("2026-05-21", "2026-05-22")).toBe(2);
    expect(calculateInclusiveRentalDays("2026-05-21", "2026-05-23")).toBe(3);
  });

  it("converts customer return dates to exclusive DB end boundaries", () => {
    expect(toExclusiveEndDate("2026-05-21")).toBe("2026-05-22");
    expect(toExclusiveEndDate("2026-05-23")).toBe("2026-05-24");
  });

  it("converts exclusive DB end boundaries to customer return dates", () => {
    expect(toCustomerReturnDate("2026-05-22")).toBe("2026-05-21");
    expect(toCustomerReturnDate("2026-05-24")).toBe("2026-05-23");
  });

  it("rejects return-before-start as zero valid rental days", () => {
    expect(calculateInclusiveRentalDays("2026-05-22", "2026-05-21")).toBe(0);
  });

  it("uses strict date-only parsing", () => {
    expect(addDateOnlyDays("2026-02-31", 1)).toBeNull();
    expect(calculateCalendarDayDiff("2026-05-21", "2026-05-22")).toBe(1);
  });
});
