/**
 * Targeted tests for the Phase 1 rental-scope category filter fix on /search.
 *
 * Covers the pure, framework-free logic pieces that can run in Node.js:
 *   1. Rental asset category matching predicate (rentalResults filter logic)
 *   2. readCategoryQuery behaviour change (via readQueryString)
 *   3. rentalCategoryOptions building logic (inline mirror of the computed)
 *   4. rentalCategoryLabels derivation
 *
 * Component-level reactive wiring — e.g. scope-switch resets selectedCategory,
 * SearchFilters receives the correct :category-options prop — requires manual
 * smoke testing as documented in the completion report.
 */

import { describe, expect, it } from "vitest";
import { readQueryString } from "~/utils/filter-query";
import { mainCategories, mockSubCategories } from "~/mock/categories";
import { productMatchesDynamicFilters } from "~/utils/dynamic-filters";
import type {
  FilterGroup,
  DynamicFilterValue,
} from "~/composables/useFilterGroups";

// ─── 1. Rental asset category matching predicate ──────────────────────────────
// Mirrors the filter used by rentalResults in search.vue:
//   asset.mainCategoryKey === selectedCategory
//   || asset.categories.includes(selectedCategory)

function assetMatchesCategory(
  asset: { mainCategoryKey?: string; categories: string[] },
  selectedCategory: string,
): boolean {
  if (selectedCategory === "all") return true;
  return (
    asset.mainCategoryKey === selectedCategory ||
    asset.categories.includes(selectedCategory)
  );
}

describe("rental asset category matching (rentalResults predicate)", () => {
  const drill = {
    mainCategoryKey: "mechanic_tools",
    categories: ["mechanic_tools", "power_tools_rental"],
  };

  it("matches when selectedCategory equals mainCategoryKey", () => {
    expect(assetMatchesCategory(drill, "mechanic_tools")).toBe(true);
  });

  it("matches when selectedCategory is in asset.categories array", () => {
    expect(assetMatchesCategory(drill, "power_tools_rental")).toBe(true);
  });

  it("returns true when selectedCategory is 'all' (no filter active)", () => {
    expect(assetMatchesCategory(drill, "all")).toBe(true);
  });

  it("does not match an unrelated product-catalog category key", () => {
    expect(assetMatchesCategory(drill, "construction_consumables")).toBe(false);
  });

  it("does not match an unrelated product-catalog category key (ppe_general)", () => {
    expect(assetMatchesCategory(drill, "ppe_general")).toBe(false);
  });
});

// ─── 2. readCategoryQuery behaviour after Phase-1 fix ────────────────────────
// Before fix: readQueryString(value) was further gated by mainCategoryKeySet.has()
// so asset-only keys (absent from the hardcoded product mock) were silently
// collapsed to "all".
//
// After fix: readCategoryQuery simply returns readQueryString(value) || "all".
// This is verified here by showing that readQueryString correctly passes through
// any non-empty string — including rental-only keys — without a key-set gate.

describe("readCategoryQuery behaviour (via readQueryString)", () => {
  it("passes through a rental-only category key not in the product mock set", () => {
    // "power_tools_rental" is not in the hardcoded mainCategories mock.
    // Old guard would have rejected it → "all". New behaviour preserves it.
    const raw = readQueryString("power_tools_rental");
    expect(raw || "all").toBe("power_tools_rental");
  });

  it("passes through a standard product main-category key (no regression)", () => {
    const raw = readQueryString("mechanic_tools");
    expect(raw || "all").toBe("mechanic_tools");
  });

  it("returns 'all' for an empty string value", () => {
    expect(readQueryString("") || "all").toBe("all");
  });

  it("returns 'all' for undefined (missing query param)", () => {
    expect(readQueryString(undefined) || "all").toBe("all");
  });

  it("takes the first element when value is an array", () => {
    const raw = readQueryString(["power_tools_rental", "mechanic_tools"]);
    expect(raw || "all").toBe("power_tools_rental");
  });
});

// ─── 3. rentalCategoryOptions building logic ─────────────────────────────────
// Inline mirror of the rentalCategoryOptions computed added to search.vue.
// Tests that the option list is built from DB-backed asset categories first,
// with asset mainCategoryKey values as graceful fallback for unlisted keys.

interface MinStorefrontCategory {
  key: string;
  labelEn: string;
  labelTh: string;
}
interface MinAsset {
  mainCategoryKey?: string;
}

