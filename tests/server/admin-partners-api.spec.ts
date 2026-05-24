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
  validateCategoryKeyForDirectoryType,
  buildPartnerCreatePayload,
  buildPartnerUpdatePayload,
  ADMIN_PARTNER_LIST_SELECT,
  PUBLIC_PARTNER_LIST_SELECT,
  PUBLIC_PARTNER_DETAIL_SELECT,
  ADMIN_PARTNER_DETAIL_SELECT,
  mapAdminPartnerDetail,
  mapPublicPartnerCard,
  mapPublicPartnerDetail,
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
