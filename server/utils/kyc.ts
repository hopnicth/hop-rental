/**
 * KYC utility functions for HOPNIC.
 *
 * Covers:
 *  - Identity hashing (HMAC-SHA256) and masking
 *  - KYC readiness computation (live expiry check — never trust stored status alone)
 *  - Company certificate recency check
 *  - KYC validity period computation
 *  - Pickup KYC gate resolution (kyc_verified | override | blocked)
 *  - Identity normalization (NFKC + type-specific rules)
 *  - hashKycIdentity: the ONE entry point for hashing — callers MUST use this,
 *    never call hashIdentity on raw user input directly
 *
 * All functions are pure and testable — no direct DB calls, no Supabase import.
 * DB rows / client are passed as parameters per server/utils/claude.md.
 *
 * Identity storage rule (enforced in callers, not here):
 *   NEVER pass plaintext ID to storage. Hash + last4 only.
 *   identity_last4 MUST be derived from the NORMALIZED value, not the raw input.
 *   These helpers produce hash and last4 — callers decide what to persist.
 */
import { createHmac } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────────────

export type KycStatus =
  | "pending"
  | "verified"
  | "rejected"
  | "expired"
  | "revoked";

export type KycReadinessReason =
  | "verified"
  | "no_profile"
  | "pending"
  | "rejected"
  | "expired"
  | "revoked";

export interface KycReadinessResult {
  ready: boolean;
  reason: KycReadinessReason;
}

export interface KycPickupResolution {
  canPickup: boolean;
  via: "kyc_verified" | "override" | "blocked";
  reason: string;
  /** ID of the override row that authorized pickup when via === "override". Null otherwise. */
  matchedOverrideId: string | null;
}

/** Minimal profile shape required by compute helpers. */
export interface KycProfileInput {
  status: KycStatus;
  /** ISO timestamp string or null. Treated as expired when null. */
  valid_until: string | null;
}

/** Minimal override entry required by the pickup gate. */
export interface KycOverrideEntry {
  /**
   * DB row id. REQUIRED (security-core): every override SELECT MUST include "id"
   * so the pickup audit snapshot can record the exact override row that authorized
   * pickup. Making this required forces a compile-time error if any caller builds
   * an override array without selecting "id" — preventing a silent runtime gap.
   */
  id: string;
  booking_id: string;
}

/** Identity document type — matches kyc_identity_type enum in migration 105. */
export type KycIdentityType = "national_id" | "juristic_id" | "passport";

// ── 1. Identity Hashing ───────────────────────────────────────────────────────

/**
 * Returns a hex HMAC-SHA256 of identityValue using KYC_HASH_SECRET.
 *
 * Throws if KYC_HASH_SECRET is missing or empty — hashing with an empty secret
 * is a silent security failure, so we hard-fail instead.
 *
 * Input is NEVER normalized (no trim, lowercase, or dash removal).
 * Callers must supply the canonical form of the identity string.
 */
export function hashIdentity(identityValue: string): string {
  const secret = process.env.KYC_HASH_SECRET;
  if (!secret) {
    throw new Error(
      "KYC_HASH_SECRET environment variable is required for identity hashing",
    );
  }
  return createHmac("sha256", secret).update(identityValue).digest("hex");
}

/**
 * Returns a masked display string: '***' + last 4 characters of identityValue.
 */
export function maskLast4(identityValue: string): string {
  return "***" + identityValue.slice(-4);
}

// ── 1b. Identity Normalization ────────────────────────────────────────────────

/**
 * Matches all whitespace (including NBSP which NFKC maps to U+0020) and all
 * dash-family characters: SOFT HYPHEN, HYPHEN-MINUS, HYPHEN through HORIZONTAL
 * BAR (U+2010–U+2015), and MINUS SIGN (U+2212).
 */
const DASH_AND_WHITESPACE_RE = /[\s\u00ad\u002d\u2010-\u2015\u2212]/g;

/**
 * Normalizes a raw identity value to its canonical form for hashing and storage.
 *
 * Steps applied in order:
 *  1. Unicode NFKC — folds full-width IME digits/letters and maps NBSP → space.
 *  2. Type-specific transforms (see below).
 *  3. Format assertion — throws on mismatch.
 *
 * national_id / juristic_id:
 *   NFKC → strip all whitespace and dashes → assert /^\d{13}$/
 *
 * passport:
 *   NFKC → toUpperCase (locale-independent) → strip whitespace and dashes
 *         → assert /^[A-Z0-9]+$/
 *
 * CRITICAL: error messages MUST NOT contain the raw or normalized identity
 * value — no PII in logs. Messages include only identityType, reason, and
 * optionally the resulting length.
 */
export function normalizeKycIdentity(
  identityType: KycIdentityType,
  rawValue: string,
): string {
  const nfkc = rawValue.normalize("NFKC");

  if (identityType === "national_id" || identityType === "juristic_id") {
    const stripped = nfkc.replace(DASH_AND_WHITESPACE_RE, "");
    if (!/^\d{13}$/.test(stripped)) {
      throw new Error(
        `Invalid ${identityType}: expected 13 digits after normalization` +
          `, got length ${stripped.length}`,
      );
    }
    return stripped;
  }

  // passport
  const stripped = nfkc.toUpperCase().replace(DASH_AND_WHITESPACE_RE, "");
  if (!/^[A-Z0-9]+$/.test(stripped)) {
    throw new Error(
      `Invalid passport: expected only A-Z and 0-9 after normalization` +
        `, got length ${stripped.length}`,
    );
  }
  return stripped;
}