// Mirrors the full rentalCategoryOptions computed from search.vue:
// returns undefined (not []) when the result would be empty so that
// SearchFilters falls back gracefully instead of hiding its dropdown.
function buildRentalCategoryOptions(
  storefrontCategories: MinStorefrontCategory[],
  assets: MinAsset[],
  locale: "en" | "th" = "en",
): { value: string; label: string }[] | undefined {
  const optionsByValue = new Map<string, { value: string; label: string }>();
  for (const item of storefrontCategories) {
    const label =
      locale === "th"
        ? item.labelTh || item.labelEn || item.key
        : item.labelEn || item.labelTh || item.key;
    optionsByValue.set(item.key, { value: item.key, label });
  }
  for (const asset of assets) {
    const key = asset.mainCategoryKey;
    if (key && !optionsByValue.has(key)) {
      optionsByValue.set(key, { value: key, label: key });
    }
  }
  const result = [...optionsByValue.values()];
  return result.length > 0 ? result : undefined;
}

const storefrontAssetCategories: MinStorefrontCategory[] = [
  {
    key: "mechanic_tools",
    labelEn: "Mechanic Tools",
    labelTh: "เครื่องมือช่าง",
  },
  {
    key: "measuring_tools",
    labelEn: "Measuring Tools",
    labelTh: "เครื่องมือวัด",
  },
];

describe("rentalCategoryOptions building logic", () => {
  it("includes DB-backed asset categories in the option list", () => {
    const options = buildRentalCategoryOptions(storefrontAssetCategories, []);
    expect(options.map((o) => o.value)).toContain("mechanic_tools");
    expect(options.map((o) => o.value)).toContain("measuring_tools");
  });

  it("uses English label by default", () => {
    const options = buildRentalCategoryOptions(storefrontAssetCategories, []);
    expect(options.find((o) => o.value === "mechanic_tools")?.label).toBe(
      "Mechanic Tools",
    );
  });

  it("uses Thai label when locale is 'th'", () => {
    const options = buildRentalCategoryOptions(
      storefrontAssetCategories,
      [],
      "th",
    );
    expect(options.find((o) => o.value === "measuring_tools")?.label).toBe(
      "เครื่องมือวัด",
    );
  });

  it("appends asset mainCategoryKey not in storefront list as raw-key fallback", () => {
    const assets: MinAsset[] = [{ mainCategoryKey: "power_tools_rental" }];
    const options = buildRentalCategoryOptions(
      storefrontAssetCategories,
      assets,
    );
    const fallback = options.find((o) => o.value === "power_tools_rental");
    expect(fallback).toBeDefined();
    expect(fallback?.label).toBe("power_tools_rental");
  });

  it("does NOT duplicate a key already covered by the storefront list", () => {
    const assets: MinAsset[] = [
      { mainCategoryKey: "mechanic_tools" }, // already in storefront list
    ];
    const options = buildRentalCategoryOptions(
      storefrontAssetCategories,
      assets,
    );
    const mechOptions = options.filter((o) => o.value === "mechanic_tools");
    expect(mechOptions).toHaveLength(1);
  });

  it("omits assets with undefined mainCategoryKey", () => {
    const assets: MinAsset[] = [{ mainCategoryKey: undefined }];
    const options = buildRentalCategoryOptions(
      storefrontAssetCategories,
      assets,
    );
    expect(options.map((o) => o.value)).not.toContain(undefined);
  });

  it("returns undefined (not []) when no storefront categories and no assets", () => {
    // An empty array would be truthy and cause SearchFilters to hide its dropdown.
    // Returning undefined lets SearchFilters fall back to its product-category path.
    expect(buildRentalCategoryOptions([], [])).toBeUndefined();
  });
});

// ─── 5. mainCategoryKey resolution (Phase 2 fix) ─────────────────────────────
// Mirrors the updated mainCategoryKey computed in search.vue after the Phase 2
// fix that adds allMainCategoryKeySet (mock ∪ DB-backed) to the resolver.
//
// Resolution order (matching /product-[group]/index.vue):
//   1. "all" or empty → null
//   2. allMainCategoryKeySet.has(selected) → selected (direct key pass-through)
//   3. subToMainCategory.get(selected) → mapped main key (mock sub-category IDs)
//   4. otherwise → null

const MOCK_CATEGORY_KEY_SET = new Set(mainCategories.map((m) => m.key));
const MOCK_SUB_TO_MAIN = new Map(
  mockSubCategories.map((s) => [s.id, s.mainCategoryKey] as const),
);

function resolveMainCategoryKey(
  selected: string,
  dbBackedKeySet: Set<string>,
): string | null {
  if (!selected || selected === "all") return null;
  const allKeys = new Set([...MOCK_CATEGORY_KEY_SET, ...dbBackedKeySet]);
  if (allKeys.has(selected)) return selected;
  return MOCK_SUB_TO_MAIN.get(selected) ?? null;
}

// DB-only keys that are absent from the legacy mock set.
// Two separate fixtures represent the two entity types that /search must handle.
const DB_ONLY_ASSET_KEYS = new Set(["power_tools_rental", "scaffolding"]);
const DB_ONLY_PRODUCT_KEYS = new Set([
  "industrial_automation",
  "fluid_control",
]);

