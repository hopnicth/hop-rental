import { describe, expect, it } from "vitest";
import {
  replacePartnerCategoryAssignments,
  fetchPublicTaxonomyForPartners,
  resolvePartnerIdsForTaxonomy,
} from "../../server/utils/admin-partner-categories";

/**
 * Catalog of categories used by the mock DB.
 * construction_materials (L0) → roofing, steel_rebar (L1 children)
 * contractor_services   (L0) → electrical (L1 child of a DIFFERENT parent)
 */
const PRIMARY = "11111111-1111-1111-1111-111111111111"; // construction_materials, level 0
const CHILD_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"; // child of PRIMARY, level 1
const CHILD_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"; // child of PRIMARY, level 1
const OTHER_PRIMARY = "22222222-2222-2222-2222-222222222222"; // contractor_services, level 0
const FOREIGN_CHILD = "cccccccc-cccc-cccc-cccc-cccccccccccc"; // child of OTHER_PRIMARY, level 1
const INACTIVE_CHILD = "dddddddd-dddd-dddd-dddd-dddddddddddd"; // child of PRIMARY, inactive

const CATEGORY_ROWS: Record<
  string,
  { id: string; is_active: boolean; level: number; parent_id: string | null }
> = {
  [PRIMARY]: { id: PRIMARY, is_active: true, level: 0, parent_id: null },
  [OTHER_PRIMARY]: { id: OTHER_PRIMARY, is_active: true, level: 0, parent_id: null },
  [CHILD_A]: { id: CHILD_A, is_active: true, level: 1, parent_id: PRIMARY },
  [CHILD_B]: { id: CHILD_B, is_active: true, level: 1, parent_id: PRIMARY },
  [FOREIGN_CHILD]: { id: FOREIGN_CHILD, is_active: true, level: 1, parent_id: OTHER_PRIMARY },
  [INACTIVE_CHILD]: { id: INACTIVE_CHILD, is_active: false, level: 1, parent_id: PRIMARY },
};

