/**
 * GET /api/admin/partners/:id
 *
 * Admin partner detail by UUID. Returns the full row including
 * admin-only private fields (kyc_documents, verified_notes, internal_notes).
 *
 * Returns: { item: AdminPartnerRow }
 * Errors:  400 if id missing, 404 if not found, 500 on DB error
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PARTNER_DETAIL_SELECT,
  mapAdminPartnerDetail,
} from "~~/server/utils/admin-partners";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const { data, error } = await adminClient
    .from("partner_profiles")
    .select(ADMIN_PARTNER_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "Partner profile not found",
    });
  }

  return {
    item: mapAdminPartnerDetail(data as Record<string, unknown>),
  };
});