// Combined set as storefrontMainCategoryKeySet now builds in search.vue:
// union of productMainCategories.value.map(k) ∪ rentalMainCategories.value.map(k)
const DB_COMBINED_KEYS = new Set([
  ...DB_ONLY_ASSET_KEYS,
  ...DB_ONLY_PRODUCT_KEYS,
]);

describe("mainCategoryKey resolution", () => {
  // ── Legacy mock behaviour (must not regress) ───────────────────────────────

  it("resolves a legacy mock main-category key", () => {
    expect(resolveMainCategoryKey("mechanic_tools", new Set())).toBe(
      "mechanic_tools",
    );
  });

  it("resolves all 7 original mock main-category keys without a DB set", () => {
    for (const cat of mainCategories) {
      expect(resolveMainCategoryKey(cat.key, new Set())).toBe(cat.key);
    }
  });

  it("resolves a mock sub-category ID to its parent main-category key", () => {
    const first = mockSubCategories[7]; // first mechanic_tools sub in mock
    expect(resolveMainCategoryKey(first.id, new Set())).toBe(
      first.mainCategoryKey,
    );
  });

  // ── DB-backed asset keys ───────────────────────────────────────────────────

  it("resolves a DB-backed asset-only category key (rental scope)", () => {
    expect(
      resolveMainCategoryKey("power_tools_rental", DB_ONLY_ASSET_KEYS),
    ).toBe("power_tools_rental");
  });

  it("resolves a second DB-backed asset-only key", () => {
    expect(resolveMainCategoryKey("scaffolding", DB_ONLY_ASSET_KEYS)).toBe(
      "scaffolding",
    );
  });

  // ── DB-backed product keys (new in S1 completion) ─────────────────────────

  it("resolves a DB-backed product-only category key (product scope)", () => {
    expect(
      resolveMainCategoryKey("industrial_automation", DB_ONLY_PRODUCT_KEYS),
    ).toBe("industrial_automation");
  });

  it("resolves a second DB-backed product-only key", () => {
    expect(resolveMainCategoryKey("fluid_control", DB_ONLY_PRODUCT_KEYS)).toBe(
      "fluid_control",
    );
  });

  // ── Combined product + asset DB set (storefrontMainCategoryKeySet union) ───

  it("resolves a DB asset key from the combined product+asset set", () => {
    expect(resolveMainCategoryKey("power_tools_rental", DB_COMBINED_KEYS)).toBe(
      "power_tools_rental",
    );
  });

  it("resolves a DB product key from the combined product+asset set", () => {
    expect(
      resolveMainCategoryKey("industrial_automation", DB_COMBINED_KEYS),
    ).toBe("industrial_automation");
  });

  // ── Null / unknown cases ──────────────────────────────────────────────────

  it("returns null when the DB set is empty and the key is not in the mock", () => {
    expect(resolveMainCategoryKey("power_tools_rental", new Set())).toBeNull();
  });

  it("returns null for 'all' regardless of DB key set", () => {
    expect(resolveMainCategoryKey("all", DB_COMBINED_KEYS)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(resolveMainCategoryKey("", DB_COMBINED_KEYS)).toBeNull();
  });

  it("returns null for a completely unknown key", () => {
    expect(
      resolveMainCategoryKey("does_not_exist_anywhere", DB_COMBINED_KEYS),
    ).toBeNull();
  });

  it("does not resolve a key that is absent from the provided DB set", () => {
    // power_tools_rental is an asset key; NOT included in the product-only set
    expect(
      resolveMainCategoryKey("power_tools_rental", DB_ONLY_PRODUCT_KEYS),
    ).toBeNull();
  });

  it("does not resolve a product key that is absent from the asset-only set", () => {
    expect(
      resolveMainCategoryKey("industrial_automation", DB_ONLY_ASSET_KEYS),
    ).toBeNull();
  });
});

// ─── 6. Rental asset dynamic filter matching (S2) ────────────────────────────
// Mirrors the three-step rentalResults predicate added to search.vue in S2:
//   step 1: text match          (section 1 above)
//   step 2: category match      (section 1 above)
//   step 3: dynamic filter match ← tested here
//
// The helper below replicates the exact chain used inside rentalResults:
//   assetSpecForMatcher(asset) → productMatchesDynamicFilters(...)

function specForMatcher(
  specSummary: Record<string, unknown>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(specSummary)) {
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean")
      out[k] = String(v);
  }
  return out;
}

function assetMatchesDynamicFilters(
  asset: { filterKeys: string[]; specSummary: Record<string, unknown> },
  selections: Record<string, DynamicFilterValue>,
  groupsById: Map<string, FilterGroup>,
): boolean {
  return productMatchesDynamicFilters(
    { filterKeys: asset.filterKeys, spec: specForMatcher(asset.specSummary) },
    selections,
    groupsById,
  );
}

