import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const defaultLayout = readFileSync("app/layouts/default.vue", "utf8");
const footerComponent = readFileSync(
  "app/components/layout/AppFooter.vue",
  "utf8",
);
const th = JSON.parse(readFileSync("i18n/locales/th.json", "utf8"));
const en = JSON.parse(readFileSync("i18n/locales/en.json", "utf8"));

describe("global footer", () => {
  it("is wired into the default storefront layout", () => {
    expect(defaultLayout).toContain("<AppFooter />");
  });

  it("uses accessible accordion controls and FAB-safe spacing", () => {
    expect(footerComponent).toContain("aria-expanded");
    expect(footerComponent).toContain("aria-controls");
    expect(footerComponent).toContain("--mobile-fab-clearance");
    expect(footerComponent).toContain("footer.copyright");
  });

  it("keeps mobile accordions collapsed by default and compact CTAs localized", () => {
    expect(footerComponent).toContain("hopnic: false");
    expect(footerComponent).toContain("footer.ctaCompact");
    expect(th.footer.ctaCompact.call).toBe("โทร");
    expect(en.footer.ctaCompact.map).toBe("Map");
  });

  it("provides footer translations in Thai and English", () => {
    expect(th.footer.sections.hopnic).toBeTruthy();
    expect(th.footer.contact.registrationNumber).toBe("0105564155415");
    expect(en.footer.sections.contact).toBeTruthy();
    expect(en.footer.cta.line).toBeTruthy();
    expect(en.footer.legal.cookies).toBeTruthy();
  });
});
