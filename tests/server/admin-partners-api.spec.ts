/**
 * Tests: Phase 1B Partner API Foundation
 *
 * Covers:
 *  1.  Permission model — POST/PATCH use requireSuperAdmin; GET uses requirePlatformAdmin
 *  2.  Private field protection — public SELECT strings never include sensitive columns
 *  3.  Public endpoints enforce is_public = true filter
 *  4.  Slug validation — format, reserved words
 *  5.  Category prefix cross-validation — directoryType ↔ mainCategoryKey
 *  6.  Verification toggle — verifiedAt auto-stamp, clear, and override-bug guard
 *  7.  Validator unit tests (pure functions, no DB)
 *  8.  lineUrl + mapsUrl app-layer validation (422 before DB, not 500)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  asPartnerSlug,
  asPartnerDirectoryType,
  asPartnerEntityType,
  asPartnerLineUrl,
  asPartnerMapsUrl,
  validateCategoryKeyForDirectoryType,
  buildPartnerCreatePayload,
  buildPartnerUpdatePayload,
  PUBLIC_PARTNER_LIST_SELECT,
  PUBLIC_PARTNER_DETAIL_SELECT,
  ADMIN_PARTNER_DETAIL_SELECT,
} from "../../server/utils/admin-partners";

const read = (path: string) => readFileSync(path, "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// 1. Permission model
// ─────────────────────────────────────────────────────────────────────────────
describe("Partner API permission model", () => {
  it("POST /api/admin/partners uses requireSuperAdmin", () => {
    const src = read("server/api/admin/partners/index.post.ts");
    expect(src).toContain("requireSuperAdmin");
    expect(src).not.toContain("requirePlatformAdmin");
  });

  it("PATCH /api/admin/partners/:id uses requireSuperAdmin", () => {
    const src = read("server/api/admin/partners/[id].patch.ts");
    expect(src).toContain("requireSuperAdmin");
    expect(src).not.toContain("requirePlatformAdmin");
  });

  it("GET /api/admin/partners (list) uses requirePlatformAdmin", () => {
    const src = read("server/api/admin/partners/index.get.ts");
    expect(src).toContain("requirePlatformAdmin");
  });

  it("GET /api/admin/partners/:id (detail) uses requirePlatformAdmin", () => {
    const src = read("server/api/admin/partners/[id].get.ts");
    expect(src).toContain("requirePlatformAdmin");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Private field protection — SELECT strings
// ─────────────────────────────────────────────────────────────────────────────
describe("Partner public SELECT strings — no private fields", () => {
  const PRIVATE = ["kyc_documents", "verified_notes", "internal_notes"];

  it("PUBLIC_PARTNER_LIST_SELECT excludes all private fields", () => {
    for (const f of PRIVATE) {
      expect(PUBLIC_PARTNER_LIST_SELECT).not.toContain(f);
    }
  });

  it("PUBLIC_PARTNER_DETAIL_SELECT excludes all private fields", () => {
    for (const f of PRIVATE) {
      expect(PUBLIC_PARTNER_DETAIL_SELECT).not.toContain(f);
    }
  });

  it("ADMIN_PARTNER_DETAIL_SELECT includes all private fields", () => {
    for (const f of PRIVATE) {
      expect(ADMIN_PARTNER_DETAIL_SELECT).toContain(f);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Public endpoints enforce is_public
// ─────────────────────────────────────────────────────────────────────────────
describe("Public partner endpoints — is_public gate", () => {
  it("GET /api/partners list filters by is_public = true", () => {
    const src = read("server/api/partners/index.get.ts");
    expect(src).toContain('.eq("is_public", true)');
    expect(src).toContain("PUBLIC_PARTNER_LIST_SELECT");
  });

  it("GET /api/partners/[slug] filters by is_public = true", () => {
    const src = read("server/api/partners/[slug].get.ts");
    expect(src).toContain('.eq("is_public", true)');
    expect(src).toContain("PUBLIC_PARTNER_DETAIL_SELECT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Slug validator
// ─────────────────────────────────────────────────────────────────────────────
describe("asPartnerSlug", () => {
  it("accepts valid slugs", () => {
    expect(asPartnerSlug("my-partner")).toBe("my-partner");
    expect(asPartnerSlug("abc123")).toBe("abc123");
  });

  it("lowercases input", () => {
    expect(asPartnerSlug("MyPartner")).toBe("mypartner");
  });

  it("rejects slugs with uppercase after lowercasing that still fail format", () => {
    expect(() => asPartnerSlug("bad slug")).toThrow();
    expect(() => asPartnerSlug("-leading")).toThrow();
    expect(() => asPartnerSlug("trailing-")).toThrow();
    expect(() => asPartnerSlug("double--hyphen")).toThrow();
  });

  it("rejects reserved slugs", () => {
    for (const r of [
      "admin",
      "stores",
      "services",
      "contractors",
      "api",
      "new",
      "edit",
      "partners",
    ]) {
      expect(() => asPartnerSlug(r)).toThrow();
    }
  });

  it("rejects empty/non-string", () => {
    expect(() => asPartnerSlug("")).toThrow();
    expect(() => asPartnerSlug(null)).toThrow();
    expect(() => asPartnerSlug(42)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. directoryType and entityType validators
// ─────────────────────────────────────────────────────────────────────────────
describe("asPartnerDirectoryType", () => {
  it("accepts valid types", () => {
    expect(asPartnerDirectoryType("store")).toBe("store");
    expect(asPartnerDirectoryType("service")).toBe("service");
    expect(asPartnerDirectoryType("contractor")).toBe("contractor");
  });

  it("rejects invalid types", () => {
    expect(() => asPartnerDirectoryType("shop")).toThrow();
    expect(() => asPartnerDirectoryType(null)).toThrow();
    expect(() => asPartnerDirectoryType("")).toThrow();
  });
});

describe("asPartnerEntityType", () => {
  it("accepts valid types", () => {
    expect(asPartnerEntityType("individual")).toBe("individual");
    expect(asPartnerEntityType("organization")).toBe("organization");
  });

  it("rejects invalid types", () => {
    expect(() => asPartnerEntityType("company")).toThrow();
    expect(() => asPartnerEntityType(null)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Category prefix cross-validation
// ─────────────────────────────────────────────────────────────────────────────
describe("validateCategoryKeyForDirectoryType", () => {
  it("passes when categoryKey is null (no category)", () => {
    expect(() =>
      validateCategoryKeyForDirectoryType("store", null),
    ).not.toThrow();
  });

  it("passes when prefix matches directoryType", () => {
    expect(() =>
      validateCategoryKeyForDirectoryType("store", "store_hardware_tools"),
    ).not.toThrow();
    expect(() =>
      validateCategoryKeyForDirectoryType(
        "service",
        "service_transport_logistics",
      ),
    ).not.toThrow();
    expect(() =>
      validateCategoryKeyForDirectoryType("contractor", "contractor_general"),
    ).not.toThrow();
  });

  it("rejects mismatched prefix", () => {
    expect(() =>
      validateCategoryKeyForDirectoryType(
        "store",
        "service_transport_logistics",
      ),
    ).toThrow(/not valid/);
    expect(() =>
      validateCategoryKeyForDirectoryType("service", "contractor_general"),
    ).toThrow(/not valid/);
    expect(() =>
      validateCategoryKeyForDirectoryType("contractor", "store_plumbing"),
    ).toThrow(/not valid/);
  });
});

describe("buildPartnerCreatePayload — category prefix validation", () => {
  const base = {
    slug: "test-partner",
    directoryType: "store",
    nameTh: "ทดสอบ",
  };

  it("accepts matching store_ category", () => {
    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        mainCategoryKey: "store_hardware_tools",
      }),
    ).not.toThrow();
  });

  it("rejects mismatched category prefix on create", () => {
    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        mainCategoryKey: "service_transport_logistics",
      }),
    ).toThrow(/not valid/);
  });

  it("accepts null category key", () => {
    expect(() =>
      buildPartnerCreatePayload({ ...base, mainCategoryKey: null }),
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Verification toggle + verifiedAt override bug
// ─────────────────────────────────────────────────────────────────────────────
describe("buildPartnerUpdatePayload — verification toggle", () => {
  it("{ isVerified: true } sets is_verified and auto-stamps verified_at", () => {
    const p = buildPartnerUpdatePayload({ isVerified: true });
    expect(p.is_verified).toBe(true);
    expect(typeof p.verified_at).toBe("string");
    expect(p.verified_at).toBeTruthy();
  });

  it("{ isVerified: true, verifiedAt } uses caller-supplied verifiedAt", () => {
    const ts = "2025-01-15T10:00:00.000Z";
    const p = buildPartnerUpdatePayload({ isVerified: true, verifiedAt: ts });
    expect(p.is_verified).toBe(true);
    expect(p.verified_at).toBe(ts);
  });

  it("{ isVerified: false } clears verified_at", () => {
    const p = buildPartnerUpdatePayload({ isVerified: false });
    expect(p.is_verified).toBe(false);
    expect(p.verified_at).toBeNull();
  });

  it("{ isVerified: false, verifiedAt } does NOT override the null — constraint-safe", () => {
    // Bug fix: verifiedAt must be ignored when isVerified=false
    const p = buildPartnerUpdatePayload({
      isVerified: false,
      verifiedAt: "2025-01-01T00:00:00Z",
    });
    expect(p.is_verified).toBe(false);
    expect(p.verified_at).toBeNull(); // NOT "2025-01-01T00:00:00Z"
  });

  it("{ isPublic: true } sets is_public", () => {
    const p = buildPartnerUpdatePayload({ isPublic: true });
    expect(p.is_public).toBe(true);
  });

  it("{ isPublic: false } sets is_public=false", () => {
    const p = buildPartnerUpdatePayload({ isPublic: false });
    expect(p.is_public).toBe(false);
  });

  it("throws 422 when no fields are supplied", () => {
    expect(() => buildPartnerUpdatePayload({})).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. lineUrl and mapsUrl — app-layer validation (422, not DB 500)
// ─────────────────────────────────────────────────────────────────────────────
describe("asPartnerLineUrl", () => {
  it("returns null for empty / null input", () => {
    expect(asPartnerLineUrl(null)).toBeNull();
    expect(asPartnerLineUrl("")).toBeNull();
    expect(asPartnerLineUrl(undefined)).toBeNull();
  });

  it("accepts https://line.me/ URLs", () => {
    expect(asPartnerLineUrl("https://line.me/ti/p/~hopnic")).toBe(
      "https://line.me/ti/p/~hopnic",
    );
  });

  it("accepts https://lin.ee/ URLs", () => {
    expect(asPartnerLineUrl("https://lin.ee/abc123")).toBe(
      "https://lin.ee/abc123",
    );
  });

  it("accepts *.line.me subdomains", () => {
    expect(asPartnerLineUrl("https://shop.line.me/product/123")).toBe(
      "https://shop.line.me/product/123",
    );
  });

  it("rejects plain http:// line URLs", () => {
    expect(() => asPartnerLineUrl("http://line.me/ti/p/~hopnic")).toThrow();
  });

  it("rejects non-line.me domains", () => {
    expect(() => asPartnerLineUrl("https://evil.com/line.me/fake")).toThrow();
    expect(() => asPartnerLineUrl("https://google.com/maps")).toThrow();
  });

  it("rejects malformed / non-URL strings", () => {
    expect(() => asPartnerLineUrl("not-a-url")).toThrow();
    expect(() => asPartnerLineUrl("line.me/no-scheme")).toThrow();
  });
});

describe("asPartnerMapsUrl", () => {
  it("returns null for empty / null input", () => {
    expect(asPartnerMapsUrl(null)).toBeNull();
    expect(asPartnerMapsUrl("")).toBeNull();
    expect(asPartnerMapsUrl(undefined)).toBeNull();
  });

  it("accepts https://maps.google.com/ URLs", () => {
    expect(
      asPartnerMapsUrl("https://maps.google.com/maps?q=Bangkok"),
    ).toContain("maps.google.com");
  });

  it("accepts https://www.google.com/maps URLs", () => {
    expect(
      asPartnerMapsUrl("https://www.google.com/maps/place/Bangkok"),
    ).toContain("google.com/maps");
  });

  it("accepts https://maps.app.goo.gl/ short links", () => {
    expect(asPartnerMapsUrl("https://maps.app.goo.gl/AbCd1234")).toContain(
      "maps.app.goo.gl",
    );
  });

  it("rejects bare goo.gl shortener", () => {
    expect(() => asPartnerMapsUrl("https://goo.gl/maps/xyz")).toThrow();
    expect(() => asPartnerMapsUrl("https://goo.gl/AbCd")).toThrow();
  });

  it("rejects http:// maps URLs", () => {
    expect(() =>
      asPartnerMapsUrl("http://maps.google.com/maps?q=test"),
    ).toThrow();
  });

  it("rejects non-Google domains", () => {
    expect(() => asPartnerMapsUrl("https://bing.com/maps?q=Bangkok")).toThrow();
    expect(() =>
      asPartnerMapsUrl("https://evil.com/maps.google.com"),
    ).toThrow();
  });

  it("rejects malformed / non-URL strings", () => {
    expect(() => asPartnerMapsUrl("not-a-url")).toThrow();
    expect(() => asPartnerMapsUrl("maps.google.com/no-scheme")).toThrow();
  });
});

describe("buildPartnerCreatePayload — lineUrl + mapsUrl wired to validators", () => {
  const base = {
    slug: "url-test",
    directoryType: "store",
    nameTh: "ทดสอบ URL",
  };

  it("rejects invalid lineUrl at app layer", () => {
    expect(() =>
      buildPartnerCreatePayload({ ...base, lineUrl: "http://line.me/bad" }),
    ).toThrow();
  });

  it("rejects goo.gl mapsUrl at app layer", () => {
    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        mapsUrl: "https://goo.gl/maps/xyz",
      }),
    ).toThrow();
  });

  it("accepts valid lineUrl", () => {
    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        lineUrl: "https://line.me/ti/p/~hopnic",
      }),
    ).not.toThrow();
  });

  it("accepts valid mapsUrl", () => {
    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        mapsUrl: "https://maps.app.goo.gl/AbCd1234",
      }),
    ).not.toThrow();
  });
});
