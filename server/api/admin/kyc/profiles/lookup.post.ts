import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  hashKycIdentity,
  selectBestKycProfile,
  type KycIdentityType,
  type KycProfileRow,
} from "~~/server/utils/kyc";

/**
 * POST /api/admin/kyc/profiles/lookup
 *
 * Read-only lookup of the best existing KYC profile by hashed identity.
 * Used by POS / admin to find an already-created profile before deciding to
 * create or attach one. Does NOT create, attach, verify, or mutate anything.
 *
 * Method is POST (not GET) so the sensitive identity value travels in the body,
 * never in a query string / loggable URL.
 *
 * Auth: requirePlatformAdmin (staff + super_admin); service-role DB read.
 *
 * Request body:
 *   identityType  — 'national_id' | 'passport' | 'juristic_id'
 *   identityValue — raw identity string (hashed server-side, never stored/logged)
 *
 * Returns: { profile: SafeKycProfile | null }
 * Errors:  400 (bad body / invalid identity format) | 401 | 403 | 500
 *
 * SECURITY:
 *  - identityValue is hashed via hashKycIdentity ONLY (never hashIdentity on raw).
 *  - The raw identity value is NEVER logged and NEVER returned.
 *  - identity_hash is NEVER returned. Storage paths, document data, and
 *    rejection/revocation notes are NEVER selected or returned.
 */

const IDENTITY_TYPES: ReadonlySet<KycIdentityType> = new Set([
  "national_id",
  "passport",
  "juristic_id",
]);

// Columns safe to read for an admin lookup decision. Deliberately excludes
// identity_hash, storage paths, document data, and rejection/revoke notes.
const KYC_LOOKUP_SELECT =
  "id, user_id, customer_type, identity_type, identity_last4, status, valid_until, branch_id, created_at, verified_at, verified_branch_id";

interface KycLookupRow extends KycProfileRow {
  user_id: string | null;
  customer_type: string;
  identity_type: string;
  identity_last4: string;
  branch_id: string | null;
  verified_at: string | null;
  verified_branch_id: string | null;
}

export interface SafeKycProfile {
  id: string;
  customerType: string;
  identityType: string;
  identityLast4: string;
  status: string;
  validUntil: string | null;
  branchId: string | null;
  createdAt: string;
  verifiedAt: string | null;
  verifiedBranchId: string | null;
  /** Presence only — true when the profile is owned by a registered user. */
  hasUserId: boolean;
}

export interface KycProfileLookupResponse {
  profile: SafeKycProfile | null;
}

/** Pure mapper — strips identity_hash and all sensitive fields by construction. */
function toSafeKycProfile(row: KycLookupRow): SafeKycProfile {
  return {
    id: row.id,
    customerType: row.customer_type,
    identityType: row.identity_type,
    identityLast4: row.identity_last4,
    status: row.status,
    validUntil: row.valid_until,
    branchId: row.branch_id,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
    verifiedBranchId: row.verified_branch_id,
    hasUserId: typeof row.user_id === "string" && row.user_id.length > 0,
  };
}

export default defineEventHandler(
  async (event): Promise<KycProfileLookupResponse> => {
    const { adminClient } = await requirePlatformAdmin(event);

    const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
    const identityType = body.identityType;
    const identityValue = body.identityValue;

    if (
      typeof identityType !== "string" ||
      !IDENTITY_TYPES.has(identityType as KycIdentityType)
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "INVALID_IDENTITY_TYPE",
      });
    }
    if (typeof identityValue !== "string" || identityValue.trim().length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: "IDENTITY_VALUE_REQUIRED",
      });
    }

    // Normalize + hash server-side. hashKycIdentity throws on:
    //  - format mismatch        → client error (400), message carries NO PII
    //  - missing KYC_HASH_SECRET → server error (500), fail safe, no PII
    let identityHash: string;
    try {
      identityHash = hashKycIdentity(
        identityType as KycIdentityType,
        identityValue,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "identity hashing failed";
      // KYC_HASH_SECRET errors are a server misconfiguration (500); format
      // assertion failures are client errors (400). Neither message contains
      // the raw or normalized identity value (guaranteed by kyc.ts contract).
      const isSecretError = message.includes("KYC_HASH_SECRET");
      throw createError({
        statusCode: isSecretError ? 500 : 400,
        statusMessage: isSecretError
          ? "KYC_HASH_UNAVAILABLE"
          : "INVALID_IDENTITY_FORMAT",
      });
    }

    const { data, error } = await adminClient
      .from("kyc_profiles")
      .select(KYC_LOOKUP_SELECT)
      .eq("identity_hash", identityHash)
      .order("created_at", { ascending: false });
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }

    const best = selectBestKycProfile((data ?? []) as KycLookupRow[]);
    return { profile: best ? toSafeKycProfile(best) : null };
  },
);
