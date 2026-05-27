/**
 * GET /api/user/saved-partners/ids
 *
 * Lightweight endpoint — returns only the partner IDs the current user has saved.
 * Used by the UI to determine heart/bookmark state without fetching full cards.
 *
 * Requires authentication. Returns 401 if not logged in.
 * service_role client is used server-side; user_id is always taken from the
 * authenticated session, never from the request body.
 */
import { createError, defineEventHandler } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";
import { mapSavedPartnerIds } from "~~/server/utils/user-saved-partners";

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
  const { data, error } = await client
    .from("user_saved_partners")
    .select("partner_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return { partnerIds: mapSavedPartnerIds(data) };
});
