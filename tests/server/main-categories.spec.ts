import { describe, expect, it } from "vitest";
import { asMainCategoryEntityTypes } from "../../server/utils/admin-main-categories";
import { mapPublicMainCategory } from "../../server/utils/main-categories";

describe("asMainCategoryEntityTypes", () => {
  it("keeps valid entity types unique and falls back to product", () => {
    expect(
      asMainCategoryEntityTypes(["asset", "asset", "blog", "invalid"]),
    ).toEqual(["asset", "blog"]);

    expect(asMainCategoryEntityTypes(["invalid"])).toEqual(["product"]);
  });
});

describe("mapPublicMainCategory", () => {
  it("maps DB rows for storefront category selectors", () => {
    const mapped = mapPublicMainCategory({
      key: "rental_tools",
      label_th: "เครื่องมือเช่า",
      label_en: "Rental Tools",
      icon: "bx:wrench",
      entity_types: ["asset"],
      is_active: true,
      sort_order: 3,
    });

    expect(mapped).toMatchObject({
      key: "rental_tools",
      labelTh: "เครื่องมือเช่า",
      labelEn: "Rental Tools",
      entityTypes: ["asset"],
      isActive: true,
      sortOrder: 3,
    });
  });
});
