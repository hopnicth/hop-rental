/**
 * Shared KYC profile "safe view" — the SINGLE PII whitelist boundary for KYC
 * profile API responses.
 *
 * Covers:
 *  - KYC_PROFILE_SAFE_SELECT: the only column list KYC read endpoints select.
 *  - SafeKycProfile: the only shape returned to clients.
 *  - toSafeKycProfile: the only mapper from a DB row to a response.
 *
 * CONTRACT (security-core — every KYC profile endpoint MUST follow this):
 *  - Raw DB rows must NEVER be returned directly — always go through toSafeKycProfile.
 *  - identity_hash must NEVER be returned (it is the HMAC lookup key, not a field).
 *  - The raw identity value must NEVER be returned (only identity_last4, masked).
 *  - user_id must NEVER be returned directly — expose presence only as `hasUserId`.
 *  - storage paths, kyc_documents, rejection notes, revocation notes, verification
 *    secrets, and any other column not on this whitelist must NEVER be returned.
 *  - KYC_PROFILE_SAFE_SELECT may include user_id solely to derive hasUserId /
 *    internal dedupe; the mapper drops it so it never reaches the response.
 *
 * Pure — no DB access, no Supabase import. Callers pass already-fetched rows.
 */
import type { KycProfileRow } from "~~/server/utils/kyc";

/**
 * DB-row shape consumed by `toSafeKycProfile`. Extends the gate's `KycProfileRow`
 * (id/status/valid_until/created_at) with the additional safe columns selected by
 * `KYC_PROFILE_SAFE_SELECT`. `user_id` is present for hasUserId derivation only.
 */
export interface KycProfileSafeRow extends KycProfileRow {
  user_id: string | null;
  customer_type: string;
  identity_type: string;
  identity_last4: string;
  branch_id: string | null;
  verified_at: string | null;
  verified_branch_id: string | null;
}

/**
 * The ONLY column list KYC read endpoints may select. Includes `user_id` solely
 * to derive `hasUserId` — the mapper drops the raw value. Deliberately EXCLUDES
 * identity_hash, storage paths, document data, and rejection/revoke notes.
 */
export const KYC_PROFILE_SAFE_SELECT =
  "id, user_id, customer_type, identity_type, identity_last4, status, valid_until, branch_id, created_at, verified_at, verified_branch_id";

/** Client-safe KYC profile shape — the ONLY shape returned by KYC profile endpoints. */
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

/**
 * Pure whitelist mapper — strips identity_hash, the raw user_id, and every column
 * not on the SafeKycProfile whitelist by construction. The single source of truth
 * for KYC profile responses (lookup, create, and later attach/verify).
 */
export function toSafeKycProfile(row: KycProfileSafeRow): SafeKycProfile {
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
