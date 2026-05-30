/**
 * Tests: server/utils/kyc.ts
 *
 * Covers:
 *  - hashIdentity: secret enforcement, determinism, secret sensitivity
 *  - maskLast4: output format
 *  - normalizeKycIdentity: NFKC + type-specific rules, format assertions, no-PII errors
 *  - hashKycIdentity: determinism across equivalent inputs, type namespace isolation
 *  - computeKycReadiness: all status branches + live expiry logic
 *  - canVerifyCompanyCert: 6-month boundary (inclusive/exclusive)
 *  - computeValidUntil: +1 year for individual and company
 *  - hasValidPickupOverride: match vs no match
 *  - resolvePickupKyc: kyc_verified, override, blocked paths
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canVerifyCompanyCert,
  computeKycReadiness,
  computeValidUntil,
  hashIdentity,
  hashKycIdentity,
  hasValidPickupOverride,
  maskLast4,
  normalizeKycIdentity,
  resolvePickupKyc,
} from "../../server/utils/kyc";

// ── Helpers ───────────────────────────────────────────────────────────────────

function futureDate(fromNow = new Date()): string {
  const d = new Date(fromNow);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

function pastDate(fromNow = new Date()): string {
  const d = new Date(fromNow);
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString();
}

// ── 1. hashIdentity ───────────────────────────────────────────────────────────

describe("hashIdentity", () => {
  const ENV_KEY = "KYC_HASH_SECRET";
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = saved;
    }
  });

  it("throws when KYC_HASH_SECRET is not set", () => {
    delete process.env[ENV_KEY];
    expect(() => hashIdentity("1234567890123")).toThrow("KYC_HASH_SECRET");
  });

  it("throws when KYC_HASH_SECRET is empty string", () => {
    process.env[ENV_KEY] = "";
    expect(() => hashIdentity("1234567890123")).toThrow("KYC_HASH_SECRET");
  });

  it("is deterministic — same input + same secret = same hash", () => {
    process.env[ENV_KEY] = "test-secret-abc";
    const h1 = hashIdentity("1234567890123");
    const h2 = hashIdentity("1234567890123");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA256 hex = 64 chars
  });

  it("produces different hash when secret changes", () => {
    process.env[ENV_KEY] = "secret-one";
    const h1 = hashIdentity("1234567890123");
    process.env[ENV_KEY] = "secret-two";
    const h2 = hashIdentity("1234567890123");
    expect(h1).not.toBe(h2);
  });

  it("produces different hash for different inputs with same secret", () => {
    process.env[ENV_KEY] = "test-secret-abc";
    const h1 = hashIdentity("1234567890123");
    const h2 = hashIdentity("9876543210987");
    expect(h1).not.toBe(h2);
  });
});

// ── 2. maskLast4 ──────────────────────────────────────────────────────────────

describe("maskLast4", () => {
  it("returns ***1234 for an input ending in 1234", () => {
    expect(maskLast4("1234567891234")).toBe("***1234");
  });

  it("returns *** + last 4 chars regardless of input length", () => {
    expect(maskLast4("ABCDE6789")).toBe("***6789");
    expect(maskLast4("1234")).toBe("***1234");
  });
});

// ── 3. normalizeKycIdentity ───────────────────────────────────────────────────

describe("normalizeKycIdentity", () => {
  // ── national_id ──────────────────────────────────────────────────────────

  it("national_id with ASCII dashes normalizes to 13 digits", () => {
    // Thai ID card format: 1-2345-67890-12-3
    expect(normalizeKycIdentity("national_id", "1-2345-67890-12-3")).toBe(
      "1234567890123",
    );
  });

  it("national_id with spaces normalizes to 13 digits", () => {
    expect(normalizeKycIdentity("national_id", "1234 5678 9012 3")).toBe(
      "1234567890123",
    );
  });

  it("national_id with full-width digits (NFKC) normalizes to 13 ASCII digits", () => {
    // Full-width: １２３４５６７８９０１２３ (U+FF11..U+FF13)
    const fullWidth =
      "１２３４５６７８９０１２３";
    expect(normalizeKycIdentity("national_id", fullWidth)).toBe(
      "1234567890123",
    );
  });

  it("national_id with en-dash (U+2013) separator normalizes correctly", () => {
    // U+2013 EN DASH is in range U+2010–U+2015, stripped by the regex
    expect(
      normalizeKycIdentity("national_id", "123456789012–3"),
    ).toBe("1234567890123");
  });

  it("national_id with NBSP separator normalizes correctly", () => {
    // NFKC maps U+00A0 (NBSP) → U+0020 (space), then \s removes it
    expect(
      normalizeKycIdentity("national_id", "1234567890 123"),
    ).toBe("1234567890123");
  });

  it("invalid national_id throws when too short", () => {
    expect(() => normalizeKycIdentity("national_id", "12345")).toThrow();
  });

  it("invalid national_id throws when it contains non-digit characters after stripping", () => {
    expect(() =>
      normalizeKycIdentity("national_id", "ABCDEFGHIJKLM"),
    ).toThrow();
  });

  // ── juristic_id ───────────────────────────────────────────────────────────

  it("juristic_id with dashes and spaces normalizes to 13 digits", () => {
    expect(
      normalizeKycIdentity("juristic_id", "0-1055-36016-67-1"),
    ).toBe("0105536016671");
  });

  it("invalid juristic_id throws when too long", () => {
    // 14 digits → too long
    expect(() =>
      normalizeKycIdentity("juristic_id", "12345678901234"),
    ).toThrow();
  });

  // ── passport ──────────────────────────────────────────────────────────────

  it("passport lowercase normalizes to uppercase", () => {
    expect(normalizeKycIdentity("passport", "ab1234567")).toBe("AB1234567");
  });

  it("passport with spaces and hyphens normalizes correctly", () => {
    expect(normalizeKycIdentity("passport", "AB 12-34567")).toBe("AB1234567");
  });

  it("invalid passport throws when it contains special characters", () => {
    expect(() => normalizeKycIdentity("passport", "AB!1234567")).toThrow();
  });

  // ── PII safety ────────────────────────────────────────────────────────────

  it("thrown error message does NOT contain the raw input value (no PII in logs)", () => {
    const sensitiveRaw = "SENSITIVE_INPUT_VALUE_XYZ";
    let caughtMessage = "";
    try {
      normalizeKycIdentity("national_id", sensitiveRaw);
    } catch (err) {
      caughtMessage = (err as Error).message;
    }
    expect(caughtMessage).not.toBe(""); // did throw
    expect(caughtMessage).not.toContain(sensitiveRaw);
    expect(caughtMessage).not.toContain("SENSITIVE_INPUT_VALUE_XYZ");
  });
});

// ── 4. hashKycIdentity ────────────────────────────────────────────────────────

describe("hashKycIdentity", () => {
  const ENV_KEY = "KYC_HASH_SECRET";
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[ENV_KEY];
    process.env[ENV_KEY] = "test-kyc-secret-for-hash-tests";
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = saved;
    }
  });

  it("is deterministic across equivalent formatted inputs of the same type", () => {
    // Dashed and plain formats of the same national_id produce identical hashes
    const withDashes = hashKycIdentity("national_id", "1-2345-67890-12-3");
    const plain = hashKycIdentity("national_id", "1234567890123");
    expect(withDashes).toBe(plain);
  });

  it("produces DIFFERENT hashes for the same 13 digits with different identityType (type namespace)", () => {
    // national_id and juristic_id share the same digit format —
    // the type prefix in the HMAC input prevents collision
    const asNationalId = hashKycIdentity("national_id", "1234567890123");
    const asJuristicId = hashKycIdentity("juristic_id", "1234567890123");
    expect(asNationalId).not.toBe(asJuristicId);
  });

  it("composition guard: equals hashIdentity(`v1:${type}:${normalized}`) for each identity type", () => {
    // Locks the v1 prefix, colon separator, and field ordering.
    // If hashKycIdentity's internal composition drifts, this fails immediately.
    expect(hashKycIdentity("national_id", "1234567890123")).toBe(
      hashIdentity(
        `v1:national_id:${normalizeKycIdentity("national_id", "1234567890123")}`,
      ),
    );
    expect(hashKycIdentity("juristic_id", "0-1055-36016-67-1")).toBe(
      hashIdentity(
        `v1:juristic_id:${normalizeKycIdentity("juristic_id", "0-1055-36016-67-1")}`,
      ),
    );
    expect(hashKycIdentity("passport", "ab1234567")).toBe(
      hashIdentity(
        `v1:passport:${normalizeKycIdentity("passport", "ab1234567")}`,
      ),
    );
  });
});

// ── 5. computeKycReadiness ────────────────────────────────────────────────────

describe("computeKycReadiness", () => {
  const now = new Date(2025, 5, 15); // Jun 15, 2025 (fixed for determinism)

  it("returns ready:true and reason:verified when status is verified and valid_until is in the future", () => {
    const result = computeKycReadiness(
      { status: "verified", valid_until: futureDate(now) },
      now,
    );
    expect(result.ready).toBe(true);
    expect(result.reason).toBe("verified");
  });

  it("returns ready:false and reason:expired when status is verified but valid_until is in the past", () => {
    const result = computeKycReadiness(
      { status: "verified", valid_until: pastDate(now) },
      now,
    );
    expect(result.ready).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("treats verified profile with null valid_until as expired (safe default)", () => {
    const result = computeKycReadiness({ status: "verified", valid_until: null }, now);
    expect(result.ready).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("returns ready:false and reason:pending for pending profile", () => {
    const result = computeKycReadiness({ status: "pending", valid_until: null }, now);
    expect(result.ready).toBe(false);
    expect(result.reason).toBe("pending");
  });

  it("returns ready:false and reason:rejected for rejected profile", () => {
    const result = computeKycReadiness({ status: "rejected", valid_until: null }, now);
    expect(result.ready).toBe(false);
    expect(result.reason).toBe("rejected");
  });

  it("returns ready:false and reason:revoked for revoked profile", () => {
    const result = computeKycReadiness({ status: "revoked", valid_until: null }, now);
    expect(result.ready).toBe(false);
    expect(result.reason).toBe("revoked");
  });

  it("returns ready:false and reason:no_profile when profile is null", () => {
    const result = computeKycReadiness(null, now);
    expect(result.ready).toBe(false);
    expect(result.reason).toBe("no_profile");
  });
});

// ── 4. canVerifyCompanyCert ───────────────────────────────────────────────────

describe("canVerifyCompanyCert", () => {
  // now = Sep 1, 2024 → cutoff = Mar 1, 2024
  const now = new Date(2024, 8, 1); // Sep 1, 2024 (month index 8)

  it("allows a certificate that is exactly 6 months old (boundary is inclusive)", () => {
    const issuedAt = new Date(2024, 2, 1); // Mar 1, 2024 — exactly 6 months
    const result = canVerifyCompanyCert(issuedAt, now);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("blocks a certificate older than 6 months", () => {
    const issuedAt = new Date(2024, 1, 28); // Feb 28, 2024 — older than 6 months
    const result = canVerifyCompanyCert(issuedAt, now);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("cert_older_than_6_months");
  });

  it("allows a certificate issued 1 month ago", () => {
    const issuedAt = new Date(2024, 7, 1); // Aug 1, 2024 — 1 month old
    const result = canVerifyCompanyCert(issuedAt, now);
    expect(result.allowed).toBe(true);
  });
});

// ── 5. computeValidUntil ─────────────────────────────────────────────────────

describe("computeValidUntil", () => {
  const verifiedAt = new Date(2025, 0, 15); // Jan 15, 2025

  it("returns verifiedAt + 1 year for individual", () => {
    const result = computeValidUntil("individual", verifiedAt);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(15);
  });

  it("returns verifiedAt + 1 year for company", () => {
    const result = computeValidUntil("company", verifiedAt);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(15);
  });

  it("does not mutate the input verifiedAt date", () => {
    const original = new Date(2025, 0, 15);
    const originalTime = original.getTime();
    computeValidUntil("individual", original);
    expect(original.getTime()).toBe(originalTime);
  });
});

// ── 6. hasValidPickupOverride ─────────────────────────────────────────────────

describe("hasValidPickupOverride", () => {
  const bookingId = "booking-abc-123";

  it("returns true when an override matches the booking ID", () => {
    const overrides = [
      { booking_id: "other-booking" },
      { booking_id: bookingId },
    ];
    expect(hasValidPickupOverride(overrides, bookingId)).toBe(true);
  });

  it("returns false when overrides list is for a different booking", () => {
    const overrides = [{ booking_id: "other-booking" }];
    expect(hasValidPickupOverride(overrides, bookingId)).toBe(false);
  });

  it("returns false when overrides list is empty", () => {
    expect(hasValidPickupOverride([], bookingId)).toBe(false);
  });
});

// ── 7. resolvePickupKyc ───────────────────────────────────────────────────────

describe("resolvePickupKyc", () => {
  const now = new Date(2025, 5, 15); // Jun 15, 2025
  const bookingId = "booking-xyz-999";

  const verifiedProfile = {
    status: "verified" as const,
    valid_until: futureDate(now),
  };

  const pendingProfile = {
    status: "pending" as const,
    valid_until: null,
  };

  const expiredProfile = {
    status: "verified" as const,
    valid_until: pastDate(now),
  };

  it("allows pickup via kyc_verified when KYC is verified and not expired", () => {
    const result = resolvePickupKyc(verifiedProfile, [], bookingId, now);
    expect(result.canPickup).toBe(true);
    expect(result.via).toBe("kyc_verified");
  });

  it("does not need an override when KYC passes", () => {
    const overrides = [{ booking_id: bookingId }];
    const result = resolvePickupKyc(verifiedProfile, overrides, bookingId, now);
    expect(result.via).toBe("kyc_verified"); // KYC path takes precedence
  });

  it("allows pickup via override when KYC is not ready but a matching override exists", () => {
    const overrides = [{ booking_id: bookingId }];
    const result = resolvePickupKyc(pendingProfile, overrides, bookingId, now);
    expect(result.canPickup).toBe(true);
    expect(result.via).toBe("override");
  });

  it("blocks when KYC is not ready and override is for a different booking", () => {
    const overrides = [{ booking_id: "different-booking" }];
    const result = resolvePickupKyc(pendingProfile, overrides, bookingId, now);
    expect(result.canPickup).toBe(false);
    expect(result.via).toBe("blocked");
    expect(result.reason).toBe("pending");
  });

  it("blocks with reason:expired when KYC was verified but has expired", () => {
    const result = resolvePickupKyc(expiredProfile, [], bookingId, now);
    expect(result.canPickup).toBe(false);
    expect(result.via).toBe("blocked");
    expect(result.reason).toBe("expired");
  });

  it("blocks with reason:no_profile when profile is null and no override", () => {
    const result = resolvePickupKyc(null, [], bookingId, now);
    expect(result.canPickup).toBe(false);
    expect(result.via).toBe("blocked");
    expect(result.reason).toBe("no_profile");
  });
});
