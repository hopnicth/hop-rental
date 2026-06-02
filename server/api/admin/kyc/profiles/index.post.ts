import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  hashKycIdentity,
  maskLast4,
  normalizeKycIdentity,
  selectBestKycProfile,
  type KycIdentityType,
} from "~~/server/utils/kyc";
import {
  KYC_PROFILE_SAFE_SELECT,
  toSafeKycProfile,
  type KycProfileSafeRow,
  type SafeKycProfile,
} from "~~/server/utils/kyc-profile-view";

/**
 * POST /api/admin/kyc/profiles
 *
 * Create a PENDING KYC profile for POS / admin walk-in KYC intake — or reuse an
 * existing walk-in profile for the same identity. This endpoint ONLY creates a
 * pending record. It does NOT verify, attach to a booking, upload documents, or
 * mutate rental_bookings.
 *
 * Method is POST with the sensitive identity in the body (never a loggable URL).
 *
 * Auth: requirePlatformAdmin (staff + super_admin); service-role DB write.
 *
 * Request body:
 *   customerType  — 'individual' | 'company'
 *   identityType  — 'national_id' | 'passport' | 'juristic_id'
 *   identityValue — raw identity string (hashed server-side, never stored/logged)
 *   branchId?     — store branch id (text); validity enforced by FK
 *   walkInPhone?  — contact metadata ONLY; never the identity root
 *
 * Returns: { profile: SafeKycProfile, created: boolean, reused: boolean }
 * Errors:  400 (bad body / invalid identity format) | 401 | 403 | 422 | 500
 *
 * SECURITY / INVARIANTS:
 *  - identityValue is hashed via hashKycIdentity ONLY (never hashIdentity on raw).
 *  - identity_last4 is derived from the NORMALIZED value, never the raw input.
 *  - Raw identity is NEVER logged and NEVER returned; identity_hash is NEVER returned.
 *  - Status is ALWAYS 'pending'. Verified/rejection/revocation fields are NEVER set.
 *  - Walk-in dedupe considers ONLY profiles with user_id IS NULL. A registered
 *    user's profile (user_id IS NOT NULL) is NEVER reused for a walk-in create.
 *  - walk_in_phone is stored as contact metadata only — never used to match identity.
 *  - This creates a pending profile; a pending profile does NOT pass the pickup gate
 *    (resolvePickupKyc), and confirmPickup re-checks live KYC later.
 *  - The response shape, safe SELECT, and mapper come from the shared PII whitelist
 *    util `server/utils/kyc-profile-view.ts` (single source of truth for lookup/create).
 */

const CUSTOMER_TYPES = new Set(["individual", "company"]);
const IDENTITY_TYPES: ReadonlySet<KycIdentityType> = new Set([
  "national_id",
  "passport",
  "juristic_id",
]);

// customerType × identityType coherence. identity_hash is v1:identityType:value and
// does NOT include customerType, so an incoherent pair (e.g. individual + juristic_id)
// could dedupe against a profile of a different customerType. Enforce a coherent pair:
//   individual → national_id | passport
//   company    → juristic_id
const COHERENT_IDENTITY_TYPES: Record<string, ReadonlySet<KycIdentityType>> = {
  individual: new Set(["national_id", "passport"]),
  company: new Set(["juristic_id"]),
};

export interface KycProfileCreateResponse {
  profile: SafeKycProfile;
  created: boolean;
  reused: boolean;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export default defineEventHandler(
  async (event): Promise<KycProfileCreateResponse> => {
    const { adminClient } = await requirePlatformAdmin(event);

    const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
    const customerType = body.customerType;
    const identityType = body.identityType;
    const identityValue = body.identityValue;
    const branchId = optionalText(body.branchId);
    const walkInPhone = optionalText(body.walkInPhone);

    if (typeof customerType !== "string" || !CUSTOMER_TYPES.has(customerType)) {
      throw createError({ statusCode: 400, statusMessage: "INVALID_CUSTOMER_TYPE" });
    }
    if (
      typeof identityType !== "string" ||
      !IDENTITY_TYPES.has(identityType as KycIdentityType)
    ) {
      throw createError({ statusCode: 400, statusMessage: "INVALID_IDENTITY_TYPE" });
    }
    if (typeof identityValue !== "string" || identityValue.trim().length === 0) {
      throw createError({ statusCode: 400, statusMessage: "IDENTITY_VALUE_REQUIRED" });
    }
    // Coherence guard: reject identityType that does not belong to the customerType.
    // Error carries NO raw identity value.
    if (!COHERENT_IDENTITY_TYPES[customerType].has(identityType as KycIdentityType)) {
      throw createError({
        statusCode: 400,
        statusMessage: "INCOHERENT_IDENTITY_FOR_CUSTOMER_TYPE",
      });
    }

    // Normalize + hash server-side. identity_last4 is derived from the NORMALIZED
    // value (never raw). Format-assertion failures → 400; missing secret → 500.
    // Neither error message contains the raw or normalized identity (kyc.ts contract).
    let identityHash: string;
    let identityLast4: string;
    try {
      const normalized = normalizeKycIdentity(
        identityType as KycIdentityType,
        identityValue,
      );
      identityLast4 = maskLast4(normalized);
      identityHash = hashKycIdentity(identityType as KycIdentityType, identityValue);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const isSecretError = message.includes("KYC_HASH_SECRET");
      throw createError({
        statusCode: isSecretError ? 500 : 400,
        statusMessage: isSecretError ? "KYC_HASH_UNAVAILABLE" : "INVALID_IDENTITY_FORMAT",
      });
    }

    // Lookup-before-insert. Walk-in dedupe considers ONLY user_id IS NULL profiles.
    // A registered user's profile with the same identity_hash is NEVER reused here.
    const { data: existingRows, error: lookupError } = await adminClient
      .from("kyc_profiles")
      .select(KYC_PROFILE_SAFE_SELECT)
      .eq("identity_hash", identityHash)
      .order("created_at", { ascending: false });
    if (lookupError) {
      throw createError({ statusCode: 500, statusMessage: lookupError.message });
    }

    const walkInCandidates = ((existingRows ?? []) as KycProfileSafeRow[]).filter(
      (r) => !r.user_id,
    );
    const reusable = selectBestKycProfile(walkInCandidates);
    if (reusable) {
      return { profile: toSafeKycProfile(reusable), created: false, reused: true };
    }

    // Insert a NEW pending walk-in profile. Only the allowed columns are written.
    // user_id is intentionally omitted → NULL (walk-in). No verified/rejection/
    // revocation field is ever set.
    const { data: inserted, error: insertError } = await adminClient
      .from("kyc_profiles")
      .insert({
        customer_type: customerType,
        identity_type: identityType,
        identity_hash: identityHash,
        identity_last4: identityLast4,
        status: "pending",
        branch_id: branchId,
        walk_in_phone: walkInPhone,
      })
      .select(KYC_PROFILE_SAFE_SELECT)
      .single();
    if (insertError || !inserted) {
      // 23503 = FK violation (e.g. invalid branch_id); 23505 = unique conflict.
      const code = (insertError as { code?: string } | null)?.code;
      const statusCode = code === "23503" ? 422 : code === "23505" ? 409 : 500;
      throw createError({
        statusCode,
        statusMessage:
          code === "23503"
            ? "INVALID_BRANCH"
            : insertError?.message ?? "KYC profile create failed",
      });
    }

    return {
      profile: toSafeKycProfile(inserted as KycProfileSafeRow),
      created: true,
      reused: false,
    };
  },
);
