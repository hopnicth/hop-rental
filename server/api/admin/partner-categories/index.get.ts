/**
 * GET /api/admin/partner-categories
 *
 * Returns all partner taxonomy categories ordered by level, sort_order, slug.
 * Used by admin partner create/edit forms to populate taxonomy selects.
 *
 * Auth:    super_admin only (requireSuperAdmin)
 * Returns: { items: AdminPartnerCategoryItem[] }
 * Errors:  401 | 403 | 500
 */
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PARTNER_CATEGORY_SELECT,
  mapAdminPartnerCategory,
} from "~~/server/utils/admin-partner-categories";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);

  const { data, error } = await adminClient
    .from("partner_categories")
    .select(ADMIN_PARTNER_CATEGORY_SELECT)
    .eq("is_active", true)
    .order("level", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const items = (data ?? []).map((r: Record<string, unknown>) =>
    mapAdminPartnerCategory(r),
  );

  return { items };
});
