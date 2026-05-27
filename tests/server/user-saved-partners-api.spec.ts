/**
 * Tests: Phase 1C-2H.2B — Saved Partners API Endpoints
 *
 * Covers:
 *  1.  Utility unit tests — requireSavedPartnerId, mapSavedPartnerIds
 *  2.  GET /api/user/saved-partners/ids — source checks
 *  3.  GET /api/user/saved-partners (full cards) — source checks
 *  4.  POST /api/user/saved-partners (toggle) — source checks
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  requireSavedPartnerId,
  mapSavedPartnerIds,
} from "../../server/utils/user-saved-partners";
import { PUBLIC_PARTNER_LIST_SELECT } from "../../server/utils/admin-partners";

const read = (path: string) => readFileSync(path, "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// 1. Utility unit tests
// ─────────────────────────────────────────────────────────────────────────────
describe("requireSavedPartnerId", () => {
  it("accepts a valid UUID-like string", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(requireSavedPartnerId(id)).toBe(id);
  });

  it("trims surrounding whitespace", () => {
    expect(requireSavedPartnerId("  partner-id  ")).toBe("partner-id");
  });

  it("rejects non-string values", () => {
    expect(() => requireSavedPartnerId(null)).toThrow(/required/i);
    expect(() => requireSavedPartnerId(42)).toThrow(/required/i);
    expect(() => requireSavedPartnerId(undefined)).toThrow(/required/i);
    expect(() => requireSavedPartnerId({})).toThrow(/required/i);
  });

  it("rejects empty or whitespace-only strings", () => {
    expect(() => requireSavedPartnerId("")).toThrow(/invalid|required/i);
    expect(() => requireSavedPartnerId("   ")).toThrow(/invalid|required/i);
  });

  it("rejects strings over 128 characters", () => {
    expect(() => requireSavedPartnerId("x".repeat(129))).toThrow(/invalid/i);
  });

  it("accepts a 128-character string", () => {
    const id = "a".repeat(128);
    expect(requireSavedPartnerId(id)).toBe(id);
  });
});

describe("mapSavedPartnerIds", () => {
  it("maps rows to partner ID strings", () => {
    expect(
      mapSavedPartnerIds([{ partner_id: "id-1" }, { partner_id: "id-2" }]),
    ).toEqual(["id-1", "id-2"]);
  });

  it("filters out non-string and empty partner_id values", () => {
    expect(
      mapSavedPartnerIds([
        { partner_id: "id-1" },
        { partner_id: null },
        { partner_id: undefined },
        { partner_id: 42 },
        { partner_id: "" },
      ]),
    ).toEqual(["id-1"]);
  });

  it("returns empty array for null input", () => {
    expect(mapSavedPartnerIds(null)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(mapSavedPartnerIds(undefined)).toEqual([]);
  });

  it("returns empty array for empty rows array", () => {
    expect(mapSavedPartnerIds([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/user/saved-partners/ids — source checks
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/user/saved-partners/ids — source checks", () => {
  const src = read("server/api/user/saved-partners/ids.get.ts");

  it("file exists and is non-empty", () => {
    expect(src.length).toBeGreaterThan(0);
  });

  it("uses serverSupabaseUser for authentication", () => {
    expect(src).toContain("serverSupabaseUser");
  });

  it("uses serverSupabaseServiceRole for DB access", () => {
    expect(src).toContain("serverSupabaseServiceRole");
  });

  it("uses getAuthUserId to extract user id from session", () => {
    expect(src).toContain("getAuthUserId");
  });

  it("returns 401 when user is not authenticated", () => {
    expect(src).toContain("statusCode: 401");
  });

  it("queries user_saved_partners table", () => {
    expect(src).toContain('from("user_saved_partners")');
  });

  it("filters by user_id from session (not from request body)", () => {
    expect(src).toContain('.eq("user_id", userId)');
  });

  it("does not read userId from request body", () => {
    expect(src).not.toContain("body.userId");
    expect(src).not.toContain("body?.userId");
  });

  it("returns partnerIds in response", () => {
    expect(src).toContain("partnerIds");
  });

  it("uses mapSavedPartnerIds to map rows", () => {
    expect(src).toContain("mapSavedPartnerIds");
  });

  it("imports from user-saved-partners utility", () => {
    expect(src).toContain("user-saved-partners");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /api/user/saved-partners (full cards) — source checks
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/user/saved-partners (full cards) — source checks", () => {
  const src = read("server/api/user/saved-partners/index.get.ts");

  it("file exists and is non-empty", () => {
    expect(src.length).toBeGreaterThan(0);
  });

  it("uses serverSupabaseUser for authentication", () => {
    expect(src).toContain("serverSupabaseUser");
  });

  it("uses serverSupabaseServiceRole for DB access", () => {
    expect(src).toContain("serverSupabaseServiceRole");
  });

  it("uses getAuthUserId to extract user id from session", () => {
    expect(src).toContain("getAuthUserId");
  });

  it("returns 401 when user is not authenticated", () => {
    expect(src).toContain("statusCode: 401");
  });

  it("queries user_saved_partners to get saved IDs", () => {
    expect(src).toContain('from("user_saved_partners")');
  });

  it("filters user_saved_partners by user_id from session", () => {
    expect(src).toContain('.eq("user_id", userId)');
  });

  it("does not read userId from request body", () => {
    expect(src).not.toContain("body.userId");
    expect(src).not.toContain("body?.userId");
  });

  it("uses PUBLIC_PARTNER_LIST_SELECT (no private fields)", () => {
    expect(src).toContain("PUBLIC_PARTNER_LIST_SELECT");
  });

  it("uses mapPublicPartnerCard to map rows", () => {
    expect(src).toContain("mapPublicPartnerCard");
  });

  it("enforces is_public = true on partner_profiles query", () => {
    expect(src).toContain('.eq("is_public", true)');
  });

  it("does not expose search_keywords in source", () => {
    expect(src).not.toContain("search_keywords");
  });

  it("does not expose internal_notes in source", () => {
    expect(src).not.toContain("internal_notes");
  });

  it("does not expose kyc_documents in source", () => {
    expect(src).not.toContain("kyc_documents");
  });

  it("does not expose verified_notes in source", () => {
    expect(src).not.toContain("verified_notes");
  });

  it("returns items array in response", () => {
    expect(src).toContain("items");
  });

  it("queries partner_profiles for full card data", () => {
    expect(src).toContain('from("partner_profiles")');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /api/user/saved-partners (toggle) — source checks
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/user/saved-partners (toggle) — source checks", () => {
  const src = read("server/api/user/saved-partners/index.post.ts");

  it("file exists and is non-empty", () => {
    expect(src.length).toBeGreaterThan(0);
  });

  it("uses serverSupabaseUser for authentication", () => {
    expect(src).toContain("serverSupabaseUser");
  });

  it("uses serverSupabaseServiceRole for DB access", () => {
    expect(src).toContain("serverSupabaseServiceRole");
  });

  it("uses getAuthUserId to extract user id from session", () => {
    expect(src).toContain("getAuthUserId");
  });

  it("returns 401 when user is not authenticated", () => {
    expect(src).toContain("statusCode: 401");
  });

  it("reads partnerId from request body", () => {
    expect(src).toContain("body.partnerId");
  });

  it("does not read userId from request body", () => {
    expect(src).not.toContain("body.userId");
    expect(src).not.toContain("body?.userId");
  });

  it("validates partnerId using requireSavedPartnerId", () => {
    expect(src).toContain("requireSavedPartnerId");
  });

  it("verifies partner exists and is_public = true", () => {
    expect(src).toContain("is_public");
  });

  it("returns 404 for non-public or missing partners", () => {
    expect(src).toContain("statusCode: 404");
  });

  it("contains insert logic for saving a partner", () => {
    expect(src).toContain(".insert(");
  });

  it("contains delete logic for unsaving a partner", () => {
    expect(src).toContain(".delete()");
  });

  it("toggle is based on whether row already exists", () => {
    expect(src).toContain("!existing");
  });

  it("insert and delete both filter by user_id from session", () => {
    const deleteBlock = src.slice(src.indexOf(".delete()"));
    expect(deleteBlock).toContain('.eq("user_id", userId)');
  });

  it("returns saved boolean in response", () => {
    expect(src).toContain("saved");
  });

  it("returns partnerId in response", () => {
    expect(src).toContain("partnerId");
  });

  it("returns updated partnerIds list in response", () => {
    expect(src).toContain("partnerIds");
  });

  it("fetches updated list after toggle using mapSavedPartnerIds", () => {
    expect(src).toContain("mapSavedPartnerIds");
  });

  it("final list query filters by user_id from session", () => {
    // count occurrences of .eq("user_id", userId) — should appear 3 times
    const matches = src.match(/\.eq\("user_id",\s*userId\)/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cross-cutting: private-field exposure check
// ─────────────────────────────────────────────────────────────────────────────
describe("Saved partners endpoints — no private field exposure", () => {
  const PRIVATE = [
    "search_keywords",
    "internal_notes",
    "kyc_documents",
    "verified_notes",
  ];

  for (const field of PRIVATE) {
    it(`ids.get.ts does not reference ${field}`, () => {
      expect(read("server/api/user/saved-partners/ids.get.ts")).not.toContain(
        field,
      );
    });

    it(`index.get.ts does not reference ${field}`, () => {
      expect(read("server/api/user/saved-partners/index.get.ts")).not.toContain(
        field,
      );
    });

    it(`index.post.ts does not reference ${field}`, () => {
      expect(
        read("server/api/user/saved-partners/index.post.ts"),
      ).not.toContain(field);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PUBLIC_PARTNER_LIST_SELECT confirms no private fields
// ─────────────────────────────────────────────────────────────────────────────
describe("PUBLIC_PARTNER_LIST_SELECT used by full-cards endpoint excludes private fields", () => {
  const PRIVATE = [
    "search_keywords",
    "internal_notes",
    "kyc_documents",
    "verified_notes",
  ];

  for (const field of PRIVATE) {
    it(`PUBLIC_PARTNER_LIST_SELECT does not include ${field}`, () => {
      expect(PUBLIC_PARTNER_LIST_SELECT).not.toContain(field);
    });
  }
});
