/**
 * GET /api/admin/partners/:id
 *
 * Admin partner detail by UUID. Returns the full row including
 * admin-only private fields (kyc_documents, verified_notes, internal_notes)
 * and the taxonomy category assignments from partner_category_assignments.
 *
 * KYC privacy: kycDocuments is stripped for non-super-admin (staff) callers.
 * Only super_admin receives the real kycDocuments payload.
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
import {
  ADMIN_PARTNER_CATEGORY_ASSIGNMENT_SELECT,
  mapAdminPartnerCategoryAssignment,
} from "~~/server/utils/admin-partner-categories";

export default defineEventHandler(async (event) => {
  const { adminClient, platformRole } = await requirePlatformAdmin(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const [partnerResult, assignmentsResult] = await Promise.all([
    adminClient
      .from("partner_profiles")
      .select(ADMIN_PARTNER_DETAIL_SELECT)
      .eq("id", id)
      .maybeSingle(),
    adminClient
      .from("partner_category_assignments")
      .select(ADMIN_PARTNER_CATEGORY_ASSIGNMENT_SELECT)
      .eq("partner_profile_id", id)
      .order("is_primary", { ascending: false }),
  ]);

  if (partnerResult.error) {
    throw createError({ statusCode: 500, statusMessage: partnerResult.error.message });
  }

  if (!partnerResult.data) {
    throw createError({
      statusCode: 404,
      statusMessage: "Partner profile not found",
    });
  }

  const mapped = mapAdminPartnerDetail(partnerResult.data as Record<string, unknown>);

  const taxonomyAssignments = (assignmentsResult.data ?? []).map(
    (r: Record<string, unknown>) => mapAdminPartnerCategoryAssignment(r),
  );

  const item = {
    ...(platformRole === "super_admin"
      ? mapped
      : { ...mapped, kycDocuments: { documents: [] } }),
    taxonomyAssignments,
  };

  return { item };
});
