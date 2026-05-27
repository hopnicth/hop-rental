import { createError } from "h3";

export type SavedPartnerRow = { partner_id?: unknown };

/**
 * Validates and normalises a partnerId from a request body.
 * Mirrors requireWishlistProductId from user-wishlist.ts.
 */
export function requireSavedPartnerId(value: unknown): string {
  if (typeof value !== "string") {
    throw createError({
      statusCode: 422,
      statusMessage: "partnerId is required",
    });
  }
  const partnerId = value.trim();
  if (!partnerId || partnerId.length > 128) {
    throw createError({
      statusCode: 422,
      statusMessage: "partnerId is invalid",
    });
  }
  return partnerId;
}

/**
 * Maps raw user_saved_partners rows to an array of partner ID strings.
 * Filters out any row where partner_id is not a non-empty string.
 */
export function mapSavedPartnerIds(
  rows: SavedPartnerRow[] | null | undefined,
): string[] {
  return (rows ?? [])
    .map((row) =>
      typeof row.partner_id === "string" ? row.partner_id : "",
    )
    .filter((id) => id.length > 0);
}