// Mirrors the gated step 3 inside rentalResults after the S2 scope-isolation fix:
//   rental scope  → run productMatchesDynamicFilters
//   any other scope → skip (return true)
function rentalResultsPassesDynamicStep(
  asset: { filterKeys: string[]; specSummary: Record<string, unknown> },
  selections: Record<string, DynamicFilterValue>,
  groupsById: Map<string, FilterGroup>,
  activeScope: string,
): boolean {
  if (activeScope === "rental") {
    return productMatchesDynamicFilters(
      { filterKeys: asset.filterKeys, spec: specForMatcher(asset.specSummary) },
      selections,
      groupsById,
    );
  }
  return true; // non-rental scopes skip dynamic filter matching
}

// ── Filter group fixture builders ─────────────────────────────────────────────

function makeOption(
  id: string,
  groupId: string,
  key: string,
): FilterGroup["options"][number] {
  return {
    id,
    groupId,
    key,
    labelTh: key,
    labelEn: key,
    isActive: true,
    sortOrder: 0,
  };
}

function makeCheckboxGroup(
  id: string,
  key: string,
  optionDefs: { id: string; key: string }[],
): FilterGroup {
  return {
    id,
    mainCategoryKey: "mechanic_tools",
    key,
    labelTh: key,
    labelEn: key,
    filterType: "checkbox",
    matchLogic: "or",
    specKey: null,
    isActive: true,
    sortOrder: 0,
    options: optionDefs.map((o) => makeOption(o.id, id, o.key)),
  };
}

function makeDropdownGroup(
  id: string,
  key: string,
  optionDefs: { id: string; key: string }[],
): FilterGroup {
  return { ...makeCheckboxGroup(id, key, optionDefs), filterType: "dropdown" };
}

