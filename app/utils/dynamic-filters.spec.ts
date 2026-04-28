import { describe, expect, it } from "vitest";
import {
  parseSpecNumber,
  productMatchesDynamicFilters,
  type DynamicFilterProductLike,
} from "~/utils/dynamic-filters";
import type { FilterGroup } from "~/composables/useFilterGroups";

function makeGroup(
  partial: Partial<FilterGroup> & Pick<FilterGroup, "id" | "key">,
): FilterGroup {
  return {
    mainCategoryKey: "power_tools",
    labelTh: partial.labelTh ?? partial.key,
    labelEn: partial.labelEn ?? partial.key,
    filterType: "checkbox",
    matchLogic: "or",
    specKey: null,
    isActive: true,
    sortOrder: 0,
    options: [],
    ...partial,
  };
}

const brandGroup = makeGroup({
  id: "g-brand",
  key: "brand",
  filterType: "checkbox",
  matchLogic: "or",
  options: [
    {
      id: "o-makita",
      groupId: "g-brand",
      key: "makita",
      labelTh: "Makita",
      labelEn: "Makita",
      isActive: true,
      sortOrder: 0,
    },
    {
      id: "o-bosch",
      groupId: "g-brand",
      key: "bosch",
      labelTh: "Bosch",
      labelEn: "Bosch",
      isActive: true,
      sortOrder: 1,
    },
  ],
});

const featureGroup = makeGroup({
  id: "g-feature",
  key: "feature",
  filterType: "checkbox",
  matchLogic: "and",
  options: [
    {
      id: "o-cordless",
      groupId: "g-feature",
      key: "cordless",
      labelTh: "ไร้สาย",
      labelEn: "Cordless",
      isActive: true,
      sortOrder: 0,
    },
    {
      id: "o-led",
      groupId: "g-feature",
      key: "led",
      labelTh: "LED",
      labelEn: "LED",
      isActive: true,
      sortOrder: 1,
    },
  ],
});

const powerGroup = makeGroup({
  id: "g-power",
  key: "power_w",
  filterType: "number_range",
  specKey: "power",
  options: [],
});

const groupsById = new Map<string, FilterGroup>([
  [brandGroup.id, brandGroup],
  [featureGroup.id, featureGroup],
  [powerGroup.id, powerGroup],
]);

const productMakitaCordlessLed: DynamicFilterProductLike = {
  filterKeys: ["brand__makita", "feature__cordless", "feature__led"],
  spec: { power: "150 W" },
};

const productBoschCordless: DynamicFilterProductLike = {
  filterKeys: ["brand__bosch", "feature__cordless"],
  spec: { power: "90w" },
};

describe("parseSpecNumber", () => {
  it("returns null for nullish or non-numeric input", () => {
    expect(parseSpecNumber(undefined)).toBeNull();
    expect(parseSpecNumber("")).toBeNull();
    expect(parseSpecNumber("abc")).toBeNull();
  });

  it("extracts the first numeric token from spec strings", () => {
    expect(parseSpecNumber("10w")).toBe(10);
    expect(parseSpecNumber("2.5kg")).toBe(2.5);
    expect(parseSpecNumber("-3.2 V")).toBe(-3.2);
    expect(parseSpecNumber("range 5-10")).toBe(5);
  });
});

