import { describe, expect, it } from "vitest";
import { assetMatchesSearchText } from "~/utils/asset-search";

const baseAsset = {
  code: "LASER-001",
  name: { th: "เลเซอร์วัดระดับ", en: "Laser level" },
  description: { th: "", en: "" },
  categories: ["measuring_tools"],
  tagKeys: ["green_laser", "tripod_ready"],
  searchKeywords: ["เครื่องยิงเลเซอร์", "laser alignment rental"],
  filterKeys: ["range__30m"],
  specSummary: { range: "30m" },
};

describe("asset search helpers", () => {
  it("matches rental assets by admin search keywords", () => {
    expect(assetMatchesSearchText(baseAsset, "เครื่องยิงเลเซอร์")).toBe(true);
    expect(assetMatchesSearchText(baseAsset, "laser alignment")).toBe(true);
  });

  it("matches rental assets by tag keys", () => {
    expect(assetMatchesSearchText(baseAsset, "green_laser")).toBe(true);
    expect(assetMatchesSearchText(baseAsset, "tripodready")).toBe(true);
  });

  it("does not match unrelated terms", () => {
    expect(assetMatchesSearchText(baseAsset, "forklift")).toBe(false);
  });
});