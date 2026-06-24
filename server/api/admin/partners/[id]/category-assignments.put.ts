/**
 * PUT /api/admin/partners/:id/category-assignments
 *
 * Replaces all taxonomy category assignments for a partner.
 * Strategy: DELETE existing + INSERT new (non-transactional, recoverable).
 *
 * Auth:    super_admin only (requireSuperAdmin)
 * Body:    { primaryCategoryId: string | null, secondaryCategoryIds: string[] }
 * Returns: { assignments: AdminPartnerCategoryAssignment[] }
 * Errors:  400 | 401 | 403 | 404 | 422 | 500
 */
import { requireSuperAdmin } from "~~/server/utils/admin";
import { replacePartnerCategoryAssignments } from "~~/server/utils/admin-partner-categories";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const body = (await readBody(event)) as Record<string, unknown>;

  const primaryCategoryId =
    typeof body.primaryCategoryId === "string" && body.primaryCategoryId.trim()
      ? body.primaryCategoryId.trim()
      : null;

  const rawSecondaryIds: string[] = Array.isArray(body.secondaryCategoryIds)
    ? body.secondaryCategoryIds
        .map((v: unknown) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean) as string[]
    : [];

  // Reject duplicate secondary IDs
  const uniqueSecondaryIds = new Set(rawSecondaryIds);
  if (uniqueSecondaryIds.size !== rawSecondaryIds.length) {
    throw createError({
      statusCode: 422,
      statusMessage: "secondaryCategoryIds must not contain duplicates",
    });
  }
  const secondaryCategoryIds = rawSecondaryIds;

  // Reject secondaries without a primary
  if (!primaryCategoryId && secondaryCategoryIds.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: "secondaryCategoryIds requires a primaryCategoryId",
    });
  }

  // Reject overlap: primary must not appear in secondaries
  if (primaryCategoryId && secondaryCategoryIds.includes(primaryCategoryId)) {
    throw createError({
      statusCode: 422,
      statusMessage: "primaryCategoryId must not appear in secondaryCategoryIds",
    });
  }

  // Confirm partner exists
  const { data: partner, error: partnerErr } = await adminClient
    .from("partner_profiles")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (partnerErr) {
    throw createError({ statusCode: 500, statusMessage: partnerErr.message });
  }
  if (!partner) {
    throw createError({ statusCode: 404, statusMessage: "Partner not found" });
  }

  const assignments = await replacePartnerCategoryAssignments(
    adminClient,
    id,
    primaryCategoryId,
    secondaryCategoryIds,
  );

  return { assignments };
});
