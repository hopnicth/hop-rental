import { describe, expect, it } from "vitest";
import { replacePartnerCategoryAssignments } from "../../server/utils/admin-partner-categories";

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