describe("productMatchesDynamicFilters", () => {
  it("matches every product when selections are empty", () => {
    expect(
      productMatchesDynamicFilters(productBoschCordless, {}, groupsById),
    ).toBe(true);
  });

  it("treats a group with empty selection as inactive", () => {
    expect(
      productMatchesDynamicFilters(
        productBoschCordless,
        { [brandGroup.id]: [] },
        groupsById,
      ),
    ).toBe(true);
  });

  it("OR-matches when any selected option key is present", () => {
    expect(
      productMatchesDynamicFilters(
        productBoschCordless,
        { [brandGroup.id]: ["o-makita", "o-bosch"] },
        groupsById,
      ),
    ).toBe(true);
    expect(
      productMatchesDynamicFilters(
        productBoschCordless,
        { [brandGroup.id]: ["o-makita"] },
        groupsById,
      ),
    ).toBe(false);
  });

  it("AND-matches only when every selected option key is present", () => {
    expect(
      productMatchesDynamicFilters(
        productMakitaCordlessLed,
        { [featureGroup.id]: ["o-cordless", "o-led"] },
        groupsById,
      ),
    ).toBe(true);
    expect(
      productMatchesDynamicFilters(
        productBoschCordless,
        { [featureGroup.id]: ["o-cordless", "o-led"] },
        groupsById,
      ),
    ).toBe(false);
  });

  it("number_range respects min/max and rejects products without the spec", () => {
    expect(
      productMatchesDynamicFilters(
        productBoschCordless,
        { [powerGroup.id]: { min: 50, max: 100 } },
        groupsById,
      ),
    ).toBe(true);
    expect(
      productMatchesDynamicFilters(
        productBoschCordless,
        { [powerGroup.id]: { min: 100, max: null } },
        groupsById,
      ),
    ).toBe(false);
    expect(
      productMatchesDynamicFilters(
        { filterKeys: [], spec: {} },
        { [powerGroup.id]: { min: 1, max: 10 } },
        groupsById,
      ),
    ).toBe(false);
  });

  it("ignores number_range groups when both bounds are null", () => {
    expect(
      productMatchesDynamicFilters(
        { filterKeys: [], spec: {} },
        { [powerGroup.id]: { min: null, max: null } },
        groupsById,
      ),
    ).toBe(true);
  });

  it("requires every group to match (AND across groups)", () => {
    expect(
      productMatchesDynamicFilters(
        productMakitaCordlessLed,
        {
          [brandGroup.id]: ["o-makita"],
          [featureGroup.id]: ["o-cordless", "o-led"],
          [powerGroup.id]: { min: 100, max: 200 },
        },
        groupsById,
      ),
    ).toBe(true);
    expect(
      productMatchesDynamicFilters(
        productMakitaCordlessLed,
        {
          [brandGroup.id]: ["o-bosch"],
          [featureGroup.id]: ["o-cordless"],
        },
        groupsById,
      ),
    ).toBe(false);
  });

  it("excludeGroupId skips that group while keeping others active (facet-count base)", () => {
    // Without excluding the brand group the Bosch product would fail
    // (brand selection is "Makita") — passing excludeGroupId flips that.
    expect(
      productMatchesDynamicFilters(
        productBoschCordless,
        {
          [brandGroup.id]: ["o-makita"],
          [featureGroup.id]: ["o-cordless"],
        },
        groupsById,
      ),
    ).toBe(false);
    expect(
      productMatchesDynamicFilters(
        productBoschCordless,
        {
          [brandGroup.id]: ["o-makita"],
          [featureGroup.id]: ["o-cordless"],
        },
        groupsById,
        { excludeGroupId: brandGroup.id },
      ),
    ).toBe(true);
  });

  it("excludeGroupId still enforces all OTHER groups", () => {
    // Brand excluded but feature group still requires both 'cordless' AND 'led'.
    expect(
      productMatchesDynamicFilters(
        productBoschCordless,
        {
          [brandGroup.id]: ["o-makita"],
          [featureGroup.id]: ["o-cordless", "o-led"],
        },
        groupsById,
        { excludeGroupId: brandGroup.id },
      ),
    ).toBe(false);
  });

  it("accepts asset-shaped objects (filterKeys + coerced spec from spec_summary)", () => {
    // Mirrors what app/pages/product-[group]/index.vue feeds the matcher when
    // listingMode === 'assets' (migration 043 gave assets the same filter_keys
    // column). Extra fields like categories / pricing are ignored by the
    // structural type and must not interfere with matching.
    const assetLike = {
      filterKeys: ["brand__makita", "feature__cordless"],
      spec: { power: "120 W" },
      categories: ["power_tools", "drilling"],
      pricing: { daily: 500 },
    };
    expect(
      productMatchesDynamicFilters(
        assetLike,
        {
          [brandGroup.id]: ["o-makita"],
          [featureGroup.id]: ["o-cordless"],
          [powerGroup.id]: { min: 100, max: 150 },
        },
        groupsById,
      ),
    ).toBe(true);
  });
});