/**
 * The single authoritative entry point for hashing identity values.
 *
 * ALL KYC intake, search, lookup, and pickup-gate code MUST call this function.
 * Calling hashIdentity on raw user input directly is FORBIDDEN.
 *
 * HMAC input format: `v1:${identityType}:${normalizedValue}`
 * The v1 prefix fixes the version so future format changes are detectable.
 * The type prefix prevents national_id / juristic_id digit collisions.
 */
export function hashKycIdentity(
  identityType: KycIdentityType,
  rawValue: string,
): string {
  const normalized = normalizeKycIdentity(identityType, rawValue);
  return hashIdentity(`v1:${identityType}:${normalized}`);
}

// ── 2. KYC Readiness ──────────────────────────────────────────────────────────

/**
 * Computes live KYC readiness for a profile.
 *
 * Expiry is always evaluated at call time against `now` — never trusts stored
 * status alone (design §3: "Always compute expiry LIVE at read time").
 *
 * A verified profile with null valid_until is treated as expired (safe default).
 */
export function computeKycReadiness(
  profile: KycProfileInput | null,
  now: Date = new Date(),
): KycReadinessResult {
  if (!profile) {
    return { ready: false, reason: "no_profile" };
  }

  if (profile.status === "verified") {
    const validUntil = profile.valid_until
      ? new Date(profile.valid_until)
      : null;
    if (validUntil && validUntil > now) {
      return { ready: true, reason: "verified" };
    }
    return { ready: false, reason: "expired" };
  }

  return { ready: false, reason: profile.status };
}

// ── 3. Company Certificate Recency ────────────────────────────────────────────

/**
 * Returns whether a company certificate is recent enough to proceed with
 * KYC verification (design §6: cert issued within 6 months).
 *
 * Exactly 6 months old is allowed (boundary is inclusive on the allowed side).
 * Blocked only when issuedAt is strictly before the 6-month cutoff.
 */
export function canVerifyCompanyCert(
  issuedAt: Date,
  now: Date = new Date(),
): { allowed: boolean; reason?: "cert_older_than_6_months" } {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 6);
  if (issuedAt < cutoff) {
    return { allowed: false, reason: "cert_older_than_6_months" };
  }
  return { allowed: true };
}

// ── 4. Validity Period ────────────────────────────────────────────────────────

/**
 * Computes valid_until for a newly verified KYC profile (design §7).
 * Both individual and company: verifiedAt + 1 year.
 */
export function computeValidUntil(
  _customerType: "individual" | "company",
  verifiedAt: Date,
): Date {
  const result = new Date(verifiedAt);
  result.setFullYear(result.getFullYear() + 1);
  return result;
}

// ── 5. Override Check ─────────────────────────────────────────────────────────

/**
 * Returns the override row scoped to the given bookingId, or null.
 *
 * SINGLE SOURCE OF TRUTH for pickup-override authorization. Both the boolean
 * `hasValidPickupOverride` and the gate `resolvePickupKyc` resolve override
 * authorization through THIS function, so the readiness (display) gate and the
 * confirm (authoritative) gate can never diverge on which override authorizes a
 * pickup. The match predicate is `booking_id === bookingId` only — override is
 * booking-specific; a record for a different booking does not count.
 */
export function findPickupOverride(
  overrides: KycOverrideEntry[],
  bookingId: string,
): KycOverrideEntry | null {
  return overrides.find((o) => o.booking_id === bookingId) ?? null;
}

/**
 * Returns true if any override record is scoped to the given bookingId.
 * Thin boolean wrapper over `findPickupOverride` — kept for callers that only
 * need a yes/no answer. Delegates to the shared predicate to avoid drift.
 * Override is booking-specific — a record for a different booking does not count.
 */
export function hasValidPickupOverride(
  overrides: KycOverrideEntry[],
  bookingId: string,
): boolean {
  return findPickupOverride(overrides, bookingId) !== null;
}

// ── 6. Pickup KYC Resolution ──────────────────────────────────────────────────

/**
 * Resolves the pickup KYC gate for a specific booking (design §3).
 *
 * Order of precedence:
 *  1. KYC verified and not expired → allow via kyc_verified
 *  2. Valid booking-specific super_admin override → allow via override
 *  3. Otherwise → blocked with the readiness reason
 */
export function resolvePickupKyc(
  profile: KycProfileInput | null,
  overrides: KycOverrideEntry[],
  bookingId: string,
  now: Date = new Date(),
): KycPickupResolution {
  const readiness = computeKycReadiness(profile, now);

  if (readiness.ready) {
    return { canPickup: true, via: "kyc_verified", reason: "verified", matchedOverrideId: null };
  }

  // Shared predicate — identical match logic to hasValidPickupOverride / readiness.
  const matchedOverride = findPickupOverride(overrides, bookingId);
  if (matchedOverride) {
    return {
      canPickup: true,
      via: "override",
      reason: "override_present",
      matchedOverrideId: matchedOverride.id,
    };
  }

  return { canPickup: false, via: "blocked", reason: readiness.reason, matchedOverrideId: null };
}