function makeNumberRangeGroup(
  id: string,
  key: string,
  specKey: string,
): FilterGroup {
  return {
    id,
    mainCategoryKey: "mechanic_tools",
    key,
    labelTh: key,
    labelEn: key,
    filterType: "number_range",
    matchLogic: "or",
    specKey,
    isActive: true,
    sortOrder: 0,
    options: [],
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const cbGroup = makeCheckboxGroup("grp-cb", "power_source", [
  { id: "opt-cord", key: "cordless" },
  { id: "opt-elec", key: "electric" },
]);
const ddGroup = makeDropdownGroup("grp-dd", "brand_tier", [
  { id: "opt-pro", key: "professional" },
  { id: "opt-diy", key: "diy" },
]);
const nrGroup = makeNumberRangeGroup("grp-nr", "weight_kg", "weight_kg");

const cbGroupsById = new Map<string, FilterGroup>([[cbGroup.id, cbGroup]]);
const ddGroupsById = new Map<string, FilterGroup>([[ddGroup.id, ddGroup]]);
const nrGroupsById = new Map<string, FilterGroup>([[nrGroup.id, nrGroup]]);

describe("rental asset dynamic filter matching (S2)", () => {
  // ── Checkbox ──────────────────────────────────────────────────────────────

  it("checkbox: asset with matching filterKey is included", () => {
    const asset = {
      filterKeys: ["power_source__cordless"],
      specSummary: {},
    };
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-cb": ["opt-cord"] },
        cbGroupsById,
      ),
    ).toBe(true);
  });

  it("checkbox: asset without matching filterKey is excluded", () => {
    const asset = { filterKeys: ["power_source__electric"], specSummary: {} };
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-cb": ["opt-cord"] },
        cbGroupsById,
      ),
    ).toBe(false);
  });

  it("checkbox: asset with no filterKeys at all is excluded", () => {
    const asset = { filterKeys: [], specSummary: {} };
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-cb": ["opt-cord"] },
        cbGroupsById,
      ),
    ).toBe(false);
  });

  // ── Dropdown ──────────────────────────────────────────────────────────────

  it("dropdown: asset with matching filterKey is included", () => {
    const asset = { filterKeys: ["brand_tier__professional"], specSummary: {} };
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-dd": ["opt-pro"] },
        ddGroupsById,
      ),
    ).toBe(true);
  });

  it("dropdown: asset with non-selected filterKey is excluded", () => {
    const asset = { filterKeys: ["brand_tier__diy"], specSummary: {} };
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-dd": ["opt-pro"] },
        ddGroupsById,
      ),
    ).toBe(false);
  });

  // ── Number range ──────────────────────────────────────────────────────────

  it("number_range: asset spec inside range is included", () => {
    const asset = { filterKeys: [], specSummary: { weight_kg: 5 } };
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-nr": { min: 3, max: 10 } },
        nrGroupsById,
      ),
    ).toBe(true);
  });

  it("number_range: string spec value inside range is included", () => {
    const asset = { filterKeys: [], specSummary: { weight_kg: "5.5kg" } };
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-nr": { min: 3, max: 10 } },
        nrGroupsById,
      ),
    ).toBe(true);
  });

  it("number_range: asset spec below min is excluded", () => {
    const asset = { filterKeys: [], specSummary: { weight_kg: 1 } };
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-nr": { min: 3, max: 10 } },
        nrGroupsById,
      ),
    ).toBe(false);
  });

  it("number_range: asset spec above max is excluded", () => {
    const asset = { filterKeys: [], specSummary: { weight_kg: 15 } };
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-nr": { min: 3, max: 10 } },
        nrGroupsById,
      ),
    ).toBe(false);
  });

  it("number_range: asset with missing spec key is excluded", () => {
    const asset = { filterKeys: [], specSummary: {} };
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-nr": { min: 3, max: 10 } },
        nrGroupsById,
      ),
    ).toBe(false);
  });

  it("number_range: asset with non-numeric spec string is excluded", () => {
    const asset = { filterKeys: [], specSummary: { weight_kg: "heavy" } };
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-nr": { min: 3, max: 10 } },
        nrGroupsById,
      ),
    ).toBe(false);
  });

  // ── No active filters ─────────────────────────────────────────────────────

  it("no selections: any asset passes (unchanged behavior)", () => {
    const asset = { filterKeys: [], specSummary: {} };
    expect(assetMatchesDynamicFilters(asset, {}, cbGroupsById)).toBe(true);
  });

  it("empty selection array for a group is treated as inactive", () => {
    const asset = { filterKeys: [], specSummary: {} };
    expect(
      assetMatchesDynamicFilters(asset, { "grp-cb": [] }, cbGroupsById),
    ).toBe(true);
  });

  // ── No filter groups loaded ───────────────────────────────────────────────

  it("unknown group id in selections: skipped, asset passes", () => {
    // groupsById does not contain the group → treated as unknown → skipped
    const asset = { filterKeys: [], specSummary: {} };
    const emptyGroupsById = new Map<string, FilterGroup>();
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-nonexistent": ["opt-x"] },
        emptyGroupsById,
      ),
    ).toBe(true);
  });

  it("empty filterGroupsById: selections are skipped, asset passes", () => {
    const asset = { filterKeys: [], specSummary: {} };
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-cb": ["opt-cord"] },
        new Map<string, FilterGroup>(),
      ),
    ).toBe(true);
  });

  // ── Dynamic filter is additive: must still pass category + text guards ────

  it("asset that fails category check is excluded before dynamic filter runs", () => {
    // Simulates category pre-filter (step 2); dynamic filter result is irrelevant.
    // An asset with matching filterKeys but wrong category should be excluded.
    // We test the pure dynamic-filter step independently — it returns true:
    const asset = {
      filterKeys: ["power_source__cordless"],
      specSummary: {},
    };
    // Step 3 alone passes — exclusion comes from step 2 upstream
    expect(
      assetMatchesDynamicFilters(
        asset,
        { "grp-cb": ["opt-cord"] },
        cbGroupsById,
      ),
    ).toBe(true); // step 3 pass; step 2 exclusion tested in section 1
  });
});

// ─── 6b. S2 scope isolation: dynamic filter gate on activeScope ───────────────
// Verifies that step 3 (productMatchesDynamicFilters) inside rentalResults is
// only applied when activeScope === "rental".  When scope is "all" (or any other
// non-rental value) the step is skipped and the asset passes unconditionally.

describe("S2 scope isolation — dynamic filter gate", () => {
  const nonMatchingAsset = { filterKeys: [], specSummary: {} };
  const selection: Record<string, DynamicFilterValue> = {
    "grp-cb": ["opt-cord"],
  };

  it("rental scope: non-matching asset is excluded by dynamic filter", () => {
    expect(
      rentalResultsPassesDynamicStep(
        nonMatchingAsset,
        selection,
        cbGroupsById,
        "rental",
      ),
    ).toBe(false);
  });

  it("all scope: same non-matching asset is NOT excluded (pre-S2 behavior preserved)", () => {
    expect(
      rentalResultsPassesDynamicStep(
        nonMatchingAsset,
        selection,
        cbGroupsById,
        "all",
      ),
    ).toBe(true);
  });

  it("product scope: same non-matching asset is NOT excluded", () => {
    expect(
      rentalResultsPassesDynamicStep(
        nonMatchingAsset,
        selection,
        cbGroupsById,
        "product",
      ),
    ).toBe(true);
  });

  it("rental scope: matching asset still passes", () => {
    const matchingAsset = {
      filterKeys: ["power_source__cordless"],
      specSummary: {},
    };
    expect(
      rentalResultsPassesDynamicStep(
        matchingAsset,
        selection,
        cbGroupsById,
        "rental",
      ),
    ).toBe(true);
  });

  it("all scope: matching asset also passes (no change)", () => {
    const matchingAsset = {
      filterKeys: ["power_source__cordless"],
      specSummary: {},
    };
    expect(
      rentalResultsPassesDynamicStep(
        matchingAsset,
        selection,
        cbGroupsById,
        "all",
      ),
    ).toBe(true);
  });

  it("rental scope with no selections: any asset passes", () => {
    expect(
      rentalResultsPassesDynamicStep(
        nonMatchingAsset,
        {},
        cbGroupsById,
        "rental",
      ),
    ).toBe(true);
  });

  it("all scope with no selections: any asset passes", () => {
    expect(
      rentalResultsPassesDynamicStep(nonMatchingAsset, {}, cbGroupsById, "all"),
    ).toBe(true);
  });
});

