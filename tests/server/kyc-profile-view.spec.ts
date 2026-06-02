/**
 * Tests: server/utils/kyc-profile-view.ts
 *
 * The shared KYC profile PII whitelist boundary used by lookup + create (and later
 * attach/verify). Verifies the mapper returns exactly the safe whitelist and strips
 * every sensitive column even when present on the input row.
 *
 * Covers:
 *  - exact whitelist keys (11 fields) and that id is included
 *  - all expected fields are mapped from snake_case DB columns
 *  - identity_hash, raw identity, user_id, storage paths, document data, and
 *    rejection/revocation/internal notes are stripped
 *  - hasUserId true when user_id present, false when null
 *  - KYC_PROFILE_SAFE_SELECT excludes sensitive columns
 */
import { describe, expect, it } from "vitest";
import {
  KYC_PROFILE_SAFE_SELECT,
  toSafeKycProfile,
} from "../../server/utils/kyc-profile-view";

const WHITELIST_KEYS = [
  "id",
  "customerType",
  "identityType",
  "identityLast4",
  "status",
  "validUntil",
  "branchId",
  "createdAt",
  "verifiedAt",
  "verifiedBranchId",
  "hasUserId",
].sort();

// A DB row that ALSO carries sensitive columns the mapper must never surface.
function rawRow(over: Record<string, unknown> = {}) {
  return {
    // safe columns
    id: "kyc-1",
    user_id: null,
    customer_type: "individual",
    identity_type: "national_id",
    identity_last4: "***0123",
    status: "verified",
    valid_until: "2027-01-01T00:00:00.000Z",
    branch_id: "branch-hq",
    created_at: "2026-01-01T00:00:00.000Z",
    verified_at: "2026-01-01T00:00:00.000Z",
    verified_branch_id: "branch-hq",
    // sensitive columns that MUST be stripped
    identity_hash: "SENSITIVE_HASH_MUST_NOT_LEAK",
    raw_identity: "1234567890123",
    storage_path: "kyc-documents/walk-in/abc.png",
    kyc_documents: [{ storage_path: "kyc-documents/walk-in/def.png" }],
    rejection_note: "INTERNAL_REJECTION_NOTE",
    rejection_reason_code: "identity_mismatch",
    revoked_note: "INTERNAL_REVOKE_NOTE",
    revoked_reason_code: "internal_risk_flag",
    verified_by_user_id: "staff-secret-id",
    ...over,
  } as any;
}

describe("toSafeKycProfile — whitelist", () => {
  it("returns exactly the 11 whitelist keys (including id)", () => {
    const out = toSafeKycProfile(rawRow());
    expect(Object.keys(out).sort()).toEqual(WHITELIST_KEYS);
    expect(out).toHaveProperty("id", "kyc-1");
  });

  it("maps every safe field from its snake_case column", () => {
    const out = toSafeKycProfile(rawRow());
    expect(out).toMatchObject({
      id: "kyc-1",
      customerType: "individual",
      identityType: "national_id",
      identityLast4: "***0123",
      status: "verified",
      validUntil: "2027-01-01T00:00:00.000Z",
      branchId: "branch-hq",
      createdAt: "2026-01-01T00:00:00.000Z",
      verifiedAt: "2026-01-01T00:00:00.000Z",
      verifiedBranchId: "branch-hq",
      hasUserId: false,
    });
  });

  it("strips identity_hash even when present on the row", () => {
    const out = toSafeKycProfile(rawRow());
    expect(out).not.toHaveProperty("identity_hash");
    expect(JSON.stringify(out)).not.toContain("SENSITIVE_HASH_MUST_NOT_LEAK");
  });

  it("does not surface a raw identity value", () => {
    const out = toSafeKycProfile(rawRow());
    expect(JSON.stringify(out)).not.toContain("1234567890123");
    expect(out).not.toHaveProperty("raw_identity");
  });

  it("strips user_id and exposes only hasUserId", () => {
    const out = toSafeKycProfile(rawRow({ user_id: "user-9" }));
    expect(out).not.toHaveProperty("user_id");
    expect(out).not.toHaveProperty("userId");
    expect(JSON.stringify(out)).not.toContain("user-9");
    expect(out.hasUserId).toBe(true);
  });

  it("strips storage paths and document data", () => {
    const out = toSafeKycProfile(rawRow());
    expect(out).not.toHaveProperty("storage_path");
    expect(out).not.toHaveProperty("kyc_documents");
    const json = JSON.stringify(out);
    expect(json).not.toContain("kyc-documents/walk-in/abc.png");
    expect(json).not.toContain("kyc-documents/walk-in/def.png");
  });

  it("strips rejection / revocation / internal note fields", () => {
    const out = toSafeKycProfile(rawRow());
    for (const k of [
      "rejection_note",
      "rejection_reason_code",
      "revoked_note",
      "revoked_reason_code",
      "verified_by_user_id",
    ]) {
      expect(out).not.toHaveProperty(k);
    }
    const json = JSON.stringify(out);
    expect(json).not.toContain("INTERNAL_REJECTION_NOTE");
    expect(json).not.toContain("INTERNAL_REVOKE_NOTE");
    expect(json).not.toContain("staff-secret-id");
  });

  it("hasUserId is true when user_id is a non-empty string", () => {
    expect(toSafeKycProfile(rawRow({ user_id: "user-1" })).hasUserId).toBe(true);
  });

  it("hasUserId is false when user_id is null", () => {
    expect(toSafeKycProfile(rawRow({ user_id: null })).hasUserId).toBe(false);
  });

  it("hasUserId is false when user_id is an empty string", () => {
    expect(toSafeKycProfile(rawRow({ user_id: "" })).hasUserId).toBe(false);
  });
});

describe("KYC_PROFILE_SAFE_SELECT — excludes sensitive columns", () => {
  it("does not select identity_hash, storage paths, or notes", () => {
    expect(KYC_PROFILE_SAFE_SELECT).not.toContain("identity_hash");
    expect(KYC_PROFILE_SAFE_SELECT).not.toContain("storage_path");
    expect(KYC_PROFILE_SAFE_SELECT).not.toContain("kyc_documents");
    expect(KYC_PROFILE_SAFE_SELECT).not.toContain("rejection_note");
    expect(KYC_PROFILE_SAFE_SELECT).not.toContain("revoked_note");
  });

  it("includes user_id only for internal hasUserId derivation", () => {
    expect(KYC_PROFILE_SAFE_SELECT).toContain("user_id");
    // The mapper drops it — verified by the hasUserId tests above.
  });
});
