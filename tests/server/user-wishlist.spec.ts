import { describe, expect, it } from "vitest";
import {
  getAuthUserId,
  isMissingWishlistTable,
  mapWishlistProductIds,
  requireWishlistProductId,
} from "../../server/utils/user-wishlist";

describe("user wishlist helpers", () => {
  it("resolves user id from Supabase auth shapes", () => {
    expect(getAuthUserId({ id: "user-1" })).toBe("user-1");
    expect(getAuthUserId({ sub: "user-2" })).toBe("user-2");
    expect(getAuthUserId(null)).toBeNull();
  });

  it("normalizes product ids", () => {
    expect(requireWishlistProductId(" product-1 ")).toBe("product-1");
    expect(() => requireWishlistProductId(" ")).toThrow(/invalid|required/i);
  });

  it("maps product id rows and detects missing wishlist schema", () => {
    expect(
      mapWishlistProductIds([{ product_id: "a" }, { product_id: null }]),
    ).toEqual(["a"]);
    expect(isMissingWishlistTable({ code: "42P01" })).toBe(true);
    expect(isMissingWishlistTable({ message: "relation user_wishlist missing" })).toBe(true);
  });
});