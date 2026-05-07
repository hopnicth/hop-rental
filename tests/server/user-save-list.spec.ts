import { describe, expect, it } from "vitest";
import {
  groupSaveListItems,
  isMissingSaveListTable,
  mapSaveListItems,
  requireSaveListItemId,
  requireSaveListItemType,
} from "../../server/utils/user-save-list";

describe("user save list helpers", () => {
  it("validates item type and id", () => {
    expect(requireSaveListItemType("asset")).toBe("asset");
    expect(requireSaveListItemType("service")).toBe("service");
    expect(requireSaveListItemId(" item-1 ")).toBe("item-1");
    expect(() => requireSaveListItemType("product")).toThrow(/itemType/i);
    expect(() => requireSaveListItemId(" ")).toThrow(/itemId/i);
  });

  it("maps and groups save list rows", () => {
    const items = mapSaveListItems([
      { item_type: "asset", asset_id: "asset-1" },
      { item_type: "service", service_id: "service-1" },
      { item_type: "asset", service_id: "wrong" },
    ]);

    expect(items).toEqual([
      { itemType: "asset", itemId: "asset-1" },
      { itemType: "service", itemId: "service-1" },
    ]);
    expect(groupSaveListItems(items)).toMatchObject({
      assetIds: ["asset-1"],
      serviceIds: ["service-1"],
    });
  });

  it("detects missing save list schema", () => {
    expect(isMissingSaveListTable({ code: "42P01" })).toBe(true);
    expect(isMissingSaveListTable({ message: "relation user_save_list missing" })).toBe(true);
  });
});