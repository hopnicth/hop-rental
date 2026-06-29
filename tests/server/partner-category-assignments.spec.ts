import { describe, expect, it } from "vitest";
import {
  replacePartnerCategoryAssignments,
  fetchPublicTaxonomyForPartners,
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
