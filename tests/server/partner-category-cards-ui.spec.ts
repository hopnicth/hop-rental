/**
 * Tests: Slice 2 — home partner category cards + index.vue reorder
 *
 * Covers:
 *  1. PartnerCategoryCards.vue — config-driven, i18n labels, href-based nav,
 *     mirror card chrome, page-agnostic, responsive grid/scroll.
 *  2. index.vue — partner section moved above products; carousel body swapped
 *     for the category cards; dead partner-fetch code removed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("PartnerCategoryCards.vue — source contract", () => {
  const src = read("app/components/partners/PartnerCategoryCards.vue");

  it("renders from the shared level-0 config (single source, no redefined slugs)", () => {
    expect(src).toContain("PARTNER_LEVEL0_CATEGORIES");
    expect(src).toContain("~/config/partner-categories");
  });

  it("uses i18n keys for labels — no hardcoded category text", () => {
    expect(src).toContain("t(`partners.categories.${");
  });

  it("navigates via href to /partners?taxCategory=<slug>", () => {
    expect(src).toContain("/partners?taxCategory=");
  });

  it("is page-agnostic — no route reads inside the component", () => {
    expect(src).not.toContain("useRoute");
    expect(src).not.toContain("useRouter");
  });

  it("mirrors the home card chrome (hover ring-primary + translate + icon badge)", () => {
    expect(src).toContain("hover:-translate-y-0.5");
    expect(src).toContain("hover:ring-2");
    expect(src).toContain("hover:ring-primary");
    expect(src).toContain("bg-primary/10"); // icon badge
    expect(src).toContain("UCard");
  });

  it("is a 4-col desktop grid / mobile horizontal scroll", () => {
    expect(src).toContain("overflow-x-auto");
    expect(src).toContain("sm:grid-cols-4");
  });
});

describe("home index.vue — Slice 2 reorder + body swap", () => {
  const src = read("app/pages/index.vue");

  it("orders the partner section ABOVE the products section", () => {
    const iPartners = src.indexOf("home.partnersSection");
    const iProducts = src.indexOf("home.productsTitle");
    expect(iPartners).toBeGreaterThan(-1);
    expect(iProducts).toBeGreaterThan(-1);
    expect(iPartners).toBeLessThan(iProducts);
  });

  it("renders the category cards in the partner section", () => {
    expect(src).toContain("PartnersPartnerCategoryCards");
  });

  it("removed the PartnerCard carousel + its dead data source", () => {
    expect(src).not.toContain("useHomePartners");
    expect(src).not.toContain("asPartnerCard");
    expect(src).not.toContain(':items="partners"');
  });

  it("keeps the section heading + see-all link to /partners", () => {
    expect(src).toContain("home.partnersSection");
    expect(src).toContain('to="/partners"');
  });

  it("does NOT touch the top HopPartnerSlide block", () => {
    expect(src).toContain("HopPartnerSlide");
  });
});
