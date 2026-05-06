import { createError } from "h3";

export type WishlistRow = { product_id?: unknown };

export function getAuthUserId(authUser: unknown): string | null {
  const row = authUser && typeof authUser === "object" ? (authUser as any) : {};
  return typeof row.id === "string"
    ? row.id
    : typeof row.sub === "string"
      ? row.sub
      : null;
}

export function requireWishlistProductId(value: unknown): string {
  if (typeof value !== "string") {
    throw createError({ statusCode: 422, statusMessage: "productId is required" });
  }
  const productId = value.trim();
  if (!productId || productId.length > 128) {
    throw createError({ statusCode: 422, statusMessage: "productId is invalid" });
  }
  return productId;
}

export function mapWishlistProductIds(rows: WishlistRow[] | null | undefined) {
  return (rows ?? [])
    .map((row) => (typeof row.product_id === "string" ? row.product_id : ""))
    .filter((value) => value.length > 0);
}

export function isMissingWishlistTable(error: unknown) {
  const err = error as { code?: string | null; message?: string | null } | null;
  return err?.code === "42P01" || err?.message?.includes("user_wishlist") === true;
}