// ─── 4. rentalCategoryLabels derivation ──────────────────────────────────────
// rentalCategoryLabels is Object.fromEntries(rentalCategoryOptions.map(...))
// Verify the label map is keyed correctly.

describe("rentalCategoryLabels derivation", () => {
  it("produces a key→label map from the options array", () => {
    const options = buildRentalCategoryOptions(storefrontAssetCategories, []);
    const labels = Object.fromEntries(options.map((o) => [o.value, o.label]));
    expect(labels["mechanic_tools"]).toBe("Mechanic Tools");
    expect(labels["measuring_tools"]).toBe("Measuring Tools");
  });
});

// ─── 7. S4 productCategoryOptions building logic ─────────────────────────────
// Inline mirror of the productCategoryOptions computed added to search.vue.
// Products have no graceful-fallback from loaded results — the option list is
// built purely from DB-backed product main categories.

function buildProductCategoryOptions(
  storefrontCategories: MinStorefrontCategory[],
  locale: "en" | "th" = "en",
): { value: string; label: string }[] | undefined {
  const optionsByValue = new Map<string, { value: string; label: string }>();
  for (const item of storefrontCategories) {
    const label =
      locale === "th"
        ? item.labelTh || item.labelEn || item.key
        : item.labelEn || item.labelTh || item.key;
    optionsByValue.set(item.key, { value: item.key, label });
  }
  const result = [...optionsByValue.values()];
  return result.length > 0 ? result : undefined;
}

const storefrontProductCategories: MinStorefrontCategory[] = [
  {
    key: "mechanic_tools",
    labelEn: "Mechanic Tools",
    labelTh: "เครื่องมือช่าง",
  },
  {
    key: "safety_equipment",
    labelEn: "Safety Equipment",
    labelTh: "อุปกรณ์ความปลอดภัย",
  },
  {
    key: "construction_consumables",
    labelEn: "Construction Consumables",
    labelTh: "วัสดุก่อสร้าง",
  },
];

describe("S4 productCategoryOptions building logic", () => {
  it("includes all DB-backed product categories in the option list", () => {
    const options = buildProductCategoryOptions(storefrontProductCategories);
    const values = options!.map((o) => o.value);
    expect(values).toContain("mechanic_tools");
    expect(values).toContain("safety_equipment");
    expect(values).toContain("construction_consumables");
  });

  it("uses English label when locale is 'en'", () => {
    const options = buildProductCategoryOptions(
      storefrontProductCategories,
      "en",
    );
    const opt = options!.find((o) => o.value === "safety_equipment");
    expect(opt?.label).toBe("Safety Equipment");
  });

  it("uses Thai label when locale is 'th'", () => {
    const options = buildProductCategoryOptions(
      storefrontProductCategories,
      "th",
    );
    const opt = options!.find((o) => o.value === "mechanic_tools");
    expect(opt?.label).toBe("เครื่องมือช่าง");
  });

  it("falls back to labelEn when labelTh is empty (th locale)", () => {
    const cats: MinStorefrontCategory[] = [
      { key: "db_only_key", labelEn: "DB Only", labelTh: "" },
    ];
    const options = buildProductCategoryOptions(cats, "th");
    expect(options![0].label).toBe("DB Only");
  });

  it("falls back to key when both labels are empty", () => {
    const cats: MinStorefrontCategory[] = [
      { key: "raw_key", labelEn: "", labelTh: "" },
    ];
    const options = buildProductCategoryOptions(cats);
    expect(options![0].label).toBe("raw_key");
  });

  it("returns undefined (not []) when no categories are available", () => {
    const options = buildProductCategoryOptions([]);
    expect(options).toBeUndefined();
  });

  it("deduplicates entries when the same key appears twice", () => {
    const cats: MinStorefrontCategory[] = [
      { key: "mechanic_tools", labelEn: "Mechanic Tools", labelTh: "" },
      { key: "mechanic_tools", labelEn: "Mechanic Tools Dup", labelTh: "" },
    ];
    const options = buildProductCategoryOptions(cats);
    expect(options!.filter((o) => o.value === "mechanic_tools")).toHaveLength(
      1,
    );
  });
});

