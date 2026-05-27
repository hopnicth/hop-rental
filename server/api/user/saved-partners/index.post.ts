/**
 * POST /api/user/saved-partners
 *
 * Idempotent toggle: saves a partner if not already saved, unsaves it if already saved.
 *
 * Body: { partnerId: string }
 *
 * Returns:
 *   { partnerId: string, saved: boolean, partnerIds: string[] }
 *
 * - saved=true  → partner was just added to the user's saved list
 * - saved=false → partner was just removed from the user's saved list
 * - partnerIds  → the caller's full up-to-date list of saved partner IDs
 *
 * Security:
 * - Requires authentication. Returns 401 if not logged in.
 * - user_id is always taken from the authenticated session — never from the body.
 * - service_role client is used; every query manually filters by user_id.
 * - Only is_public=true partners can be saved. Returns 404 for private/missing partners.
 */
import { createError, defineEventHandler, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";
import {
  mapSavedPartnerIds,
  requireSavedPartnerId,
} from "~~/server/utils/user-saved-partners";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const partnerId = requireSavedPartnerId(body.partnerId);
  const client = serverSupabaseServiceRole(event);

  // Verify partner exists and is publicly available.
  // service_role bypasses RLS — we enforce is_public manually.
  const { data: partner, error: partnerError } = await client
    .from("partner_profiles")
    .select("id, is_public")
    .eq("id", partnerId)
    .maybeSingle();

  if (partnerError) {
    throw createError({ statusCode: 500, statusMessage: partnerError.message });
  }
  if (!partner || partner.is_public !== true) {
    throw createError({
      statusCode: 404,
      statusMessage: "Partner not found or not publicly available",
    });
  }

  // Check if already saved (manual user_id filter — service_role bypasses RLS).
  const { data: existing, error: existingError } = await client
    .from("user_saved_partners")
    .select("partner_id")
    .eq("user_id", userId)
    .eq("partner_id", partnerId)
    .maybeSingle();

  if (existingError) {
    throw createError({
      statusCode: 500,
      statusMessage: existingError.message,
    });
  }

  // Toggle: delete if already saved, insert if not.
  const saved = !existing;
  const mutation = existing
    ? await client
        .from("user_saved_partners")
        .delete()
        .eq("user_id", userId)
        .eq("partner_id", partnerId)
    : await client
        .from("user_saved_partners")
        .insert({ user_id: userId, partner_id: partnerId });

  if (mutation.error) {
    throw createError({
      statusCode: 500,
      statusMessage: mutation.error.message,
    });
  }

  // Return the caller's full updated list of saved partner IDs.
  const { data: rows } = await client
    .from("user_saved_partners")
    .select("partner_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return { partnerId, saved, partnerIds: mapSavedPartnerIds(rows) };
});
