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
 *  9.  Phase 1C-2B Basic Info form payload contract (service areas, biz hours, is_public)
 * 10.  Phase 1C-2B micro-adjust: business hours presets, SERVICE_AREA_OPTIONS slug values
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SERVICE_AREA_OPTIONS } from "../../app/data/thaiServiceAreas";
import {
  asPartnerSlug,
  asPartnerDirectoryType,
  asPartnerEntityType,
  asPartnerLineUrl,
  asPartnerMapsUrl,
  asPartnerBusinessHoursPresetKey,
  asPartnerSecondaryCategoryKeys,
  asPartnerSearchKeywords,
  validateCategoryKeyForDirectoryType,
  buildPartnerCreatePayload,
  buildPartnerUpdatePayload,
  ADMIN_PARTNER_LIST_SELECT,
  PUBLIC_PARTNER_LIST_SELECT,
  PUBLIC_PARTNER_DETAIL_SELECT,
  ADMIN_PARTNER_DETAIL_SELECT,
  mapAdminPartnerListItem,
  mapAdminPartnerDetail,
  mapPublicPartnerCard,
  mapPublicPartnerDetail,
  sanitisePublicCategoryParam,
  sanitisePublicSearchQuery,
  buildPublicCategoryOrFilter,
  buildPublicTextSearchOrFilter,
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2B: Basic Info form payload contract tests
// ─────────────────────────────────────────────────────────────────────────────
describe("buildPartnerCreatePayload — Basic Info form (Phase 1C-2B)", () => {
  const base = {
    slug: "test-store",
    directoryType: "store",
    nameTh: "ร้านทดสอบ",
  };

  it("defaults is_public to false when isPublic is not supplied", () => {
    const p = buildPartnerCreatePayload(base);
    expect(p.is_public).toBe(false);
  });

  it("defaults is_public to false when isPublic is explicitly undefined", () => {
    const p = buildPartnerCreatePayload({ ...base, isPublic: undefined });
    expect(p.is_public).toBe(false);
  });

  it("respects is_public=true when explicitly set", () => {
    const p = buildPartnerCreatePayload({ ...base, isPublic: true });
    expect(p.is_public).toBe(true);
  });

  it("service_areas strips empty strings and trims whitespace", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      serviceAreas: ["กรุงเทพฯ", "  ", "นนทบุรี", "", "สมุทรปราการ"],
    });
    expect(p.service_areas).toEqual(["กรุงเทพฯ", "นนทบุรี", "สมุทรปราการ"]);
  });

  it("service_areas defaults to empty array when not supplied", () => {
    const p = buildPartnerCreatePayload(base);
    expect(p.service_areas).toEqual([]);
  });

  it("service_areas removes duplicate values", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      serviceAreas: ["กรุงเทพฯ", "กรุงเทพฯ", "นนทบุรี"],
    });
    expect(p.service_areas).toEqual(["กรุงเทพฯ", "นนทบุรี"]);
  });

  it("maps taglineTh → tagline_th", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      taglineTh: "จำหน่ายวัสดุก่อสร้างราคาส่ง",
    });
    expect(p.tagline_th).toBe("จำหน่ายวัสดุก่อสร้างราคาส่ง");
  });

  it("tagline_th is null when not supplied", () => {
    const p = buildPartnerCreatePayload(base);
    expect(p.tagline_th).toBeNull();
  });

  it("maps businessHoursText → business_hours_text", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      businessHoursText: "จันทร์-เสาร์ 09:00-18:00",
    });
    expect(p.business_hours_text).toBe("จันทร์-เสาร์ 09:00-18:00");
  });

  it("category must match directoryType prefix — incompatible category rejected", () => {
    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        directoryType: "store",
        mainCategoryKey: "service_transport_logistics",
      }),
    ).toThrow(/not valid/);

    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        directoryType: "service",
        mainCategoryKey: "contractor_general",
      }),
    ).toThrow(/not valid/);

    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        directoryType: "contractor",
        mainCategoryKey: "store_plumbing",
      }),
    ).toThrow(/not valid/);
  });

  it("compatible category accepted for each directoryType", () => {
    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        directoryType: "store",
        mainCategoryKey: "store_construction_materials",
      }),
    ).not.toThrow();

    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        directoryType: "service",
        slug: "test-service",
        mainCategoryKey: "service_design_consulting",
      }),
    ).not.toThrow();

    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        directoryType: "contractor",
        slug: "test-contractor",
        mainCategoryKey: "contractor_general",
      }),
    ).not.toThrow();
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2B micro-adjust: business hours presets + SERVICE_AREA_OPTIONS reuse
// ─────────────────────────────────────────────────────────────────────────────
describe("buildPartnerCreatePayload — business hours preset mapping", () => {
  const base = {
    slug: "biz-hours-test",
    directoryType: "store",
    nameTh: "ร้านทดสอบเวลาทำการ",
  };

  it("preset string submits as business_hours_text verbatim", () => {
    const presets = [
      "ทุกวัน 09:00-18:00",
      "จันทร์-ศุกร์ 09:00-18:00",
      "จันทร์-เสาร์ 09:00-18:00",
      "เสาร์-อาทิตย์ 09:00-18:00",
      "เปิด 24 ชั่วโมง",
      "ตามนัดหมาย",
    ];
    for (const preset of presets) {
      const p = buildPartnerCreatePayload({
        ...base,
        businessHoursText: preset,
      });
      expect(p.business_hours_text).toBe(preset);
    }
  });

  it("ไม่ระบุ — empty string maps to null (asOptionalString convention)", () => {
    // When UI sends empty string for "ไม่ระบุ", API stores null
    const p = buildPartnerCreatePayload({ ...base, businessHoursText: "" });
    expect(p.business_hours_text).toBeNull();
  });

  it("ไม่ระบุ — omitting businessHoursText also maps to null", () => {
    const p = buildPartnerCreatePayload(base);
    expect(p.business_hours_text).toBeNull();
  });

  it("กำหนดเอง — custom text submits as business_hours_text", () => {
    const custom = "จันทร์-เสาร์ 08:00-20:00 อาทิตย์ปิด";
    const p = buildPartnerCreatePayload({ ...base, businessHoursText: custom });
    expect(p.business_hours_text).toBe(custom);
  });

  it("custom text is trimmed by asOptionalString before storage", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      businessHoursText: "  จันทร์-ศุกร์ 09:00-18:00  ",
    });
    expect(p.business_hours_text).toBe("จันทร์-ศุกร์ 09:00-18:00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2B.3 — businessHoursPresetKey: validator
// ─────────────────────────────────────────────────────────────────────────────
describe("asPartnerBusinessHoursPresetKey — validator", () => {
  it("accepts all valid preset keys", () => {
    expect(asPartnerBusinessHoursPresetKey("open_24h")).toBe("open_24h");
    expect(asPartnerBusinessHoursPresetKey("by_appointment")).toBe(
      "by_appointment",
    );
    expect(asPartnerBusinessHoursPresetKey("everyday_0900_1800")).toBe(
      "everyday_0900_1800",
    );
    expect(asPartnerBusinessHoursPresetKey("mon_fri_0900_1800")).toBe(
      "mon_fri_0900_1800",
    );
    expect(asPartnerBusinessHoursPresetKey("mon_sat_0900_1800")).toBe(
      "mon_sat_0900_1800",
    );
    expect(asPartnerBusinessHoursPresetKey("sat_sun_0900_1800")).toBe(
      "sat_sun_0900_1800",
    );
  });

  it("returns null for null input", () => {
    expect(asPartnerBusinessHoursPresetKey(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(asPartnerBusinessHoursPresetKey(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(asPartnerBusinessHoursPresetKey("")).toBeNull();
  });

  it("rejects invalid preset keys", () => {
    expect(() => asPartnerBusinessHoursPresetKey("bad_key")).toThrow();
    expect(() => asPartnerBusinessHoursPresetKey("open24h")).toThrow();
    expect(() => asPartnerBusinessHoursPresetKey("OPEN_24H")).toThrow();
    expect(() => asPartnerBusinessHoursPresetKey("custom")).toThrow();
  });

  it("rejects non-string values", () => {
    expect(() => asPartnerBusinessHoursPresetKey(42)).toThrow();
    expect(() => asPartnerBusinessHoursPresetKey(true)).toThrow();
    expect(() => asPartnerBusinessHoursPresetKey({})).toThrow();
  });

  it("does not accept Thai preset display text (machine keys only)", () => {
    expect(() =>
      asPartnerBusinessHoursPresetKey("ทุกวัน 09:00-18:00"),
    ).toThrow();
    expect(() => asPartnerBusinessHoursPresetKey("ตามนัดหมาย")).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2B.3 — buildPartnerCreatePayload: businessHoursPresetKey
// ─────────────────────────────────────────────────────────────────────────────
describe("buildPartnerCreatePayload — businessHoursPresetKey", () => {
  const base = {
    slug: "preset-create-test",
    directoryType: "store",
    nameTh: "ร้านทดสอบ",
  };

  it("maps businessHoursPresetKey = everyday_0900_1800 to business_hours_preset_key", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      businessHoursPresetKey: "everyday_0900_1800",
    });
    expect(p.business_hours_preset_key).toBe("everyday_0900_1800");
  });

  it("maps businessHoursPresetKey = open_24h", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      businessHoursPresetKey: "open_24h",
    });
    expect(p.business_hours_preset_key).toBe("open_24h");
  });

  it("maps businessHoursPresetKey = by_appointment", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      businessHoursPresetKey: "by_appointment",
    });
    expect(p.business_hours_preset_key).toBe("by_appointment");
  });

  it("maps businessHoursPresetKey = null to business_hours_preset_key = null", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      businessHoursPresetKey: null,
    });
    expect(p.business_hours_preset_key).toBeNull();
  });

  it("defaults business_hours_preset_key to null when omitted", () => {
    const p = buildPartnerCreatePayload(base);
    expect(p.business_hours_preset_key).toBeNull();
  });

  it("rejects invalid businessHoursPresetKey", () => {
    expect(() =>
      buildPartnerCreatePayload({ ...base, businessHoursPresetKey: "bad_key" }),
    ).toThrow();
  });

  it("keeps businessHoursText unchanged alongside preset key", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      businessHoursPresetKey: "open_24h",
      businessHoursText: "เปิด 24 ชั่วโมง",
    });
    expect(p.business_hours_preset_key).toBe("open_24h");
    expect(p.business_hours_text).toBe("เปิด 24 ชั่วโมง");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2B.3 — buildPartnerUpdatePayload: businessHoursPresetKey