// ─── 8. S4/S5 scope routing for category options ─────────────────────────────
// Verifies the conditional expression used in both SearchFilters instances
// after S5 (4-way: all → product → rental → undefined).

function scopedCategoryOptions(
  activeScope: string,
  allOptions: { value: string; label: string }[] | undefined,
  productOptions: { value: string; label: string }[] | undefined,
  rentalOptions: { value: string; label: string }[] | undefined,
): { value: string; label: string }[] | undefined {
  if (activeScope === "all") return allOptions;
  if (activeScope === "product") return productOptions;
  if (activeScope === "rental") return rentalOptions;
  return undefined;
}

describe("S4/S5 scope routing — category options prop", () => {
  const allOpts = [{ value: "mechanic_tools", label: "Mechanic Tools" }];
  const productOpts = [
    { value: "safety_equipment", label: "Safety Equipment" },
  ];
  const rentalOpts = [{ value: "measuring_tools", label: "Measuring Tools" }];

  it("all scope returns allCategoryOptions", () => {
    expect(scopedCategoryOptions("all", allOpts, productOpts, rentalOpts)).toBe(
      allOpts,
    );
  });

  it("product scope returns productCategoryOptions", () => {
    expect(
      scopedCategoryOptions("product", allOpts, productOpts, rentalOpts),
    ).toBe(productOpts);
  });

  it("rental scope returns rentalCategoryOptions", () => {
    expect(
      scopedCategoryOptions("rental", allOpts, productOpts, rentalOpts),
    ).toBe(rentalOpts);
  });

  it("service scope returns undefined", () => {
    expect(
      scopedCategoryOptions("service", allOpts, productOpts, rentalOpts),
    ).toBeUndefined();
  });

  it("all scope with undefined options (still loading) returns undefined", () => {
    expect(
      scopedCategoryOptions("all", undefined, productOpts, rentalOpts),
    ).toBeUndefined();
  });

  it("product scope with undefined options (still loading) returns undefined", () => {
    expect(
      scopedCategoryOptions("product", allOpts, undefined, rentalOpts),
    ).toBeUndefined();
  });

  it("rental scope with undefined options (still loading) returns undefined", () => {
    expect(
      scopedCategoryOptions("rental", allOpts, productOpts, undefined),
    ).toBeUndefined();
  });
});

// ─── 9. S5 allCategoryOptions building logic ─────────────────────────────────
// Inline mirror of the allCategoryOptions computed added to search.vue.
// Combines product + asset main categories; deduplicates by key (product wins).

function buildAllCategoryOptions(
  productCategories: MinStorefrontCategory[],
  assetCategories: MinStorefrontCategory[],
  locale: "en" | "th" = "en",
): { value: string; label: string }[] | undefined {
  const optionsByValue = new Map<string, { value: string; label: string }>();
  for (const item of productCategories) {
    const label =
      locale === "th"
        ? item.labelTh || item.labelEn || item.key
        : item.labelEn || item.labelTh || item.key;
    optionsByValue.set(item.key, { value: item.key, label });
  }
  for (const item of assetCategories) {
    if (!optionsByValue.has(item.key)) {
      const label =
        locale === "th"
          ? item.labelTh || item.labelEn || item.key
          : item.labelEn || item.labelTh || item.key;
      optionsByValue.set(item.key, { value: item.key, label });
    }
  }
  const result = [...optionsByValue.values()];
  return result.length > 0 ? result : undefined;
}

const productCats: MinStorefrontCategory[] = [
  {
    key: "mechanic_tools",
    labelEn: "Mechanic Tools",
    labelTh: "เครื่องมือช่าง",
  },
  {
    key: "safety_equipment",
    labelEn: "Safety Equipment",
    labelTh: "อุปกรณ์ความปลอดภัย",
  },
];
const assetCats: MinStorefrontCategory[] = [
  {
    key: "measuring_tools",
    labelEn: "Measuring Tools",
    labelTh: "เครื่องมือวัด",
  },
  {
    key: "mechanic_tools",
    labelEn: "Mechanic Tools (Asset)",
    labelTh: "เครื่องมือช่าง (เช่า)",
  },
];

