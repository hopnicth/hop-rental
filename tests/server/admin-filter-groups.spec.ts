import { describe, expect, it } from "vitest";
import {
  buildFilterGroupCreatePayload,
  buildFilterGroupUpdatePayload,
  buildFilterOptionCreatePayload,
  buildFilterOptionUpdatePayload,
  mapAdminFilterGroup,
  mapAdminFilterOption,
} from "../../server/utils/admin-filter-groups";

describe("buildFilterGroupCreatePayload", () => {
  it("normalizes keys and defaults match_logic / sort_order", () => {
    const payload = buildFilterGroupCreatePayload({
      mainCategoryKey: "Power-Tools",
      key: "Brand Name",
      labelTh: "ยี่ห้อ",
      labelEn: "Brand",
      filterType: "checkbox",
    });

    expect(payload.main_category_key).toBe("power_tools");
    expect(payload.key).toBe("brand_name");
    expect(payload.filter_type).toBe("checkbox");
    expect(payload.match_logic).toBe("or");
    expect(payload.spec_key).toBeNull();
    expect(payload.is_active).toBe(true);
    expect(payload.sort_order).toBe(0);
  });

  it("requires specKey when filterType is number_range", () => {
    expect(() =>
      buildFilterGroupCreatePayload({
        mainCategoryKey: "power_tools",
        key: "power",
        labelTh: "กำลังไฟ",
        labelEn: "Power",
        filterType: "number_range",
      }),
    ).toThrowError(/specKey is required/);
  });

  it("retains specKey only for number_range groups", () => {
    const payload = buildFilterGroupCreatePayload({
      mainCategoryKey: "power_tools",
      key: "power",
      labelTh: "กำลังไฟ",
      labelEn: "Power",
      filterType: "number_range",
      specKey: "power",
      matchLogic: "and",
      sortOrder: -3,
    });
    expect(payload.spec_key).toBe("power");
    expect(payload.match_logic).toBe("and");
    expect(payload.sort_order).toBe(0);

    const dropdown = buildFilterGroupCreatePayload({
      mainCategoryKey: "power_tools",
      key: "color",
      labelTh: "สี",
      labelEn: "Color",
      filterType: "dropdown",
      specKey: "ignored",
    });
    expect(dropdown.spec_key).toBeNull();
  });

  it("rejects unknown filterType / matchLogic", () => {
    expect(() =>
      buildFilterGroupCreatePayload({
        mainCategoryKey: "power_tools",
        key: "brand",
        labelTh: "ยี่ห้อ",
        labelEn: "Brand",
        filterType: "rangefinder",
      }),
    ).toThrowError(/filterType must be one of/);

    expect(() =>
      buildFilterGroupCreatePayload({
        mainCategoryKey: "power_tools",
        key: "brand",
        labelTh: "ยี่ห้อ",
        labelEn: "Brand",
        filterType: "checkbox",
        matchLogic: "xor",
      }),
    ).toThrowError(/matchLogic must be one of/);
  });
});

describe("buildFilterGroupUpdatePayload", () => {
  it("includes the normalized key (rename allowed for super-admins)", () => {
    const payload = buildFilterGroupUpdatePayload({
      mainCategoryKey: "power_tools",
      key: "Brand-Name",
      labelTh: "ยี่ห้อ",
      labelEn: "Brand",
      filterType: "checkbox",
      isActive: false,
    });
    expect(payload.key).toBe("brand_name");
    expect(payload.is_active).toBe(false);
  });

  it("requires a non-empty key", () => {
    expect(() =>
      buildFilterGroupUpdatePayload({
        mainCategoryKey: "power_tools",
        labelTh: "ยี่ห้อ",
        labelEn: "Brand",
        filterType: "checkbox",
      }),
    ).toThrowError(/key/);
  });
});

describe("buildFilterOptionCreatePayload / Update", () => {
  it("create payload binds the supplied groupId and normalizes the option key", () => {
    const payload = buildFilterOptionCreatePayload("g-1", {
      key: "Cordless 18V",
      labelTh: "ไร้สาย 18V",
      labelEn: "Cordless 18V",
      sortOrder: 5,
    });
    expect(payload.group_id).toBe("g-1");
    expect(payload.key).toBe("cordless_18v");
    expect(payload.sort_order).toBe(5);
    expect(payload.is_active).toBe(true);
  });

  it("update payload includes a normalized key but never group_id", () => {
    const payload = buildFilterOptionUpdatePayload({
      key: "Cordless 18V",
      labelTh: "ใหม่",
      labelEn: "New",
      isActive: false,
      sortOrder: 2,
    });
    expect(payload.key).toBe("cordless_18v");
    expect(payload).not.toHaveProperty("group_id");
    expect(payload.is_active).toBe(false);
  });

  it("update payload rejects a missing key", () => {
    expect(() =>
      buildFilterOptionUpdatePayload({
        labelTh: "ใหม่",
        labelEn: "New",
      }),
    ).toThrowError(/key/);
  });
});

describe("mapAdminFilterGroup", () => {
  it("sorts nested options by sort_order then label", () => {
    const mapped = mapAdminFilterGroup({
      id: "g-1",
      main_category_key: "power_tools",
      key: "brand",
      label_th: "ยี่ห้อ",
      label_en: "Brand",
      filter_type: "checkbox",
      match_logic: "or",
      spec_key: null,
      is_active: true,
      sort_order: 0,
      options: [
        {
          id: "o-2",
          group_id: "g-1",
          key: "bosch",
          label_th: "Bosch",
          label_en: "Bosch",
          is_active: true,
          sort_order: 1,
        },
        {
          id: "o-1",
          group_id: "g-1",
          key: "makita",
          label_th: "Makita",
          label_en: "Makita",
          is_active: true,
          sort_order: 0,
        },
      ],
    });
    expect(mapped.options.map((o) => o.id)).toEqual(["o-1", "o-2"]);
    expect(mapped.specKey).toBeNull();
  });

  it("falls back to defaults for missing fields", () => {
    const mapped = mapAdminFilterOption({});
    expect(mapped.id).toBe("");
    expect(mapped.isActive).toBe(true);
    expect(mapped.sortOrder).toBe(0);
  });
});
