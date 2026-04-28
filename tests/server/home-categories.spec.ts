import { describe, expect, it } from "vitest";
import {
  buildHomeCategoryGroupPayload,
  buildHomeCategoryOptionPayload,
  mapHomeCategoryGroup,
} from "../../server/utils/home-categories";

describe("buildHomeCategoryGroupPayload", () => {
  it("normalizes main category keys and keeps optional locale labels", () => {
    const payload = buildHomeCategoryGroupPayload({
      mainCategoryKey: "Safety Equipment",
      labelTh: "อุปกรณ์เซฟตี้",
      labelEn: "Safety Equipment",
      labelCn: "安全设备",
      icon: " bx:shield ",
      sortOrder: -5,
    });

    expect(payload.main_category_key).toBe("safety_equipment");
    expect(payload.label_cn).toBe("安全设备");
    expect(payload.icon).toBe("bx:shield");
    expect(payload.sort_order).toBe(0);
    expect(payload.is_active).toBe(true);
  });
});

describe("buildHomeCategoryOptionPayload", () => {
  it("normalizes option keys and trims optional search queries", () => {
    const payload = buildHomeCategoryOptionPayload({
      optionKey: "Spark Risk",
      labelTh: "งานเสี่ยงประกายไฟ",
      labelEn: "Spark-risk work",
      searchQueryEn: " spark resistant gloves ",
      isActive: false,
    });

    expect(payload.option_key).toBe("spark_risk");
    expect(payload.search_query_en).toBe("spark resistant gloves");
    expect(payload.search_query_th).toBeNull();
    expect(payload.is_active).toBe(false);
  });
});

describe("mapHomeCategoryGroup", () => {
  it("maps and sorts nested options by sort order then Thai label", () => {
    const mapped = mapHomeCategoryGroup({
      id: "group-1",
      main_category_key: "safety_equipment",
      label_th: "อุปกรณ์เซฟตี้",
      label_en: "Safety Equipment",
      icon: "bx:shield",
      is_active: true,
      sort_order: 10,
      options: [
        { id: "o-2", option_key: "s02", label_th: "ข", label_en: "B", sort_order: 2 },
        { id: "o-1", option_key: "s01", label_th: "ก", label_en: "A", sort_order: 1 },
      ],
    });

    expect(mapped.mainCategoryKey).toBe("safety_equipment");
    expect(mapped.options.map((option) => option.optionKey)).toEqual(["s01", "s02"]);
  });
});