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
 * Taxonomy level rules (Phase B-2.1):
 *   * primary category must exist, be active, and be level 0 (top-level bucket)
 *   * secondary categories must exist, be active, be level 1, and be a direct
 *     child of the primary (parent_id === primaryCategoryId)
 *
 * @param adminClient       service_role Supabase client (bypasses RLS)
 * @param partnerId         UUID of the partner_profile
 * @param primaryCategoryId UUID of the primary level-0 category, or null to clear all
 * @param secondaryCategoryIds UUIDs of level-1 children of the primary (must not overlap primary)
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

  // Validate all IDs exist, are active, and satisfy the level/parent rules
  // before making any writes.
  if (allIds.length > 0) {
    const { data: cats, error: catErr } = await adminClient
      .from("partner_categories")
      .select("id, is_active, level, parent_id")
      .in("id", allIds);

    if (catErr) {
      throw createError({ statusCode: 500, statusMessage: catErr.message });
    }

    const rows = (cats ?? []) as {
      id: string;
      is_active: boolean;
      level: number;
      parent_id: string | null;
    }[];
    const byId = new Map(rows.map((r) => [r.id, r]));

    // Existence + active checks for every referenced id
    for (const id of allIds) {
      const row = byId.get(id);
      if (!row) {
        throw createError({
          statusCode: 422,
          statusMessage: `Category not found: ${id}`,
        });
      }
      if (!row.is_active) {
        throw createError({
          statusCode: 422,
          statusMessage: `Category is not active: ${id}`,
        });
      }
    }

    // Primary must be level 0
    if (primaryCategoryId) {
      const primary = byId.get(primaryCategoryId)!;
      if (primary.level !== 0) {
        throw createError({
          statusCode: 422,
          statusMessage: "primaryCategoryId must be a level-0 category",
        });
      }
    }

    // Secondaries must be level 1 and direct children of the primary
    for (const secId of secondaryCategoryIds) {
      const secondary = byId.get(secId)!;
      if (secondary.level !== 1) {
        throw createError({
          statusCode: 422,
          statusMessage: `Secondary category must be level 1: ${secId}`,
        });
      }
      if (secondary.parent_id !== primaryCategoryId) {
        throw createError({
          statusCode: 422,
          statusMessage: `Secondary category ${secId} is not a child of the primary category`,
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

// ── Public taxonomy read (display-only) ─────────────────────────────────────────

/**
 * Lean, display-safe taxonomy item for public partner payloads.
 * No category id is exposed — labels are derived client-side from the slug
 * via the `partners.categories.${slug}` i18n key.
 */
export interface PublicPartnerTaxonomyItem {
  slug: string;
  level: 0 | 1;
  isPrimary: boolean;
}

/**
 * Fetches active + public taxonomy assignments for a set of partner profiles
 * and returns them grouped by partner_profile_id, ordered primary-first then
 * level / sort_order / slug.
 *
 * Intended for the public partner list/detail routes which use the service-role
 * client (RLS bypassed). Because RLS is bypassed, this helper EXPLICITLY filters
 * to `partner_categories.is_active = TRUE AND is_public = TRUE`. Assignment-to-
 * partner visibility is the caller's responsibility: the public routes already
 * constrain partners to `is_public = TRUE`, so only public partners' ids should
 * be passed in.
 *
 * @param client      service-role Supabase client
 * @param partnerIds  partner_profile ids (already filtered to public partners)
 * @returns Map<partnerProfileId, PublicPartnerTaxonomyItem[]>
 */
export async function fetchPublicTaxonomyForPartners(
  client: AnyClient,
  partnerIds: string[],
): Promise<Map<string, PublicPartnerTaxonomyItem[]>> {
  const grouped = new Map<string, PublicPartnerTaxonomyItem[]>();

  const ids = Array.from(new Set(partnerIds.filter(Boolean)));
  if (ids.length === 0) return grouped;

  // Embedded read of the joined category so active/public can be enforced here
  // (service-role bypasses RLS, so the filter must be explicit).
  const { data, error } = await client
    .from("partner_category_assignments")
    .select(
      "partner_profile_id, is_primary, partner_categories(slug, level, sort_order, is_active, is_public)",
    )
    .in("partner_profile_id", ids);

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  type Row = {
    partner_profile_id: string;
    is_primary: boolean;
    partner_categories: {
      slug: string;
      level: number;
      sort_order: number;
      is_active: boolean;
      is_public: boolean;
    } | null;
  };

  for (const raw of (data ?? []) as Row[]) {
    const cat = raw.partner_categories;
    // Drop inactive / non-public categories (RLS-equivalent gate, enforced here).
    if (!cat || cat.is_active !== true || cat.is_public !== true) continue;
    const level = Number(cat.level) === 1 ? 1 : 0;
    const item: PublicPartnerTaxonomyItem = {
      slug: String(cat.slug ?? ""),
      level: level as 0 | 1,
      isPrimary: raw.is_primary === true,
    };
    if (!item.slug) continue;
    const list = grouped.get(raw.partner_profile_id) ?? [];
    list.push(item);
    grouped.set(raw.partner_profile_id, list);
  }

  // Sort each partner's items: primary first, then level, then slug.
  // sort_order is captured for stable ordering between same-level peers.
  const sortOrderBySlug = new Map<string, number>();
  for (const raw of (data ?? []) as Row[]) {
    const cat = raw.partner_categories;
    if (cat?.slug) sortOrderBySlug.set(String(cat.slug), Number(cat.sort_order ?? 0));
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      if (a.level !== b.level) return a.level - b.level;
      const soA = sortOrderBySlug.get(a.slug) ?? 0;
      const soB = sortOrderBySlug.get(b.slug) ?? 0;
      if (soA !== soB) return soA - soB;
      return a.slug.localeCompare(b.slug);
    });
  }

  return grouped;
}

// ── Public taxonomy filter (B-4) ────────────────────────────────────────────────

/**
 * Sanitises a public taxonomy slug param (taxCategory / taxSubcategory).
 * Matches the partner_categories slug CHECK: `^[a-z][a-z0-9_]*$`, max 64 chars.
 * Returns null for missing/empty/malformed input (no PostgREST injection surface —
 * `.eq`/`.in` are parameterised, but the format guard keeps unknown input cheap).
 */
export function sanitiseTaxonomySlugParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > 64) return null;
  if (!/^[a-z][a-z0-9_]*$/.test(v)) return null;
  return v;
}

/**
 * Resolves taxCategory / taxSubcategory slugs to the set of partner_profile_ids
 * that should match the public /partners taxonomy filter.
 *
 * Return contract:
 *   null  → no taxCategory requested (caller applies NO filter — full list)
 *   []    → filter requested but resolves to nothing (unknown/inactive slug, or
 *           no partners) → caller yields an empty result + empty state
 *   [ids] → distinct partner_profile_ids assigned (primary OR secondary) to the
 *           effective category set
 *
 * Semantics (locked):
 *  - Match includes BOTH primary and secondary assignments (is_primary ignored).
 *  - taxSubcategory only takes effect when taxCategory is present AND the sub is a
 *    LIVE child (level 1, parent = the category, active + public); otherwise the
 *    sub is silently ignored and the category is used alone.
 *  - When a valid sub is present, a partner matches if assigned to the sub OR to
 *    its parent category (a parent-only assignee appears in the child's filter).
 *  - Unknown/inactive category slug → [] (never an error, never a validity leak).
 *
 * Uses the service-role client (RLS bypassed), so active/public is enforced in
 * code here — mirroring fetchPublicTaxonomyForPartners. Non-public *partner*
 * exclusion is the caller's job (the list route keeps `.eq("is_public", true)`),
 * so a non-public partner cannot leak even if its assignment matches.
 */
export async function resolvePartnerIdsForTaxonomy(
  client: AnyClient,
  params: { taxCategory?: unknown; taxSubcategory?: unknown },
): Promise<string[] | null> {
  const taxCategory = sanitiseTaxonomySlugParam(params.taxCategory);
  if (!taxCategory) {
    // Distinguish "absent" (→ no filter) from "present-but-invalid" (→ empty).
    const raw = params.taxCategory;
    const present = typeof raw === "string" && raw.trim().length > 0;
    return present ? [] : null;
  }
  const taxSubcategory = sanitiseTaxonomySlugParam(params.taxSubcategory);

  const slugs = taxSubcategory ? [taxCategory, taxSubcategory] : [taxCategory];
  const { data: catData, error: catError } = await client
    .from("partner_categories")
    .select("id, slug, level, parent_id, is_active, is_public")
    .in("slug", slugs);
  if (catError) {
    throw createError({ statusCode: 500, statusMessage: catError.message });
  }

  type CatRow = {
    id: string;
    slug: string;
    level: number;
    parent_id: string | null;
    is_active: boolean;
    is_public: boolean;
  };
  // Explicit active/public gate (service-role bypasses RLS).
  const rows = ((catData ?? []) as CatRow[]).filter(
    (r) => r.is_active === true && r.is_public === true,
  );

  const l0 = rows.find(
    (r) => r.slug === taxCategory && Number(r.level) === 0,
  );
  if (!l0) return []; // unknown / inactive / non-public category → empty result

  const categoryIds = [l0.id];
  if (taxSubcategory) {
    const sub = rows.find(
      (r) =>
        r.slug === taxSubcategory &&
        Number(r.level) === 1 &&
        r.parent_id === l0.id,
    );
    if (sub) categoryIds.push(sub.id); // match sub OR parent
    // sub unknown / inactive / not a child → silently ignored (category only)
  }

  const { data: asgData, error: asgError } = await client
    .from("partner_category_assignments")
    .select("partner_profile_id")
    .in("category_id", categoryIds);
  if (asgError) {
    throw createError({ statusCode: 500, statusMessage: asgError.message });
  }

  return Array.from(
    new Set(
      ((asgData ?? []) as { partner_profile_id: string }[])
        .map((r) => r.partner_profile_id)
        .filter(Boolean),
    ),
  );
}
