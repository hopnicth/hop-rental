/**
 * Tests: B-4 partner taxonomy rail — config + UI contract + i18n keys
 *
 * Covers:
 *  1. app/config/partner-categories.ts — the 8 level-0 slugs match the seeded
 *     level-0 active set (fixture-based, NO live DB call), in sort order.
 *  2. PartnerCategoryRail.vue source contract — config-driven, i18n labels only,
 *     level-0 only, prop/emit API, a11y.
 *  3. partners.rail.* i18n keys exist (th/en real; cn/jp placeholders).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PARTNER_LEVEL0_CATEGORIES,
  partnerCategoryIcon,
} from "../../app/config/partner-categories";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * Canonical level-0 active taxonomy slug set, in taxonomy sort_order.
 * Hardcoded fixture mirroring the migration-116 seed (same no-live-DB approach
 * the resolver tests use) — the guard is that the client config cannot drift
 * from this level-0 active set.
 */
const SEEDED_LEVEL0_SLUGS = [
  "construction_materials",
  "contractor_services",
  "freelance_technicians",
  "freelance_foremen",
  "freelance_engineers",
  "freelance_safety_officers",
  "drafting_design",
  "plc_programmers",
];

describe("partner-categories config — level-0 slug set", () => {
  it("has exactly the 8 seeded level-0 slugs in sort order", () => {
    expect(PARTNER_LEVEL0_CATEGORIES.map((c) => c.slug)).toEqual(
      SEEDED_LEVEL0_SLUGS,
    );
  });

  it("every category carries a non-empty lucide icon", () => {
    for (const cat of PARTNER_LEVEL0_CATEGORIES) {
      expect(cat.icon).toMatch(/^i-lucide-/);
    }
  });

  it("partnerCategoryIcon resolves known slugs and rejects unknown ones", () => {
    expect(partnerCategoryIcon("construction_materials")).toBe(
      "i-lucide-brick-wall",
    );
    expect(partnerCategoryIcon("plc_programmers")).toBe("i-lucide-cpu");
    expect(partnerCategoryIcon("not_a_category")).toBeUndefined();
  });
});

describe("PartnerCategoryRail.vue — source contract", () => {
  const src = read("app/components/partners/PartnerCategoryRail.vue");

  it("renders from the shared level-0 config (single source)", () => {
    expect(src).toContain("PARTNER_LEVEL0_CATEGORIES");
    expect(src).toContain('~/config/partner-categories');
  });

  it("uses i18n keys for labels — no hardcoded category text", () => {
    expect(src).toContain('t("partners.rail.all")');
    expect(src).toContain("t(`partners.categories.${cat.slug}`)");
  });

  it("exposes the reusable prop/emit API (activeCategory + select)", () => {
    expect(src).toContain("activeCategory");
    expect(src).toContain("select: [slug: string | null]");
    expect(src).toContain("emit('select', null)"); // All clears the filter
  });

  it("is level-0 only this slice (no subcategory handling in the rail)", () => {
    expect(src).not.toContain("taxSubcategory");
    expect(src).not.toContain("parent_id");
  });

  it("sets aria-pressed for active state (a11y)", () => {
    expect(src).toContain("aria-pressed");
  });

  it("does not own routing — parent drives URL (reusable)", () => {
    expect(src).not.toContain("useRouter");
    expect(src).not.toContain("useRoute");
  });
});

describe("partners.rail.* i18n keys", () => {
  const KEYS = ["all", "emptyCategory"];
  const load = (f: string) =>
    JSON.parse(read(`i18n/locales/${f}.json`)).partners.rail as Record<
      string,
      string
    >;

  it("th + en have real values", () => {
    for (const f of ["th", "en"]) {
      const loc = load(f);
      for (const k of KEYS) {
        expect(loc[k]).toBeTruthy();
        expect(loc[k]).not.toContain("NEEDS_TRANSLATION");
      }
    }
  });

  it("cn/jp carry NEEDS_TRANSLATION placeholders (disabled locales)", () => {
    for (const f of ["cn", "jp"]) {
      const loc = load(f);
      for (const k of KEYS) expect(loc[k]).toContain("[NEEDS_TRANSLATION]");
    }
  });
});