/** Minimal chainable mock matching the util's exact call shapes. */
function makeMockClient() {
  const inserted: Record<string, unknown>[] = [];
  let deleteCalled = false;

  const client = {
    from(table: string) {
      if (table === "partner_categories") {
        return {
          select() {
            return {
              in(_col: string, ids: string[]) {
                const data = ids
                  .map((id) => CATEGORY_ROWS[id])
                  .filter(Boolean);
                return Promise.resolve({ data, error: null });
              },
            };
          },
        };
      }
      // partner_category_assignments
      return {
        delete() {
          return {
            eq() {
              deleteCalled = true;
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(rows: Record<string, unknown>[]) {
          inserted.push(...rows);
          return {
            select() {
              return Promise.resolve({
                data: rows.map((r) => ({
                  category_id: r.category_id,
                  partner_profile_id: r.partner_profile_id,
                  is_primary: r.is_primary,
                  source: r.source,
                  confidence: r.confidence,
                  created_at: "2026-06-29T00:00:00Z",
                })),
                error: null,
              });
            },
          };
        },
      };
    },
  };

  return { client, inserted, wasDeleteCalled: () => deleteCalled };
}

const PARTNER = "99999999-9999-9999-9999-999999999999";

describe("replacePartnerCategoryAssignments — level/parent validation", () => {
  it("accepts level-0 primary with level-1 children of that primary", async () => {
    const { client, inserted } = makeMockClient();
    const result = await replacePartnerCategoryAssignments(
      client,
      PARTNER,
      PRIMARY,
      [CHILD_A, CHILD_B],
    );
    // primary first, then secondaries — deterministic order
    expect(inserted[0]).toMatchObject({ category_id: PRIMARY, is_primary: true });
    expect(inserted[1]).toMatchObject({ category_id: CHILD_A, is_primary: false });
    expect(inserted[2]).toMatchObject({ category_id: CHILD_B, is_primary: false });
    expect(result[0].isPrimary).toBe(true);
  });

  it("clears all assignments when primary is null and secondaries empty", async () => {
    const { client, inserted, wasDeleteCalled } = makeMockClient();
    const result = await replacePartnerCategoryAssignments(client, PARTNER, null, []);
    expect(wasDeleteCalled()).toBe(true);
    expect(inserted).toHaveLength(0);
    expect(result).toEqual([]);
  });

  it("rejects a non-level-0 primary", async () => {
    const { client } = makeMockClient();
    await expect(
      replacePartnerCategoryAssignments(client, PARTNER, CHILD_A, []),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects a level-0 category used as a secondary", async () => {
    const { client } = makeMockClient();
    await expect(
      replacePartnerCategoryAssignments(client, PARTNER, PRIMARY, [OTHER_PRIMARY]),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects a secondary that is not a child of the chosen primary", async () => {
    const { client } = makeMockClient();
    await expect(
      replacePartnerCategoryAssignments(client, PARTNER, PRIMARY, [FOREIGN_CHILD]),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects an inactive category", async () => {
    const { client } = makeMockClient();
    await expect(
      replacePartnerCategoryAssignments(client, PARTNER, PRIMARY, [INACTIVE_CHILD]),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects a non-existent category id", async () => {
    const { client } = makeMockClient();
    await expect(
      replacePartnerCategoryAssignments(client, PARTNER, PRIMARY, [
        "00000000-0000-0000-0000-000000000000",
      ]),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

// ── fetchPublicTaxonomyForPartners (public display-only read) ───────────────────

const PUBLIC_PARTNER = "p-public";
const OTHER_PUBLIC_PARTNER = "p-public-2";
const PRIVATE_PARTNER = "p-private"; // never passed by the route (route filters is_public)

type AssignmentRow = {
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

/**
 * Dataset embeds the joined partner_categories row, mirroring the PostgREST
 * embedded select the helper performs.
 */
const ASSIGNMENT_DATASET: AssignmentRow[] = [
  // PUBLIC_PARTNER: a primary L0 + a secondary L1 (both active/public),
  // plus an inactive and a non-public category that MUST be filtered out.
  {
    partner_profile_id: PUBLIC_PARTNER,
    is_primary: false,
    partner_categories: { slug: "construction_materials_roofing", level: 1, sort_order: 40, is_active: true, is_public: true },
  },
  {
    partner_profile_id: PUBLIC_PARTNER,
    is_primary: true,
    partner_categories: { slug: "construction_materials", level: 0, sort_order: 10, is_active: true, is_public: true },
  },
  {
    partner_profile_id: PUBLIC_PARTNER,
    is_primary: false,
    partner_categories: { slug: "construction_materials_inactive", level: 1, sort_order: 50, is_active: false, is_public: true },
  },
  {
    partner_profile_id: PUBLIC_PARTNER,
    is_primary: false,
    partner_categories: { slug: "construction_materials_hidden", level: 1, sort_order: 60, is_active: true, is_public: false },
  },
  // OTHER_PUBLIC_PARTNER: a single primary.
  {
    partner_profile_id: OTHER_PUBLIC_PARTNER,
    is_primary: true,
    partner_categories: { slug: "contractor_services", level: 0, sort_order: 20, is_active: true, is_public: true },
  },
  // PRIVATE_PARTNER: has an assignment in the table, but the route never passes
  // this id (it filters partners to is_public=true first).
  {
    partner_profile_id: PRIVATE_PARTNER,
    is_primary: true,
    partner_categories: { slug: "plc_programmers", level: 0, sort_order: 80, is_active: true, is_public: true },
  },
];

function makeReadClient() {
  return {
    from() {
      return {
        select() {
          return {
            in(_col: string, ids: string[]) {
              const set = new Set(ids);
              const data = ASSIGNMENT_DATASET.filter((r) =>
                set.has(r.partner_profile_id),
              );
              return Promise.resolve({ data, error: null });
            },
          };
        },
      };
    },
  };
}

describe("fetchPublicTaxonomyForPartners — public display read", () => {
  it("returns an empty map (caller defaults to []) for an unassigned partner", async () => {
    const grouped = await fetchPublicTaxonomyForPartners(makeReadClient(), [
      "p-unassigned",
    ]);
    expect(grouped.get("p-unassigned")).toBeUndefined();
    expect(grouped.get("p-unassigned") ?? []).toEqual([]);
  });

  it("returns the primary first, then secondaries", async () => {
    const grouped = await fetchPublicTaxonomyForPartners(makeReadClient(), [
      PUBLIC_PARTNER,
    ]);
    const items = grouped.get(PUBLIC_PARTNER)!;
    expect(items[0]).toEqual({ slug: "construction_materials", level: 0, isPrimary: true });
    expect(items.some((i) => i.slug === "construction_materials_roofing" && !i.isPrimary)).toBe(true);
  });

  it("excludes inactive and non-public categories", async () => {
    const grouped = await fetchPublicTaxonomyForPartners(makeReadClient(), [
      PUBLIC_PARTNER,
    ]);
    const slugs = grouped.get(PUBLIC_PARTNER)!.map((i) => i.slug);
    expect(slugs).not.toContain("construction_materials_inactive");
    expect(slugs).not.toContain("construction_materials_hidden");
    expect(slugs).toEqual(["construction_materials", "construction_materials_roofing"]);
  });

  it("never returns taxonomy for a partner id not in the requested set (route passes only public ids)", async () => {
    const grouped = await fetchPublicTaxonomyForPartners(makeReadClient(), [
      PUBLIC_PARTNER,
      OTHER_PUBLIC_PARTNER,
    ]);
    // PRIVATE_PARTNER was not requested → must not appear, even though it has an assignment.
    expect(grouped.has(PRIVATE_PARTNER)).toBe(false);
    expect(grouped.has(PUBLIC_PARTNER)).toBe(true);
    expect(grouped.has(OTHER_PUBLIC_PARTNER)).toBe(true);
  });

  it("returns an empty map for an empty id list without querying", async () => {
    const grouped = await fetchPublicTaxonomyForPartners(makeReadClient(), []);
    expect(grouped.size).toBe(0);
  });
});

// ── resolvePartnerIdsForTaxonomy (public taxCategory / taxSubcategory filter) ────
/**
 * Slug-keyed catalog for the resolver. Mirrors real seed shape:
 *   construction_materials (L0)
 *     ├ construction_materials_roofing     (L1, active/public)
 *     ├ construction_materials_steel_rebar (L1, active/public)
 *     └ construction_materials_inactive    (L1, is_active = false)
 *   contractor_services (L0)
 *     └ contractor_services_electrical     (L1, child of the OTHER parent)
 */
const CAT_BY_SLUG: Record<
  string,
  {
    id: string;
    slug: string;
    level: number;
    parent_id: string | null;
    is_active: boolean;
    is_public: boolean;
  }
> = {
  construction_materials: {
    id: "cat-cm",
    slug: "construction_materials",
    level: 0,
    parent_id: null,
    is_active: true,
    is_public: true,
  },
  contractor_services: {
    id: "cat-cs",
    slug: "contractor_services",
    level: 0,
    parent_id: null,
    is_active: true,
    is_public: true,
  },
  construction_materials_roofing: {
    id: "cat-roofing",
    slug: "construction_materials_roofing",
    level: 1,
    parent_id: "cat-cm",
    is_active: true,
    is_public: true,
  },
  construction_materials_steel_rebar: {
    id: "cat-steel",
    slug: "construction_materials_steel_rebar",
    level: 1,
    parent_id: "cat-cm",
    is_active: true,
    is_public: true,
  },
  construction_materials_inactive: {
    id: "cat-inactive",
    slug: "construction_materials_inactive",
    level: 1,
    parent_id: "cat-cm",
    is_active: false,
    is_public: true,
  },
  contractor_services_electrical: {
    id: "cat-cs-elec",
    slug: "contractor_services_electrical",
    level: 1,
    parent_id: "cat-cs",
    is_active: true,
    is_public: true,
  },
};

// Assignments keyed by category_id → partner_profile_ids assigned to it.
//  P_PARENT : primary construction_materials (L0)  + secondary steel_rebar (L1)
//  P_SUB    : secondary roofing (L1) only            (parent-less child assignee)
//  P_OTHER  : primary contractor_services (L0)
const ASG_BY_CATEGORY: Record<string, string[]> = {
  "cat-cm": ["P_PARENT"],
  "cat-steel": ["P_PARENT"],
  "cat-roofing": ["P_SUB"],
  "cat-cs": ["P_OTHER"],
};

/** Minimal chainable mock matching resolvePartnerIdsForTaxonomy's call shapes. */
function makeResolverClient() {
  return {
    from(table: string) {
      if (table === "partner_categories") {
        return {
          select() {
            return {
              in(_col: string, slugs: string[]) {
                const data = slugs
                  .map((s) => CAT_BY_SLUG[s])
                  .filter(Boolean);
                return Promise.resolve({ data, error: null });
              },
            };
          },
        };
      }
      // partner_category_assignments
      return {
        select() {
          return {
            in(_col: string, categoryIds: string[]) {
              const data = categoryIds.flatMap((cid) =>
                (ASG_BY_CATEGORY[cid] ?? []).map((pid) => ({
                  partner_profile_id: pid,
                })),
              );
              return Promise.resolve({ data, error: null });
            },
          };
        },
      };
    },
  };
}

describe("resolvePartnerIdsForTaxonomy — public taxonomy filter", () => {
  it("returns null when no taxCategory is provided (no filter)", async () => {
    const ids = await resolvePartnerIdsForTaxonomy(makeResolverClient(), {});
    expect(ids).toBeNull();
  });

  it("returns [] for an unknown category slug (unknown → empty result)", async () => {
    const ids = await resolvePartnerIdsForTaxonomy(makeResolverClient(), {
      taxCategory: "does_not_exist",
    });
    expect(ids).toEqual([]);
  });

  it("returns [] for a present-but-malformed category slug", async () => {
    const ids = await resolvePartnerIdsForTaxonomy(makeResolverClient(), {
      taxCategory: "Bad Slug!",
    });
    expect(ids).toEqual([]);
  });

  it("category only → matches partners assigned to that level-0 category", async () => {
    const ids = await resolvePartnerIdsForTaxonomy(makeResolverClient(), {
      taxCategory: "construction_materials",
    });
    expect(ids).toEqual(["P_PARENT"]);
  });

  it("valid sub → matches partners on the sub OR its parent (parent-only assignee appears)", async () => {
    // P_SUB is assigned only the roofing L1; P_PARENT is assigned only the parent L0.
    // Filtering by the sub must return BOTH (D2: sub OR parent).
    const ids = await resolvePartnerIdsForTaxonomy(makeResolverClient(), {
      taxCategory: "construction_materials",
      taxSubcategory: "construction_materials_roofing",
    });
    expect([...ids!].sort()).toEqual(["P_PARENT", "P_SUB"]);
  });

  it("dedupes a partner matched by both parent and sub", async () => {
    // P_PARENT is assigned BOTH construction_materials (L0) and steel_rebar (L1).
    const ids = await resolvePartnerIdsForTaxonomy(makeResolverClient(), {
      taxCategory: "construction_materials",
      taxSubcategory: "construction_materials_steel_rebar",
    });
    expect(ids).toEqual(["P_PARENT"]);
  });

  it("silently ignores a sub that is not a child of the category (category only)", async () => {
    const ids = await resolvePartnerIdsForTaxonomy(makeResolverClient(), {
      taxCategory: "construction_materials",
      taxSubcategory: "contractor_services_electrical", // child of the OTHER parent
    });
    expect(ids).toEqual(["P_PARENT"]); // sub ignored → not P_SUB
  });

  it("silently ignores an inactive sub (category only)", async () => {
    const ids = await resolvePartnerIdsForTaxonomy(makeResolverClient(), {
      taxCategory: "construction_materials",
      taxSubcategory: "construction_materials_inactive",
    });
    expect(ids).toEqual(["P_PARENT"]);
  });

  it("bare category does not roll down to child-only assignees", async () => {
    // P_SUB is assigned only the roofing L1, never the parent L0.
    const ids = await resolvePartnerIdsForTaxonomy(makeResolverClient(), {
      taxCategory: "construction_materials",
    });
    expect(ids).not.toContain("P_SUB");
  });
});