// ─────────────────────────────────────────────────────────────────────────────
describe("buildPartnerUpdatePayload — businessHoursPresetKey patching", () => {
  it("patches business_hours_preset_key when businessHoursPresetKey is present", () => {
    const p = buildPartnerUpdatePayload({
      businessHoursPresetKey: "mon_fri_0900_1800",
    });
    expect(p.business_hours_preset_key).toBe("mon_fri_0900_1800");
  });

  it("sets business_hours_preset_key = null when businessHoursPresetKey is null", () => {
    const p = buildPartnerUpdatePayload({ businessHoursPresetKey: null });
    expect(p.business_hours_preset_key).toBeNull();
  });

  it("omits business_hours_preset_key when businessHoursPresetKey is absent", () => {
    const p = buildPartnerUpdatePayload({ nameTh: "ชื่อใหม่" });
    expect("business_hours_preset_key" in p).toBe(false);
  });

  it("rejects invalid businessHoursPresetKey in update", () => {
    expect(() =>
      buildPartnerUpdatePayload({ businessHoursPresetKey: "invalid_key" }),
    ).toThrow();
  });

  it("businessHoursText update is unaffected by businessHoursPresetKey absence", () => {
    const p = buildPartnerUpdatePayload({
      businessHoursText: "จันทร์-ศุกร์ 09:00-18:00",
    });
    expect(p.business_hours_text).toBe("จันทร์-ศุกร์ 09:00-18:00");
    expect("business_hours_preset_key" in p).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2B.3 — SELECT strings: business hours columns coverage
// ─────────────────────────────────────────────────────────────────────────────
describe("SELECT strings — business hours preset key and timezone coverage", () => {
  it("ADMIN_PARTNER_LIST_SELECT includes business_hours_preset_key", () => {
    expect(ADMIN_PARTNER_LIST_SELECT).toContain("business_hours_preset_key");
  });

  it("ADMIN_PARTNER_DETAIL_SELECT includes business_hours_preset_key", () => {
    expect(ADMIN_PARTNER_DETAIL_SELECT).toContain("business_hours_preset_key");
  });

  it("ADMIN_PARTNER_DETAIL_SELECT includes business_hours_timezone", () => {
    expect(ADMIN_PARTNER_DETAIL_SELECT).toContain("business_hours_timezone");
  });

  it("PUBLIC_PARTNER_LIST_SELECT includes business_hours_preset_key", () => {
    expect(PUBLIC_PARTNER_LIST_SELECT).toContain("business_hours_preset_key");
  });

  it("PUBLIC_PARTNER_DETAIL_SELECT includes business_hours_preset_key", () => {
    expect(PUBLIC_PARTNER_DETAIL_SELECT).toContain("business_hours_preset_key");
  });

  it("PUBLIC_PARTNER_DETAIL_SELECT includes business_hours_timezone", () => {
    expect(PUBLIC_PARTNER_DETAIL_SELECT).toContain("business_hours_timezone");
  });

  it("PUBLIC_PARTNER_LIST_SELECT still excludes all private fields", () => {
    for (const f of ["kyc_documents", "verified_notes", "internal_notes"]) {
      expect(PUBLIC_PARTNER_LIST_SELECT).not.toContain(f);
    }
  });

  it("PUBLIC_PARTNER_DETAIL_SELECT still excludes all private fields", () => {
    for (const f of ["kyc_documents", "verified_notes", "internal_notes"]) {
      expect(PUBLIC_PARTNER_DETAIL_SELECT).not.toContain(f);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2B.3 — Mapper: mapAdminPartnerDetail
// ─────────────────────────────────────────────────────────────────────────────
describe("mapAdminPartnerDetail — businessHoursPresetKey + businessHoursTimezone", () => {
  const baseRow = {
    id: "uuid-admin-1",
    slug: "admin-test",
    directory_type: "store",
    entity_type: "organization",
    name_th: "ร้านทดสอบ",
    name_en: null,
    tagline_th: null,
    tagline_en: null,
    description_th: null,
    description_en: null,
    main_image_url: null,
    main_category_key: null,
    service_areas: [],
    contact_phone: null,
    contact_email: null,
    line_id: null,
    line_url: null,
    maps_url: null,
    business_hours_text: null,
    is_verified: false,
    verified_at: null,
    is_public: false,
    is_featured: false,
    sort_order: 0,
    kyc_documents: {},
    verified_notes: null,
    internal_notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("returns businessHoursPresetKey when set", () => {
    const row = {
      ...baseRow,
      business_hours_preset_key: "open_24h",
      business_hours_timezone: "Asia/Bangkok",
    };
    expect(mapAdminPartnerDetail(row).businessHoursPresetKey).toBe("open_24h");
  });

  it("returns null businessHoursPresetKey when not set", () => {
    const row = {
      ...baseRow,
      business_hours_preset_key: null,
      business_hours_timezone: "Asia/Bangkok",
    };
    expect(mapAdminPartnerDetail(row).businessHoursPresetKey).toBeNull();
  });

  it("returns businessHoursTimezone from row", () => {
    const row = {
      ...baseRow,
      business_hours_preset_key: null,
      business_hours_timezone: "Asia/Bangkok",
    };
    expect(mapAdminPartnerDetail(row).businessHoursTimezone).toBe(
      "Asia/Bangkok",
    );
  });

  it("defaults businessHoursTimezone to Asia/Bangkok when absent", () => {
    expect(mapAdminPartnerDetail(baseRow).businessHoursTimezone).toBe(
      "Asia/Bangkok",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2B.3 — Mapper: mapPublicPartnerCard
// ─────────────────────────────────────────────────────────────────────────────
describe("mapPublicPartnerCard — businessHoursPresetKey", () => {
  const baseRow = {
    id: "uuid-pub-1",
    slug: "public-card-test",
    directory_type: "store",
    entity_type: "organization",
    name_th: "ร้านสาธารณะ",
    name_en: null,
    tagline_th: null,
    tagline_en: null,
    main_image_url: null,
    main_category_key: null,
    service_areas: [],
    is_verified: true,
    verified_at: "2026-01-01T00:00:00Z",
    is_featured: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("returns businessHoursPresetKey when present", () => {
    const row = { ...baseRow, business_hours_preset_key: "mon_fri_0900_1800" };
    expect(mapPublicPartnerCard(row).businessHoursPresetKey).toBe(
      "mon_fri_0900_1800",
    );
  });

  it("returns null when business_hours_preset_key is null", () => {
    const row = { ...baseRow, business_hours_preset_key: null };
    expect(mapPublicPartnerCard(row).businessHoursPresetKey).toBeNull();
  });

  it("returns null when business_hours_preset_key is absent from row", () => {
    expect(mapPublicPartnerCard(baseRow).businessHoursPresetKey).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2B.3 — Mapper: mapPublicPartnerDetail
// ─────────────────────────────────────────────────────────────────────────────
describe("mapPublicPartnerDetail — businessHoursPresetKey + businessHoursTimezone", () => {
  const baseRow = {
    id: "uuid-pub-2",
    slug: "public-detail-test",
    directory_type: "service",
    entity_type: "individual",
    name_th: "บริการทดสอบ",
    name_en: null,
    tagline_th: null,
    tagline_en: null,
    description_th: null,
    description_en: null,
    main_image_url: null,
    main_category_key: null,
    service_areas: [],
    contact_phone: null,
    contact_email: null,
    line_id: null,
    line_url: null,
    maps_url: null,
    business_hours_text: "จันทร์-ศุกร์ 09:00-18:00",
    is_verified: false,
    verified_at: null,
    is_featured: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("returns businessHoursPresetKey", () => {
    const row = {
      ...baseRow,
      business_hours_preset_key: "mon_fri_0900_1800",
      business_hours_timezone: "Asia/Bangkok",
    };
    expect(mapPublicPartnerDetail(row).businessHoursPresetKey).toBe(
      "mon_fri_0900_1800",
    );
  });

  it("returns businessHoursTimezone", () => {
    const row = {
      ...baseRow,
      business_hours_preset_key: null,
      business_hours_timezone: "Asia/Bangkok",
    };
    expect(mapPublicPartnerDetail(row).businessHoursTimezone).toBe(
      "Asia/Bangkok",
    );
  });

  it("still returns businessHoursText (not affected by preset key)", () => {
    const row = {
      ...baseRow,
      business_hours_preset_key: "mon_fri_0900_1800",
      business_hours_timezone: "Asia/Bangkok",
    };
    expect(mapPublicPartnerDetail(row).businessHoursText).toBe(
      "จันทร์-ศุกร์ 09:00-18:00",
    );
  });

  it("defaults businessHoursTimezone to Asia/Bangkok when absent", () => {
    expect(mapPublicPartnerDetail(baseRow).businessHoursTimezone).toBe(
      "Asia/Bangkok",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2B.3 — Regression: businessHoursText unaffected
// ─────────────────────────────────────────────────────────────────────────────
describe("buildPartnerCreatePayload — businessHoursText regression (1C-2B.3)", () => {
  const base = {
    slug: "regression-2b3",
    directoryType: "store",
    nameTh: "ร้านถดถอย",
  };

  it("still maps businessHoursText to business_hours_text", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      businessHoursText: "จันทร์-เสาร์ 09:00-18:00",
    });
    expect(p.business_hours_text).toBe("จันทร์-เสาร์ 09:00-18:00");
  });

  it("businessHoursText null still accepted", () => {
    const p = buildPartnerCreatePayload({ ...base, businessHoursText: null });
    expect(p.business_hours_text).toBeNull();
  });
});

describe("SERVICE_AREA_OPTIONS reuse — slug values are valid string array items", () => {
  const base = {
    slug: "service-area-test",
    directoryType: "store",
    nameTh: "ร้านทดสอบพื้นที่",
  };

  it("SERVICE_AREA_OPTIONS has at least one entry per geographic group", () => {
    const groups = new Set(SERVICE_AREA_OPTIONS.map((o) => o.group));
    expect(groups.has("special")).toBe(true);
    expect(groups.has("central")).toBe(true);
    expect(groups.has("north")).toBe(true);
    expect(groups.has("south")).toBe(true);
  });

  it("all SERVICE_AREA_OPTIONS values pass through service_areas as-is", () => {
    // Pick a representative sample (first from each group)
    const sample = [
      "nationwide",
      "bangkok-metro",
      "nonthaburi",
      "chiang-mai",
      "phuket",
    ];
    const p = buildPartnerCreatePayload({ ...base, serviceAreas: sample });
    expect(p.service_areas).toEqual(sample);
  });

  it("service_areas with SERVICE_AREA_OPTIONS slugs submits as string[]", () => {
    const selected = SERVICE_AREA_OPTIONS.slice(0, 3).map((o) => o.value);
    const p = buildPartnerCreatePayload({ ...base, serviceAreas: selected });
    expect(Array.isArray(p.service_areas)).toBe(true);
    expect(p.service_areas).toHaveLength(3);
    for (const v of p.service_areas) {
      expect(typeof v).toBe("string");
    }
  });

  it("SERVICE_AREA_OPTIONS values are all non-empty kebab-case strings", () => {
    for (const opt of SERVICE_AREA_OPTIONS) {
      expect(opt.value.length).toBeGreaterThan(0);
      // must be lowercase alphanumeric + hyphens only
      expect(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(opt.value)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2D.2 — asPartnerSecondaryCategoryKeys validator
// ─────────────────────────────────────────────────────────────────────────────
describe("asPartnerSecondaryCategoryKeys — validator", () => {
  it("returns empty array for undefined / empty input", () => {
    expect(asPartnerSecondaryCategoryKeys(undefined, "store", null)).toEqual(
      [],
    );
    expect(asPartnerSecondaryCategoryKeys([], "store", null)).toEqual([]);
  });

  it("accepts valid secondary keys matching the directoryType prefix", () => {
    expect(
      asPartnerSecondaryCategoryKeys(
        ["store_plumbing", "store_electrical"],
        "store",
        "store_hardware_tools",
      ),
    ).toEqual(["store_plumbing", "store_electrical"]);
  });

  it("strips empty and whitespace-only values", () => {
    expect(
      asPartnerSecondaryCategoryKeys(
        ["store_plumbing", "", "  "],
        "store",
        null,
      ),
    ).toEqual(["store_plumbing"]);
  });

  it("deduplicates values", () => {
    expect(
      asPartnerSecondaryCategoryKeys(
        ["store_plumbing", "store_plumbing"],
        "store",
        null,
      ),
    ).toEqual(["store_plumbing"]);
  });

  it("rejects a key with wrong directoryType prefix", () => {
    expect(() =>
      asPartnerSecondaryCategoryKeys(["service_logistics"], "store", null),
    ).toThrow(/not valid/);
  });

  it("rejects a key equal to mainCategoryKey", () => {
    expect(() =>
      asPartnerSecondaryCategoryKeys(
        ["store_hardware_tools"],
        "store",
        "store_hardware_tools",
      ),
    ).toThrow(/must not include mainCategoryKey/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2D.2 — asPartnerSearchKeywords validator
// ─────────────────────────────────────────────────────────────────────────────
describe("asPartnerSearchKeywords — validator", () => {
  it("returns empty array for undefined / empty input", () => {
    expect(asPartnerSearchKeywords(undefined)).toEqual([]);
    expect(asPartnerSearchKeywords([])).toEqual([]);
  });

  it("accepts valid keywords", () => {
    expect(
      asPartnerSearchKeywords(["ร้านวัสดุ", "hardware", "ก่อสร้าง"]),
    ).toEqual(["ร้านวัสดุ", "hardware", "ก่อสร้าง"]);
  });

  it("strips empty / whitespace-only values", () => {
    expect(asPartnerSearchKeywords(["keyword", "", "  "])).toEqual(["keyword"]);
  });

  it("deduplicates values", () => {
    expect(asPartnerSearchKeywords(["keyword", "keyword"])).toEqual([
      "keyword",
    ]);
  });

  it("rejects more than 20 keywords", () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `kw${i}`);
    expect(() => asPartnerSearchKeywords(tooMany)).toThrow(/at most 20/);
  });

  it("rejects a keyword longer than 50 characters", () => {
    const longKw = "a".repeat(51);
    expect(() => asPartnerSearchKeywords([longKw])).toThrow(
      /exceeds maximum length/,
    );
  });

  it("accepts exactly 20 keywords", () => {
    const exactly20 = Array.from({ length: 20 }, (_, i) => `kw${i}`);
    expect(() => asPartnerSearchKeywords(exactly20)).not.toThrow();
  });

  it("accepts a keyword of exactly 50 characters", () => {
    const exactly50 = "a".repeat(50);
    expect(() => asPartnerSearchKeywords([exactly50])).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2D.2 — buildPartnerCreatePayload: secondaryCategoryKeys + searchKeywords
// ─────────────────────────────────────────────────────────────────────────────
describe("buildPartnerCreatePayload — secondaryCategoryKeys + searchKeywords", () => {
  const base = {
    slug: "sec-cat-test",
    directoryType: "store",
    nameTh: "ร้านทดสอบ",
    mainCategoryKey: "store_hardware_tools",
  };

  it("maps secondaryCategoryKeys to secondary_category_keys", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      secondaryCategoryKeys: ["store_plumbing", "store_electrical"],
    });
    expect(p.secondary_category_keys).toEqual([
      "store_plumbing",
      "store_electrical",
    ]);
  });

  it("defaults secondary_category_keys to [] when omitted", () => {
    const p = buildPartnerCreatePayload(base);
    expect(p.secondary_category_keys).toEqual([]);
  });

  it("strips empty secondary values", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      secondaryCategoryKeys: ["store_plumbing", "", "  "],
    });
    expect(p.secondary_category_keys).toEqual(["store_plumbing"]);
  });

  it("dedupes secondary values", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      secondaryCategoryKeys: ["store_plumbing", "store_plumbing"],
    });
    expect(p.secondary_category_keys).toEqual(["store_plumbing"]);
  });

  it("rejects secondary key with wrong directoryType prefix", () => {
    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        secondaryCategoryKeys: ["service_logistics"],
      }),
    ).toThrow(/not valid/);
  });

  it("rejects secondary key equal to mainCategoryKey", () => {
    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        secondaryCategoryKeys: ["store_hardware_tools"],
      }),
    ).toThrow(/must not include mainCategoryKey/);
  });

  it("maps searchKeywords to search_keywords", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      searchKeywords: ["ร้านวัสดุ", "hardware"],
    });
    expect(p.search_keywords).toEqual(["ร้านวัสดุ", "hardware"]);
  });

  it("defaults search_keywords to [] when omitted", () => {
    const p = buildPartnerCreatePayload(base);
    expect(p.search_keywords).toEqual([]);
  });

  it("strips empty search keywords", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      searchKeywords: ["ร้านวัสดุ", "", "  "],
    });
    expect(p.search_keywords).toEqual(["ร้านวัสดุ"]);
  });

  it("dedupes search keywords", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      searchKeywords: ["ร้านวัสดุ", "ร้านวัสดุ"],
    });
    expect(p.search_keywords).toEqual(["ร้านวัสดุ"]);
  });

  it("rejects too many search keywords", () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `kw${i}`);
    expect(() =>
      buildPartnerCreatePayload({ ...base, searchKeywords: tooMany }),
    ).toThrow(/at most 20/);
  });

  it("rejects keyword longer than 50 characters", () => {
    expect(() =>
      buildPartnerCreatePayload({
        ...base,
        searchKeywords: ["a".repeat(51)],
      }),
    ).toThrow(/exceeds maximum length/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2D.2 — buildPartnerUpdatePayload: secondaryCategoryKeys + searchKeywords
// ─────────────────────────────────────────────────────────────────────────────
describe("buildPartnerUpdatePayload — secondaryCategoryKeys + searchKeywords", () => {
  it("maps secondaryCategoryKeys when present alongside directoryType", () => {
    const p = buildPartnerUpdatePayload({
      directoryType: "store",
      secondaryCategoryKeys: ["store_plumbing"],
    });
    expect(p.secondary_category_keys).toEqual(["store_plumbing"]);
  });

  it("empty array clears secondary_category_keys", () => {
    const p = buildPartnerUpdatePayload({
      directoryType: "store",
      secondaryCategoryKeys: [],
    });
    expect(p.secondary_category_keys).toEqual([]);
  });

  it("absent secondaryCategoryKeys omits secondary_category_keys from patch", () => {
    const p = buildPartnerUpdatePayload({ nameTh: "ชื่อใหม่" });
    expect("secondary_category_keys" in p).toBe(false);
  });

  it("rejects invalid secondary key when directoryType is in same body", () => {
    expect(() =>
      buildPartnerUpdatePayload({
        directoryType: "store",
        secondaryCategoryKeys: ["service_logistics"],
      }),
    ).toThrow(/not valid/);
  });

  it("maps secondaryCategoryKeys without prefix validation when directoryType absent", () => {
    // Basic normalisation only — endpoint handles cross-validation in this case
    const p = buildPartnerUpdatePayload({
      secondaryCategoryKeys: ["store_plumbing"],
    });
    expect(p.secondary_category_keys).toEqual(["store_plumbing"]);
  });

  it("maps searchKeywords when present", () => {
    const p = buildPartnerUpdatePayload({ searchKeywords: ["ร้านวัสดุ"] });
    expect(p.search_keywords).toEqual(["ร้านวัสดุ"]);
  });

  it("empty array clears search_keywords", () => {
    const p = buildPartnerUpdatePayload({ searchKeywords: [] });
    expect(p.search_keywords).toEqual([]);
  });

  it("absent searchKeywords omits search_keywords from patch", () => {
    const p = buildPartnerUpdatePayload({ nameTh: "ชื่อใหม่" });
    expect("search_keywords" in p).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2D.2 — SELECT strings: secondary_category_keys + search_keywords coverage
// ─────────────────────────────────────────────────────────────────────────────
describe("SELECT strings — secondary_category_keys + search_keywords coverage", () => {
  it("ADMIN_PARTNER_LIST_SELECT includes secondary_category_keys", () => {
    expect(ADMIN_PARTNER_LIST_SELECT).toContain("secondary_category_keys");
  });

  it("ADMIN_PARTNER_LIST_SELECT does NOT include search_keywords", () => {
    expect(ADMIN_PARTNER_LIST_SELECT).not.toContain("search_keywords");
  });

  it("ADMIN_PARTNER_DETAIL_SELECT includes secondary_category_keys", () => {
    expect(ADMIN_PARTNER_DETAIL_SELECT).toContain("secondary_category_keys");
  });

  it("ADMIN_PARTNER_DETAIL_SELECT includes search_keywords", () => {
    expect(ADMIN_PARTNER_DETAIL_SELECT).toContain("search_keywords");
  });

  it("PUBLIC_PARTNER_LIST_SELECT includes secondary_category_keys", () => {
    expect(PUBLIC_PARTNER_LIST_SELECT).toContain("secondary_category_keys");
  });

  it("PUBLIC_PARTNER_LIST_SELECT does NOT include search_keywords", () => {
    expect(PUBLIC_PARTNER_LIST_SELECT).not.toContain("search_keywords");
  });

  it("PUBLIC_PARTNER_DETAIL_SELECT includes secondary_category_keys", () => {
    expect(PUBLIC_PARTNER_DETAIL_SELECT).toContain("secondary_category_keys");
  });

  it("PUBLIC_PARTNER_DETAIL_SELECT does NOT include search_keywords", () => {
    expect(PUBLIC_PARTNER_DETAIL_SELECT).not.toContain("search_keywords");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2D.2 — Mappers: secondaryCategoryKeys + searchKeywords
// ─────────────────────────────────────────────────────────────────────────────
describe("mapAdminPartnerListItem — secondaryCategoryKeys", () => {
  const baseRow = {
    id: "uuid-list-1",
    slug: "list-test",
    directory_type: "store",
    entity_type: "organization",
    name_th: "ร้านทดสอบ",
    name_en: null,
    tagline_th: null,
    main_image_url: null,
    main_category_key: "store_hardware_tools",
    service_areas: [],
    business_hours_preset_key: null,
    is_verified: false,
    is_public: true,
    is_featured: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("maps secondary_category_keys to secondaryCategoryKeys", () => {
    const row = {
      ...baseRow,
      secondary_category_keys: ["store_plumbing", "store_electrical"],
    };
    expect(mapAdminPartnerListItem(row).secondaryCategoryKeys).toEqual([
      "store_plumbing",
      "store_electrical",
    ]);
  });

  it("defaults secondaryCategoryKeys to [] when absent", () => {
    expect(mapAdminPartnerListItem(baseRow).secondaryCategoryKeys).toEqual([]);
  });
});

describe("mapAdminPartnerDetail — secondaryCategoryKeys + searchKeywords", () => {
  const baseRow = {
    id: "uuid-admin-detail-1",
    slug: "admin-detail-test",
    directory_type: "store",
    entity_type: "organization",
    name_th: "ร้านทดสอบ",
    name_en: null,
    tagline_th: null,
    tagline_en: null,
    description_th: null,
    description_en: null,
    main_image_url: null,
    main_category_key: "store_hardware_tools",
    service_areas: [],
    contact_phone: null,
    contact_email: null,
    line_id: null,
    line_url: null,
    maps_url: null,
    business_hours_text: null,
    business_hours_preset_key: null,
    business_hours_timezone: "Asia/Bangkok",
    is_verified: false,
    verified_at: null,
    is_public: false,
    is_featured: false,
    sort_order: 0,
    kyc_documents: {},
    verified_notes: null,
    internal_notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("maps secondary_category_keys to secondaryCategoryKeys", () => {
    const row = {
      ...baseRow,
      secondary_category_keys: ["store_plumbing"],
      search_keywords: [],
    };
    expect(mapAdminPartnerDetail(row).secondaryCategoryKeys).toEqual([
      "store_plumbing",
    ]);
  });

  it("maps search_keywords to searchKeywords", () => {
    const row = {
      ...baseRow,
      secondary_category_keys: [],
      search_keywords: ["ร้านวัสดุ", "hardware"],
    };
    expect(mapAdminPartnerDetail(row).searchKeywords).toEqual([
      "ร้านวัสดุ",
      "hardware",
    ]);
  });

  it("defaults secondaryCategoryKeys to [] when absent", () => {
    expect(mapAdminPartnerDetail(baseRow).secondaryCategoryKeys).toEqual([]);
  });

  it("defaults searchKeywords to [] when absent", () => {
    expect(mapAdminPartnerDetail(baseRow).searchKeywords).toEqual([]);
  });
});

describe("mapPublicPartnerCard — secondaryCategoryKeys (no searchKeywords)", () => {
  const baseRow = {
    id: "uuid-pub-card-1",
    slug: "pub-card-test",
    directory_type: "store",
    entity_type: "organization",
    name_th: "ร้านสาธารณะ",
    name_en: null,
    tagline_th: null,
    tagline_en: null,
    main_image_url: null,
    main_category_key: "store_hardware_tools",
    service_areas: [],
    business_hours_preset_key: null,
    is_verified: false,
    verified_at: null,
    is_featured: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("maps secondary_category_keys to secondaryCategoryKeys", () => {
    const row = {
      ...baseRow,
      secondary_category_keys: ["store_plumbing"],
      search_keywords: ["should-never-appear"],
    };
    expect(mapPublicPartnerCard(row).secondaryCategoryKeys).toEqual([
      "store_plumbing",
    ]);
  });

  it("defaults secondaryCategoryKeys to [] when absent", () => {
    expect(mapPublicPartnerCard(baseRow).secondaryCategoryKeys).toEqual([]);
  });

  it("does NOT expose search_keywords", () => {
    const row = {
      ...baseRow,
      secondary_category_keys: [],
      search_keywords: ["secret"],
    };
    const mapped = mapPublicPartnerCard(row) as Record<string, unknown>;
    expect("searchKeywords" in mapped).toBe(false);
    expect("search_keywords" in mapped).toBe(false);
  });
});

describe("mapPublicPartnerDetail — secondaryCategoryKeys (no searchKeywords)", () => {
  const baseRow = {
    id: "uuid-pub-detail-1",
    slug: "pub-detail-test",
    directory_type: "service",
    entity_type: "individual",
    name_th: "บริการทดสอบ",
    name_en: null,
    tagline_th: null,
    tagline_en: null,
    description_th: null,
    description_en: null,
    main_image_url: null,
    main_category_key: null,
    service_areas: [],
    contact_phone: null,
    contact_email: null,
    line_id: null,
    line_url: null,
    maps_url: null,
    business_hours_text: null,
    business_hours_preset_key: null,
    business_hours_timezone: "Asia/Bangkok",
    is_verified: false,
    verified_at: null,
    is_featured: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("includes secondaryCategoryKeys (inherited from mapPublicPartnerCard)", () => {
    const row = {
      ...baseRow,
      secondary_category_keys: ["service_transport"],
    };
    expect(mapPublicPartnerDetail(row).secondaryCategoryKeys).toEqual([
      "service_transport",
    ]);
  });

  it("does NOT expose search_keywords", () => {
    const row = {
      ...baseRow,
      secondary_category_keys: [],
      search_keywords: ["secret"],
    };
    const mapped = mapPublicPartnerDetail(row) as Record<string, unknown>;
    expect("searchKeywords" in mapped).toBe(false);
    expect("search_keywords" in mapped).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2D.2 fix (v2) — PATCH endpoint unified effective-state validation
// ─────────────────────────────────────────────────────────────────────────────
describe("PATCH endpoint — unified effective-state category validation", () => {
  it("imports asPartnerSecondaryCategoryKeys for unified validation", () => {
    const src = read("server/api/admin/partners/[id].patch.ts");
    expect(src).toContain("asPartnerSecondaryCategoryKeys");
  });

  it("imports validateCategoryKeyForDirectoryType for mainCategoryKey validation", () => {
    const src = read("server/api/admin/partners/[id].patch.ts");
    expect(src).toContain("validateCategoryKeyForDirectoryType");
  });

  it("has a unified hasCategoryPatch guard", () => {
    const src = read("server/api/admin/partners/[id].patch.ts");
    expect(src).toContain("hasCategoryPatch");
    expect(src).toContain('"directory_type" in payload');
    expect(src).toContain('"main_category_key" in payload');
    expect(src).toContain('"secondary_category_keys" in payload');
  });

  it("fetches directory_type and main_category_key together in one DB query", () => {
    const src = read("server/api/admin/partners/[id].patch.ts");
    expect(src).toContain("directory_type, main_category_key");
  });

  it("resolves effectiveDirectoryType from payload or existing DB value", () => {
    const src = read("server/api/admin/partners/[id].patch.ts");
    expect(src).toContain("effectiveDirectoryType");
    expect(src).toContain("effectiveMainCategoryKey");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2D.2 fix (v2) — effective-state validation scenarios (unit-level)
//
// These tests exercise the utility functions (validateCategoryKeyForDirectoryType,
// asPartnerSecondaryCategoryKeys) with the effective values the endpoint would
// compute after DB fetch, verifying each PATCH scenario is handled correctly.
// ─────────────────────────────────────────────────────────────────────────────
describe("Effective-state category validation — PATCH scenario coverage", () => {
  // ── PATCH directoryType only ───────────────────────────────────────────────

  it("PATCH directoryType only: rejects if existing mainCategoryKey is incompatible", () => {
    // Existing: { directoryType: "store", mainCategoryKey: "store_hardware_tools" }
    // PATCH: { directoryType: "service" }
    // effectiveDir = "service", effectiveMain = "store_hardware_tools" → incompatible
    expect(() =>
      validateCategoryKeyForDirectoryType("service", "store_hardware_tools"),
    ).toThrow(/not valid/);
  });

  it("PATCH directoryType only: passes if existing mainCategoryKey is null", () => {
    // Null main_category_key is always valid regardless of directory type
    expect(() =>
      validateCategoryKeyForDirectoryType("service", null),
    ).not.toThrow();
  });

  it("PATCH directoryType only: passes if existing mainCategoryKey matches new type", () => {
    // Existing: { directoryType: "store", mainCategoryKey: "service_logistics" } — already consistent?
    // Actually: changing to "service", existing main = "service_transport" → compatible
    expect(() =>
      validateCategoryKeyForDirectoryType("service", "service_transport"),
    ).not.toThrow();
  });

  // ── PATCH directoryType + secondaryCategoryKeys (no mainCategoryKey) ───────

  it("PATCH directoryType + secondaryCategoryKeys: rejects if existing mainCategoryKey is incompatible with new type", () => {
    // Existing: { directoryType: "store", mainCategoryKey: "store_hardware_tools" }
    // PATCH: { directoryType: "service", secondaryCategoryKeys: ["service_logistics"] }
    // Step 1 (main check): effectiveMain = "store_hardware_tools" incompatible with "service"
    expect(() =>
      validateCategoryKeyForDirectoryType("service", "store_hardware_tools"),
    ).toThrow(/not valid/);
  });

  it("PATCH directoryType + secondaryCategoryKeys: secondary validated against existing mainCategoryKey", () => {
    // Existing: { directoryType: "store", mainCategoryKey: "service_transport" }
    // (edge: already changed to compatible, mainKey = "service_transport")
    // PATCH: { directoryType: "service", secondaryCategoryKeys: ["service_transport"] }
    // secondary overlaps effective mainKey → reject
    expect(() =>
      asPartnerSecondaryCategoryKeys(
        ["service_transport"],
        "service",
        "service_transport", // effective main = existing.main_category_key
      ),
    ).toThrow(/must not include mainCategoryKey/);
  });

  // ── PATCH directoryType + mainCategoryKey + secondaryCategoryKeys ──────────

  it("PATCH all three fields all compatible: passes", () => {
    // No DB fetch needed — all values in payload
    expect(() =>
      validateCategoryKeyForDirectoryType("service", "service_transport"),
    ).not.toThrow();
    expect(() =>
      asPartnerSecondaryCategoryKeys(
        ["service_logistics", "service_consulting"],
        "service",
        "service_transport",
      ),
    ).not.toThrow();
  });

  it("PATCH all three fields: rejects secondary equal to new mainCategoryKey", () => {
    expect(() =>
      asPartnerSecondaryCategoryKeys(
        ["service_transport"],
        "service",
        "service_transport",
      ),
    ).toThrow(/must not include mainCategoryKey/);
  });

  // ── PATCH mainCategoryKey only ─────────────────────────────────────────────

  it("PATCH mainCategoryKey only: validates against existing directoryType", () => {
    // Existing: { directoryType: "store" }
    // PATCH: { mainCategoryKey: "service_logistics" }
    // effectiveDir = "store" (from DB) → "service_logistics" is incompatible
    expect(() =>
      validateCategoryKeyForDirectoryType("store", "service_logistics"),
    ).toThrow(/not valid/);
  });

  it("PATCH mainCategoryKey only: accepts compatible key for existing directoryType", () => {
    expect(() =>
      validateCategoryKeyForDirectoryType("store", "store_electrical"),
    ).not.toThrow();
  });

  // ── PATCH secondaryCategoryKeys only ──────────────────────────────────────

  it("PATCH secondaryCategoryKeys only: rejects key incompatible with existing directoryType", () => {
    // effectiveDir = existing "store"
    expect(() =>
      asPartnerSecondaryCategoryKeys(["service_logistics"], "store", null),
    ).toThrow(/not valid/);
  });

  it("PATCH secondaryCategoryKeys only: rejects key that equals existing mainCategoryKey", () => {
    expect(() =>
      asPartnerSecondaryCategoryKeys(
        ["store_hardware_tools"],
        "store",
        "store_hardware_tools",
      ),
    ).toThrow(/must not include mainCategoryKey/);
  });

  it("PATCH secondaryCategoryKeys only: accepts valid keys for existing context", () => {
    expect(() =>
      asPartnerSecondaryCategoryKeys(
        ["store_plumbing", "store_electrical"],
        "store",
        "store_hardware_tools",
      ),
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2D.4 — Public search/filter helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("sanitisePublicCategoryParam", () => {
  it("returns valid lowercase category key unchanged", () => {
    expect(sanitisePublicCategoryParam("store_hardware_tools")).toBe(
      "store_hardware_tools",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(sanitisePublicCategoryParam("  service_logistics  ")).toBe(
      "service_logistics",
    );
  });

  it("returns null for empty string", () => {
    expect(sanitisePublicCategoryParam("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(sanitisePublicCategoryParam("   ")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(sanitisePublicCategoryParam(42)).toBeNull();
    expect(sanitisePublicCategoryParam(null)).toBeNull();
    expect(sanitisePublicCategoryParam(undefined)).toBeNull();
  });

  it("returns null for keys with uppercase letters", () => {
    expect(sanitisePublicCategoryParam("Store_Hardware")).toBeNull();
  });

  it("returns null for keys with PostgREST-dangerous chars (comma, brace, dot)", () => {
    expect(sanitisePublicCategoryParam("store,other")).toBeNull();
    expect(sanitisePublicCategoryParam("store{x}")).toBeNull();
    expect(sanitisePublicCategoryParam("store.other")).toBeNull();
  });

  it("returns null for keys exceeding 64 chars", () => {
    expect(sanitisePublicCategoryParam("a".repeat(65))).toBeNull();
  });

  it("accepts keys exactly 64 chars", () => {
    const key = "a".repeat(64);
    expect(sanitisePublicCategoryParam(key)).toBe(key);
  });
});

describe("sanitisePublicSearchQuery", () => {
  it("returns a valid query trimmed", () => {
    expect(sanitisePublicSearchQuery("  hardware  ")).toBe("hardware");
  });

  it("strips commas (PostgREST or-filter delimiter)", () => {
    expect(sanitisePublicSearchQuery("a,b")).toBe("ab");
  });

  it("strips curly braces (PostgREST array literal chars)", () => {
    expect(sanitisePublicSearchQuery("{evil}")).toBe("evil");
  });

  it("strips parentheses and dots", () => {
    expect(sanitisePublicSearchQuery("(foo).bar")).toBe("foobar");
  });

  it("preserves Thai characters", () => {
    expect(sanitisePublicSearchQuery("ร้านวัสดุ")).toBe("ร้านวัสดุ");
  });

  it("preserves underscores and hyphens (safe in ilike pattern)", () => {
    expect(sanitisePublicSearchQuery("some_term")).toBe("some_term");
  });

  it("returns null for empty string", () => {
    expect(sanitisePublicSearchQuery("")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(sanitisePublicSearchQuery(null)).toBeNull();
    expect(sanitisePublicSearchQuery(undefined)).toBeNull();
  });

  it("returns null for input exceeding 100 chars", () => {
    expect(sanitisePublicSearchQuery("a".repeat(101))).toBeNull();
  });

  it("returns null when all chars are stripped (only PostgREST chars)", () => {
    expect(sanitisePublicSearchQuery(",{}().,")).toBeNull();
  });
});

describe("buildPublicCategoryOrFilter", () => {
  it("produces correct PostgREST or-filter string for a store category", () => {
    expect(buildPublicCategoryOrFilter("store_hardware_tools")).toBe(
      "main_category_key.eq.store_hardware_tools,secondary_category_keys.cs.{store_hardware_tools}",
    );
  });

  it("produces correct filter for service category", () => {
    expect(buildPublicCategoryOrFilter("service_logistics")).toBe(
      "main_category_key.eq.service_logistics,secondary_category_keys.cs.{service_logistics}",
    );
  });
});

describe("buildPublicTextSearchOrFilter", () => {
  it("produces ilike conditions for name_th, name_en, tagline_th and cs for search_keywords", () => {
    const filter = buildPublicTextSearchOrFilter("hardware");
    expect(filter).toBe(
      "name_th.ilike.%hardware%,name_en.ilike.%hardware%,tagline_th.ilike.%hardware%,search_keywords.cs.{hardware}",
    );
  });

  it("escapes SQL LIKE wildcard % in ilike clauses", () => {
    const filter = buildPublicTextSearchOrFilter("100%");
    expect(filter).toContain("name_th.ilike.%100\\%%");
    expect(filter).toContain("name_en.ilike.%100\\%%");
    expect(filter).toContain("tagline_th.ilike.%100\\%%");
    // cs filter uses the original sanitised value (no ilike escaping needed)
    expect(filter).toContain("search_keywords.cs.{100%}");
  });

  it("escapes SQL LIKE wildcard _ in ilike clauses", () => {
    const filter = buildPublicTextSearchOrFilter("some_term");
    expect(filter).toContain("name_th.ilike.%some\\_term%");
    expect(filter).toContain("name_en.ilike.%some\\_term%");
    expect(filter).toContain("tagline_th.ilike.%some\\_term%");
    expect(filter).toContain("search_keywords.cs.{some_term}");
  });

  it("includes all four conditions joined by commas", () => {
    const filter = buildPublicTextSearchOrFilter("test");
    const parts = filter.split(",");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toMatch(/^name_th\.ilike\./);
    expect(parts[1]).toMatch(/^name_en\.ilike\./);
    expect(parts[2]).toMatch(/^tagline_th\.ilike\./);
    expect(parts[3]).toMatch(/^search_keywords\.cs\./);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2D.4 — Public list endpoint source-level checks
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/partners — Phase 1C-2D.4 search/filter source checks", () => {
  const src = read("server/api/partners/index.get.ts");

  it("uses sanitisePublicCategoryParam for the category param", () => {
    expect(src).toContain("sanitisePublicCategoryParam");
  });

  it("uses sanitisePublicSearchQuery for the q param", () => {
    expect(src).toContain("sanitisePublicSearchQuery");
  });

  it("uses buildPublicCategoryOrFilter via .or() instead of plain .eq()", () => {
    expect(src).toContain("buildPublicCategoryOrFilter");
    expect(src).not.toContain('.eq("main_category_key"');
  });

  it("uses buildPublicTextSearchOrFilter for q text search", () => {
    expect(src).toContain("buildPublicTextSearchOrFilter");
  });

  it("still enforces is_public = true gate", () => {
    expect(src).toContain('.eq("is_public", true)');
  });

  it("still uses PUBLIC_PARTNER_LIST_SELECT (no private fields)", () => {
    expect(src).toContain("PUBLIC_PARTNER_LIST_SELECT");
  });

  it("uses service-role client (allows server-side search_keywords filtering)", () => {
    expect(src).toContain("serverSupabaseServiceRole");
  });

  it("search_keywords is NOT in PUBLIC_PARTNER_LIST_SELECT (not exposed in response)", () => {
    expect(PUBLIC_PARTNER_LIST_SELECT).not.toContain("search_keywords");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2E.2 — SELECT strings: thumbnail_image_url + cover_image_url
// ─────────────────────────────────────────────────────────────────────────────
describe("SELECT strings — thumbnail_image_url + cover_image_url coverage", () => {
  it("ADMIN_PARTNER_LIST_SELECT includes thumbnail_image_url", () => {
    expect(ADMIN_PARTNER_LIST_SELECT).toContain("thumbnail_image_url");
  });

  it("ADMIN_PARTNER_LIST_SELECT includes cover_image_url", () => {
    expect(ADMIN_PARTNER_LIST_SELECT).toContain("cover_image_url");
  });

  it("ADMIN_PARTNER_DETAIL_SELECT includes thumbnail_image_url", () => {
    expect(ADMIN_PARTNER_DETAIL_SELECT).toContain("thumbnail_image_url");
  });

  it("ADMIN_PARTNER_DETAIL_SELECT includes cover_image_url", () => {
    expect(ADMIN_PARTNER_DETAIL_SELECT).toContain("cover_image_url");
  });

  it("PUBLIC_PARTNER_LIST_SELECT includes thumbnail_image_url", () => {
    expect(PUBLIC_PARTNER_LIST_SELECT).toContain("thumbnail_image_url");
  });

  it("PUBLIC_PARTNER_LIST_SELECT includes cover_image_url", () => {
    expect(PUBLIC_PARTNER_LIST_SELECT).toContain("cover_image_url");
  });

  it("PUBLIC_PARTNER_DETAIL_SELECT includes thumbnail_image_url", () => {
    expect(PUBLIC_PARTNER_DETAIL_SELECT).toContain("thumbnail_image_url");
  });

  it("PUBLIC_PARTNER_DETAIL_SELECT includes cover_image_url", () => {
    expect(PUBLIC_PARTNER_DETAIL_SELECT).toContain("cover_image_url");
  });

  it("PUBLIC_PARTNER_LIST_SELECT still excludes all private fields", () => {
    for (const f of [
      "kyc_documents",
      "verified_notes",
      "internal_notes",
      "search_keywords",
    ]) {
      expect(PUBLIC_PARTNER_LIST_SELECT).not.toContain(f);
    }
  });

  it("PUBLIC_PARTNER_DETAIL_SELECT still excludes all private fields", () => {
    for (const f of [
      "kyc_documents",
      "verified_notes",
      "internal_notes",
      "search_keywords",
    ]) {
      expect(PUBLIC_PARTNER_DETAIL_SELECT).not.toContain(f);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2E.2 — mapAdminPartnerListItem: thumbnailImageUrl + coverImageUrl
// ─────────────────────────────────────────────────────────────────────────────
describe("mapAdminPartnerListItem — thumbnailImageUrl + coverImageUrl", () => {
  const baseRow = {
    id: "uuid-media-list-1",
    slug: "media-list-test",
    directory_type: "store",
    entity_type: "organization",
    name_th: "ร้านทดสอบมีเดีย",
    name_en: null,
    tagline_th: null,
    main_image_url: null,
    main_category_key: null,
    secondary_category_keys: [],
    service_areas: [],
    business_hours_preset_key: null,
    is_verified: false,
    is_public: false,
    is_featured: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("maps thumbnail_image_url to thumbnailImageUrl", () => {
    const row = {
      ...baseRow,
      thumbnail_image_url: "https://cdn.example.com/thumb.webp",
      cover_image_url: null,
    };
    expect(mapAdminPartnerListItem(row).thumbnailImageUrl).toBe(
      "https://cdn.example.com/thumb.webp",
    );
  });

  it("maps cover_image_url to coverImageUrl", () => {
    const row = {
      ...baseRow,
      thumbnail_image_url: null,
      cover_image_url: "https://cdn.example.com/cover.webp",
    };
    expect(mapAdminPartnerListItem(row).coverImageUrl).toBe(
      "https://cdn.example.com/cover.webp",
    );
  });

  it("returns null thumbnailImageUrl when absent from row", () => {
    expect(mapAdminPartnerListItem(baseRow).thumbnailImageUrl).toBeNull();
  });

  it("returns null coverImageUrl when absent from row", () => {
    expect(mapAdminPartnerListItem(baseRow).coverImageUrl).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2E.2 — mapPublicPartnerCard: thumbnailImageUrl + coverImageUrl
// ─────────────────────────────────────────────────────────────────────────────
describe("mapPublicPartnerCard — thumbnailImageUrl + coverImageUrl", () => {
  const baseRow = {
    id: "uuid-media-pub-1",
    slug: "media-pub-card-test",
    directory_type: "store",
    entity_type: "organization",
    name_th: "ร้านการ์ดสาธารณะมีเดีย",
    name_en: null,
    tagline_th: null,
    tagline_en: null,
    main_image_url: null,
    main_category_key: null,
    secondary_category_keys: [],
    service_areas: [],
    business_hours_preset_key: null,
    is_verified: false,
    verified_at: null,
    is_featured: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("maps thumbnail_image_url to thumbnailImageUrl", () => {
    const row = {
      ...baseRow,
      thumbnail_image_url: "https://cdn.example.com/thumb.webp",
      cover_image_url: null,
    };
    expect(mapPublicPartnerCard(row).thumbnailImageUrl).toBe(
      "https://cdn.example.com/thumb.webp",
    );
  });

  it("maps cover_image_url to coverImageUrl", () => {
    const row = {
      ...baseRow,
      thumbnail_image_url: null,
      cover_image_url: "https://cdn.example.com/cover.webp",
    };
    expect(mapPublicPartnerCard(row).coverImageUrl).toBe(
      "https://cdn.example.com/cover.webp",
    );
  });

  it("returns null when both absent", () => {
    expect(mapPublicPartnerCard(baseRow).thumbnailImageUrl).toBeNull();
    expect(mapPublicPartnerCard(baseRow).coverImageUrl).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2E.2 — mapPublicPartnerDetail: thumbnailImageUrl + coverImageUrl
// ─────────────────────────────────────────────────────────────────────────────
describe("mapPublicPartnerDetail — thumbnailImageUrl + coverImageUrl (inherited)", () => {
  const baseRow = {
    id: "uuid-media-pub-detail-1",
    slug: "media-pub-detail-test",
    directory_type: "service",
    entity_type: "individual",
    name_th: "บริการทดสอบมีเดีย",
    name_en: null,
    tagline_th: null,
    tagline_en: null,
    description_th: null,
    description_en: null,
    main_image_url: null,
    main_category_key: null,
    secondary_category_keys: [],
    service_areas: [],
    contact_phone: null,
    contact_email: null,
    line_id: null,
    line_url: null,
    maps_url: null,
    business_hours_text: null,
    business_hours_preset_key: null,
    business_hours_timezone: "Asia/Bangkok",
    is_verified: false,
    verified_at: null,
    is_featured: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("includes thumbnailImageUrl from inherited mapPublicPartnerCard", () => {
    const row = {
      ...baseRow,
      thumbnail_image_url: "https://cdn.example.com/thumb.webp",
      cover_image_url: null,
    };
    expect(mapPublicPartnerDetail(row).thumbnailImageUrl).toBe(
      "https://cdn.example.com/thumb.webp",
    );
  });

  it("includes coverImageUrl from inherited mapPublicPartnerCard", () => {
    const row = {
      ...baseRow,
      thumbnail_image_url: null,
      cover_image_url: "https://cdn.example.com/cover.webp",
    };
    expect(mapPublicPartnerDetail(row).coverImageUrl).toBe(
      "https://cdn.example.com/cover.webp",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2E.2 — mapAdminPartnerDetail: thumbnailImageUrl + coverImageUrl
// ─────────────────────────────────────────────────────────────────────────────
describe("mapAdminPartnerDetail — thumbnailImageUrl + coverImageUrl (inherited)", () => {
  const baseRow = {
    id: "uuid-media-admin-detail-1",
    slug: "media-admin-detail-test",
    directory_type: "store",
    entity_type: "organization",
    name_th: "ร้านแอดมินมีเดีย",
    name_en: null,
    tagline_th: null,
    tagline_en: null,
    description_th: null,
    description_en: null,
    main_image_url: null,
    main_category_key: null,
    secondary_category_keys: [],
    search_keywords: [],
    service_areas: [],
    contact_phone: null,
    contact_email: null,
    line_id: null,
    line_url: null,
    maps_url: null,
    business_hours_text: null,
    business_hours_preset_key: null,
    business_hours_timezone: "Asia/Bangkok",
    is_verified: false,
    verified_at: null,
    is_public: false,
    is_featured: false,
    sort_order: 0,
    kyc_documents: {},
    verified_notes: null,
    internal_notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("includes thumbnailImageUrl from inherited mapAdminPartnerListItem", () => {
    const row = {
      ...baseRow,
      thumbnail_image_url: "https://cdn.example.com/admin-thumb.webp",
      cover_image_url: null,
    };
    expect(mapAdminPartnerDetail(row).thumbnailImageUrl).toBe(
      "https://cdn.example.com/admin-thumb.webp",
    );
  });

  it("includes coverImageUrl from inherited mapAdminPartnerListItem", () => {
    const row = {
      ...baseRow,
      thumbnail_image_url: null,
      cover_image_url: "https://cdn.example.com/admin-cover.webp",
    };
    expect(mapAdminPartnerDetail(row).coverImageUrl).toBe(
      "https://cdn.example.com/admin-cover.webp",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2E.2 — buildPartnerCreatePayload: thumbnailImageUrl + coverImageUrl
// ─────────────────────────────────────────────────────────────────────────────
describe("buildPartnerCreatePayload — thumbnailImageUrl + coverImageUrl", () => {
  const base = {
    slug: "media-create-test",
    directoryType: "store",
    nameTh: "ร้านทดสอบอัปโหลด",
  };

  it("maps thumbnailImageUrl → thumbnail_image_url", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      thumbnailImageUrl: "https://cdn.example.com/thumb.webp",
    });
    expect(p.thumbnail_image_url).toBe("https://cdn.example.com/thumb.webp");
  });

  it("maps coverImageUrl → cover_image_url", () => {
    const p = buildPartnerCreatePayload({
      ...base,
      coverImageUrl: "https://cdn.example.com/cover.webp",
    });
    expect(p.cover_image_url).toBe("https://cdn.example.com/cover.webp");
  });

  it("thumbnail_image_url defaults to null when not supplied", () => {
    const p = buildPartnerCreatePayload(base);
    expect(p.thumbnail_image_url).toBeNull();
  });

  it("cover_image_url defaults to null when not supplied", () => {
    const p = buildPartnerCreatePayload(base);
    expect(p.cover_image_url).toBeNull();
  });

  it("thumbnail_image_url is null when explicitly passed null", () => {
    const p = buildPartnerCreatePayload({ ...base, thumbnailImageUrl: null });
    expect(p.thumbnail_image_url).toBeNull();
  });

  it("cover_image_url is null when explicitly passed null", () => {
    const p = buildPartnerCreatePayload({ ...base, coverImageUrl: null });
    expect(p.cover_image_url).toBeNull();
  });

  it("thumbnail_image_url is null for empty string (asOptionalString convention)", () => {
    const p = buildPartnerCreatePayload({ ...base, thumbnailImageUrl: "" });
    expect(p.thumbnail_image_url).toBeNull();
  });

  it("cover_image_url is null for empty string (asOptionalString convention)", () => {
    const p = buildPartnerCreatePayload({ ...base, coverImageUrl: "" });
    expect(p.cover_image_url).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1C-2E.2 — buildPartnerUpdatePayload: thumbnailImageUrl + coverImageUrl
// ─────────────────────────────────────────────────────────────────────────────
describe("buildPartnerUpdatePayload — thumbnailImageUrl + coverImageUrl patching", () => {
  it("patches thumbnail_image_url when thumbnailImageUrl present", () => {
    const p = buildPartnerUpdatePayload({
      thumbnailImageUrl: "https://cdn.example.com/thumb.webp",
    });
    expect(p.thumbnail_image_url).toBe("https://cdn.example.com/thumb.webp");
  });

  it("patches cover_image_url when coverImageUrl present", () => {
    const p = buildPartnerUpdatePayload({
      coverImageUrl: "https://cdn.example.com/cover.webp",
    });
    expect(p.cover_image_url).toBe("https://cdn.example.com/cover.webp");
  });

  it("sets thumbnail_image_url = null when thumbnailImageUrl is null (clear)", () => {
    const p = buildPartnerUpdatePayload({ thumbnailImageUrl: null });
    expect(p.thumbnail_image_url).toBeNull();
  });

  it("sets cover_image_url = null when coverImageUrl is null (clear)", () => {
    const p = buildPartnerUpdatePayload({ coverImageUrl: null });
    expect(p.cover_image_url).toBeNull();
  });

  it("omits thumbnail_image_url when thumbnailImageUrl absent from body", () => {
    const p = buildPartnerUpdatePayload({ nameTh: "ชื่อใหม่" });
    expect("thumbnail_image_url" in p).toBe(false);
  });

  it("omits cover_image_url when coverImageUrl absent from body", () => {
    const p = buildPartnerUpdatePayload({ nameTh: "ชื่อใหม่" });
    expect("cover_image_url" in p).toBe(false);
  });

  it("sets thumbnail_image_url = null for empty string (asOptionalString convention)", () => {
    const p = buildPartnerUpdatePayload({ thumbnailImageUrl: "" });
    expect(p.thumbnail_image_url).toBeNull();
  });

  it("sets cover_image_url = null for empty string (asOptionalString convention)", () => {
    const p = buildPartnerUpdatePayload({ coverImageUrl: "" });
    expect(p.cover_image_url).toBeNull();
  });
});
