/**
 * GET /api/partners/:slug
 *
 * Public partner detail by slug. Returns 404 if the profile does not
 * exist or is not published (is_public = FALSE).
 *
 * Private fields (kyc_documents, verified_notes, internal_notes) are NEVER
 * included — enforced by the SELECT string.
 *
 * Returns: { item: PartnerDetail }
 * Errors:  400 if slug missing/malformed, 404 if not found or unpublished
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import {
  PUBLIC_PARTNER_DETAIL_SELECT,
  mapPublicPartnerDetail,
} from "~~/server/utils/admin-partners";

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug");

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid partner slug",
    });
  }

  // service_role bypasses RLS — we enforce is_public manually and use the
  // public SELECT string to ensure no private fields are ever returned.
  const client = serverSupabaseServiceRole(event);

  const { data, error } = await client
    .from("partner_profiles")
    .select(PUBLIC_PARTNER_DETAIL_SELECT)
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle();

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "Partner not found",
    });
  }

  return {
    item: mapPublicPartnerDetail(data as Record<string, unknown>),
  };
});
