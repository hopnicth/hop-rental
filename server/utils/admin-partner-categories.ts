/**
 * Utilities for the partner taxonomy tables:
 *   partner_categories — the new taxonomy table (migration 116)
 *   partner_category_assignments — many-to-many join
 *
 * Covers:
 *  - SELECT strings
 *  - Mappers (DB row → typed response)
 *  - replacePartnerCategoryAssignments (delete-then-insert)
 */
import { createError } from "h3";

// ── SELECT strings ─────────────────────────────────────────────────────────────

export const ADMIN_PARTNER_CATEGORY_SELECT =
  "id, slug, parent_id, level, icon, sort_order, is_active, is_public, created_at, updated_at";

export const ADMIN_PARTNER_CATEGORY_ASSIGNMENT_SELECT =
  "category_id, partner_profile_id, is_primary, source, confidence, created_at";

// ── Mappers ────────────────────────────────────────────────────────────────────

export function mapAdminPartnerCategory(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    slug: String(row.slug ?? ""),
    parentId: typeof row.parent_id === "string" ? row.parent_id : null,
    level: Number(row.level ?? 0),
    icon: typeof row.icon === "string" ? row.icon : null,
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active === true,
    isPublic: row.is_public === true,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function mapAdminPartnerCategoryAssignment(row: Record<string, unknown>) {
  return {
    categoryId: String(row.category_id ?? ""),
    partnerProfileId: String(row.partner_profile_id ?? ""),
    isPrimary: row.is_primary === true,
    source: String(row.source ?? "admin"),
    confidence: row.confidence != null ? Number(row.confidence) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

// ── Assignment replacement ─────────────────────────────────────────────────────

/**
 * Replaces all taxonomy category assignments for a partner in two steps:
 *   1. DELETE all existing rows for partner_profile_id = partnerId
 *   2. INSERT the new set
 *
 * Not wrapped in a DB transaction. If the INSERT fails after DELETE, the partner
 * will temporarily have no assignments. The operation is idempotent and the admin
 * can retry. No data corruption occurs — only a recoverable empty state.
 *
 * @param adminClient       service_role Supabase client (bypasses RLS)
 * @param partnerId         UUID of the partner_profile
 * @param primaryCategoryId UUID of the primary category, or null to clear all
 * @param secondaryCategoryIds UUIDs of secondary categories (must not overlap primary)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export async function replacePartnerCategoryAssignments(
  adminClient: AnyClient,
  partnerId: string,
  primaryCategoryId: string | null,
  secondaryCategoryIds: string[],
) {
  const allIds = [
    ...(primaryCategoryId ? [primaryCategoryId] : []),
    ...secondaryCategoryIds,
  ];

  // Validate all IDs exist and are active before making any writes
  if (allIds.length > 0) {
    const { data: cats, error: catErr } = await adminClient
      .from("partner_categories")
      .select("id, is_active")
      .in("id", allIds);

    if (catErr) {
      throw createError({ statusCode: 500, statusMessage: catErr.message });
    }

    const rows = (cats ?? []) as { id: string; is_active: boolean }[];
    const foundIds = new Set(rows.map((r) => r.id));
    const inactiveIds = new Set(
      rows.filter((r) => !r.is_active).map((r) => r.id),
    );

    for (const id of allIds) {
      if (!foundIds.has(id)) {
        throw createError({
          statusCode: 422,
          statusMessage: `Category not found: ${id}`,
        });
      }
      if (inactiveIds.has(id)) {
        throw createError({
          statusCode: 422,
          statusMessage: `Category is not active: ${id}`,
        });
      }
    }
  }

  // Step 1: DELETE all existing assignments for this partner
  const { error: delErr } = await adminClient
    .from("partner_category_assignments")
    .delete()
    .eq("partner_profile_id", partnerId);

  if (delErr) {
    throw createError({ statusCode: 500, statusMessage: delErr.message });
  }

  if (allIds.length === 0) return [];

  // Step 2: INSERT new assignment rows
  const insertRows: Record<string, unknown>[] = [];

  if (primaryCategoryId) {
    insertRows.push({
      partner_profile_id: partnerId,
      category_id: primaryCategoryId,
      is_primary: true,
      source: "admin",
      confidence: null,
    });
  }

  for (const catId of secondaryCategoryIds) {
    insertRows.push({
      partner_profile_id: partnerId,
      category_id: catId,
      is_primary: false,
      source: "admin",
      confidence: null,
    });
  }

  const { data: inserted, error: insErr } = await adminClient
    .from("partner_category_assignments")
    .insert(insertRows)
    .select(ADMIN_PARTNER_CATEGORY_ASSIGNMENT_SELECT);

  if (insErr) {
    throw createError({ statusCode: 500, statusMessage: insErr.message });
  }

  return (inserted ?? []).map((r: Record<string, unknown>) =>
    mapAdminPartnerCategoryAssignment(r),
  );
}
