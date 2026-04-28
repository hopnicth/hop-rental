import { describe, expect, it } from "vitest";
import {
  activeDynamicFilters,
  queryObjectsEqual,
  readDynamicFilters,
  readQueryBoolean,
  readQueryList,
  readQueryNumber,
  readQueryString,
  writeDynamicFilters,
} from "~/utils/filter-query";

describe("filter query helpers", () => {
  it("reads primitive query values safely", () => {
    expect(readQueryString(["abc", "def"])).toBe("abc");
    expect(readQueryList(["Makita", "Bosch,DeWalt", null])).toEqual([
      "Makita",
      "Bosch",
      "DeWalt",
    ]);
    expect(readQueryNumber("12.5")).toBe(12.5);
    expect(readQueryNumber("x")).toBeNull();
    expect(readQueryBoolean("1")).toBe(true);
    expect(readQueryBoolean("false")).toBe(false);
  });

  it("keeps only active dynamic filters", () => {
    expect(
      activeDynamicFilters({
        g1: [],
        g2: ["o1"],
        g3: { min: null, max: null },
        g4: { min: 10, max: null },
      }),
    ).toEqual({ g2: ["o1"], g4: { min: 10, max: null } });
  });

  it("round-trips dynamic filters through JSON query value", () => {
    const encoded = writeDynamicFilters({
      g1: [],
      g2: ["o1", "o2"],
      g3: { min: 1, max: 5 },
    });

    expect(encoded).toBeTruthy();
    expect(readDynamicFilters(encoded)).toEqual({
      g2: ["o1", "o2"],
      g3: { min: 1, max: 5 },
    });
  });

  it("compares query objects independent of array order", () => {
    expect(
      queryObjectsEqual(
        { brands: ["Bosch", "Makita"], min: "10" },
        { brands: ["Makita", "Bosch"], min: "10" },
      ),
    ).toBe(true);
    expect(queryObjectsEqual({ min: "10" }, { min: "11" })).toBe(false);
  });
});