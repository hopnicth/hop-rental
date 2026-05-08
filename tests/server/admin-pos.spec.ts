import { describe, expect, it } from "vitest";
import {
  buildPosAssetSnapshot,
  mapPosAssetCatalogItem,
  primaryMatchedProductId,
  type AdminPosAssetRow,
} from "../../server/utils/admin-pos";

function assetRow(patch: Partial<AdminPosAssetRow> = {}): AdminPosAssetRow {
  return {
    id: "2cc4c6d0-b2f8-4682-9b24-68f2c0df8d44",
    code: "CAM-001",
    slug: "camera-kit",
    name_th: "ชุดกล้อง",
    name_en: "Camera Kit",
    brand: "Hop",
    thumbnail_url: "https://cdn.example/camera.webp",
    currency_code: "THB",
    daily_rate: "1200.00",
    weekly_rate: "7000.00",
    monthly_rate: "25000.00",
    daily_enabled: true,
    weekly_enabled: true,
    monthly_enabled: false,
    deposit_amount: "5000.00",
    min_rental_days: 1,
    max_rental_days: 14,
    matches: [
      { product_id: "product-late", sort_order: 20 },
      { product_id: "product-first", sort_order: 1 },
    ],
    ...patch,
  };
}

describe("admin POS asset mapping", () => {
  it("maps active rental assets into the existing POS catalog shape", () => {
    const item = mapPosAssetCatalogItem(assetRow());

    expect(item).toMatchObject({
      id: "2cc4c6d0-b2f8-4682-9b24-68f2c0df8d44",
      nameTh: "ชุดกล้อง",
      thumbnailUrl: "https://cdn.example/camera.webp",
      rentalMinDays: 1,
      rentalMaxDays: 14,
    });
    expect(item.skus[0]).toMatchObject({
      id: item.id,
      productId: item.id,
      labelTh: "CAM-001",
      imageUrl: "https://cdn.example/camera.webp",
      depositAmount: 5000,
      dailyRate: 1200,
      weeklyRate: 7000,
      monthlyRate: 0,
    });
  });

  it("uses the first sorted asset match in booking snapshots", () => {
    const row = assetRow();

    expect(primaryMatchedProductId(row)).toBe("product-first");
    expect(buildPosAssetSnapshot(row)).toMatchObject({
      id: row.id,
      code: "CAM-001",
      matchedProductId: "product-first",
      pricing: { daily: 1200, monthly: 0, deposit: 5000 },
      rentalRules: { minDays: 1, maxDays: 14 },
    });
  });
});