describe("S5 allCategoryOptions building logic", () => {
  it("includes categories from both product and asset sources", () => {
    const options = buildAllCategoryOptions(productCats, assetCats);
    const values = options!.map((o) => o.value);
    expect(values).toContain("mechanic_tools");
    expect(values).toContain("safety_equipment");
    expect(values).toContain("measuring_tools");
  });

  it("deduplicates keys that appear in both sources", () => {
    const options = buildAllCategoryOptions(productCats, assetCats);
    expect(options!.filter((o) => o.value === "mechanic_tools")).toHaveLength(
      1,
    );
  });

  it("product label wins when both sources share the same key", () => {
    const options = buildAllCategoryOptions(productCats, assetCats);
    const opt = options!.find((o) => o.value === "mechanic_tools");
    expect(opt?.label).toBe("Mechanic Tools"); // product label, not asset variant
  });

  it("asset-only category is still included after deduplication", () => {
    const options = buildAllCategoryOptions(productCats, assetCats);
    const opt = options!.find((o) => o.value === "measuring_tools");
    expect(opt?.label).toBe("Measuring Tools");
  });

  it("uses Thai labels when locale is 'th'", () => {
    const options = buildAllCategoryOptions(productCats, assetCats, "th");
    const opt = options!.find((o) => o.value === "safety_equipment");
    expect(opt?.label).toBe("อุปกรณ์ความปลอดภัย");
  });

  it("asset-only key uses Thai label when locale is 'th'", () => {
    const options = buildAllCategoryOptions(productCats, assetCats, "th");
    const opt = options!.find((o) => o.value === "measuring_tools");
    expect(opt?.label).toBe("เครื่องมือวัด");
  });

  it("returns undefined (not []) when both sources are empty", () => {
    expect(buildAllCategoryOptions([], [])).toBeUndefined();
  });

  it("returns options when only product source has entries", () => {
    const options = buildAllCategoryOptions(productCats, []);
    expect(options).not.toBeUndefined();
    expect(options!.map((o) => o.value)).toContain("mechanic_tools");
  });

  it("returns options when only asset source has entries", () => {
    const options = buildAllCategoryOptions([], assetCats);
    expect(options).not.toBeUndefined();
    expect(options!.map((o) => o.value)).toContain("measuring_tools");
  });
});

// ─── 10. P6 product-[group] listing-mode category option routing ──────────────
// Mirrors the ternary used in both SearchFilters instances of
// product-[group]/index.vue:
//   listingMode === "assets"  → rentalCategoryOptions
//   listingMode === "products" → productCategoryOptions
//
// Also covers the productCategoryOptions builder behavior for the product
// listing path: empty/loading guard and label resolution.

type ListingMode = "products" | "assets";

function listingModeCategoryOptions(
  listingMode: ListingMode,
  productOptions: { value: string; label: string }[] | undefined,
  rentalOptions: { value: string; label: string }[] | undefined,
): { value: string; label: string }[] | undefined {
  return listingMode === "assets" ? rentalOptions : productOptions;
}

describe("P6 product-[group] listing-mode category option routing", () => {
  const productOpts = [{ value: "mechanic_tools", label: "Mechanic Tools" }];
  const rentalOpts = [{ value: "measuring_tools", label: "Measuring Tools" }];

  it("products mode returns productCategoryOptions", () => {
    expect(
      listingModeCategoryOptions("products", productOpts, rentalOpts),
    ).toBe(productOpts);
  });

  it("assets mode returns rentalCategoryOptions", () => {
    expect(listingModeCategoryOptions("assets", productOpts, rentalOpts)).toBe(
      rentalOpts,
    );
  });

  it("products mode with undefined options (still loading) returns undefined", () => {
    expect(
      listingModeCategoryOptions("products", undefined, rentalOpts),
    ).toBeUndefined();
  });

  it("assets mode with undefined options (still loading) returns undefined", () => {
    expect(
      listingModeCategoryOptions("assets", productOpts, undefined),
    ).toBeUndefined();
  });
});

describe("P6 productCategoryOptions builder for product listing routes", () => {
  it("builds options from DB-backed storefrontMainCategories", () => {
    // Reuses buildProductCategoryOptions already tested in §7.
    // Verifies the same builder is applicable to the product-[group] route.
    const options = buildProductCategoryOptions(storefrontProductCategories);
    expect(options).not.toBeUndefined();
    const values = options!.map((o) => o.value);
    expect(values).toContain("mechanic_tools");
    expect(values).toContain("safety_equipment");
    expect(values).toContain("construction_consumables");
  });

  it("returns undefined (not []) when storefrontMainCategories is empty (loading state)", () => {
    expect(buildProductCategoryOptions([])).toBeUndefined();
  });

  it("does not include rental-only asset categories when building product options", () => {
    // storefrontMainCategories for product mode only returns product entity_type rows
    const productOnlyCats: MinStorefrontCategory[] = [
      { key: "mechanic_tools", labelEn: "Mechanic Tools", labelTh: "" },
    ];
    const options = buildProductCategoryOptions(productOnlyCats);
    const values = options!.map((o) => o.value);
    expect(values).not.toContain("measuring_tools"); // asset-only key absent
  });
});
