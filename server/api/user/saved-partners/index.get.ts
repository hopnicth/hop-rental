/**
 * GET /api/user/saved-partners
 *
 * Returns full public partner cards for all partners the current user has saved.
 * Ordered by most-recently-saved first.
 *
 * Only returns partners that are still is_public = true — a partner unpublished
 * after saving will silently disappear from this list until republished.
 *
 * No private fields are exposed. PUBLIC_PARTNER_LIST_SELECT and mapPublicPartnerCard
 * guarantee that admin-only columns are never included in the response.
 *
 * Requires authentication. Returns 401 if not logged in.
 * service_role client bypasses RLS; user_id is always taken from the authenticated
 * session, never from the request body.
 */
import { createError, defineEventHandler } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";
import { mapSavedPartnerIds } from "~~/server/utils/user-saved-partners";
import {
  PUBLIC_PARTNER_LIST_SELECT,
  mapPublicPartnerCard,
} from "~~/server/utils/admin-partners";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const client = serverSupabaseServiceRole(event);

  // Step 1: fetch saved partner IDs ordered by when they were saved (newest first).
  const { data: savedRows, error: savedError } = await client
    .from("user_saved_partners")
    .select("partner_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (savedError) {
    throw createError({ statusCode: 500, statusMessage: savedError.message });
  }

  const orderedIds = mapSavedPartnerIds(savedRows);
  if (orderedIds.length === 0) {
    return { items: [] };
  }

  // Step 2: fetch public partner cards — is_public = true enforced manually
  // because service_role bypasses RLS.
  const { data: partnerRows, error: partnerError } = await client
    .from("partner_profiles")
    .select(PUBLIC_PARTNER_LIST_SELECT)
    .in("id", orderedIds)
    .eq("is_public", true);

  if (partnerError) {
    throw createError({ statusCode: 500, statusMessage: partnerError.message });
  }

  // Re-sort to preserve save order (most recently saved first).
  const partnerMap = new Map(
    (partnerRows ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return [String(r.id ?? ""), r];
    }),
  );
  const items = orderedIds
    .map((id) => partnerMap.get(id))
    .filter((r): r is Record<string, unknown> => r != null)
    .map(mapPublicPartnerCard);

  return { items };
});
