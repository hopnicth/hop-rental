import { timingSafeEqual } from "node:crypto";
import {
  createError,
  defineEventHandler,
  getRouterParam,
  readBody,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { hashKycIdentity, type KycIdentityType } from "~~/server/utils/kyc";
import {
  assertPickupReadinessBranchAccess,
  loadRentalPickupReadiness,
} from "~~/server/utils/rental-pickup-readiness";
import {
  KYC_PROFILE_SAFE_SELECT,
  toSafeKycProfile,
  type KycProfileSafeRow,
  type SafeKycProfile,
} from "~~/server/utils/kyc-profile-view";

/**
 * POST /api/admin/rental-bookings/[id]/kyc-attach
 *
 * Attach a KYC profile to a WALK-IN rental booking by writing
 * `rental_bookings.kyc_profile_id`. This is the security-critical write path the
 * pickup gate trusts for walk-in bookings — the gate does not re-prove identity
 * ownership, so this endpoint is the ownership boundary.
 *
 * This is the SINGLE writer of `rental_bookings.kyc_profile_id`. No generic
 * booking PATCH/update route accepts or writes that column (the admin
 * `[id].patch.ts` writes `{ status }` only).
 *
 * Auth: requirePlatformAdmin + branch-access parity with the pickup/readiness path.
 *
 * Request body:
 *   profileId     — target kyc_profiles.id to link
 *   identityType  — 'national_id' | 'passport' | 'juristic_id'
 *   identityValue — raw identity string (hashed server-side; never stored/logged)
 *
 * Returns: { profile: SafeKycProfile, attached: true, oldProfileId, newProfileId }
 * Errors:  400 | 401 | 403 | 404 | 409 | 422 | 500
 *
 * INVARIANTS (decisions.md → TASK 4.2A-3):
 *  1. Identity ownership — re-derive hash via hashKycIdentity and assert it equals
 *     the target profile's identity_hash. A bare profileId is NEVER sufficient.
 *  3. No phone matching — resolution is by identity hash only.
 *  4. Walk-in only — refuse when booking.user_id IS NOT NULL, AND refuse when the
 *     target profile is registered-user-scoped (kyc_profiles.user_id IS NOT NULL).
 *     Mirrors 4.2A-2 create-pending, which never reuses a registered profile for
 *     walk-in context — otherwise a walk-in could attach a registered user's
 *     verified profile by knowing the identity value.
 *  5. No KYC mutation — only rental_bookings.kyc_profile_id is written; no
 *     kyc_profiles status/verify/reject/revoke/document field is touched.
 *  9. Frozen after pickup — reject if a pickup fulfillment snapshot exists or the
 *     booking is past pickup (picked_up/returned) or otherwise not pre-pickup.
 * 12. Global KYC identity — branch access is checked on the booking operation;
 *     the profile's branch_id / verified_branch_id is NOT matched to the booking.
 */

const IDENTITY_TYPES: ReadonlySet<KycIdentityType> = new Set([
  "national_id",
  "passport",
  "juristic_id",
]);

// Booking states in which a walk-in KYC profile may be (re)attached — pre-pickup only.
const ATTACHABLE_STATUSES = new Set(["draft", "confirmed"]);

export interface KycAttachResponse {
  profile: SafeKycProfile;
  attached: true;
  oldProfileId: string | null;
  newProfileId: string;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Constant-time hash comparison. Both inputs are hex HMAC strings; the explicit
 * length check avoids timingSafeEqual throwing on unequal-length buffers (and a
 * length difference already means "not equal").
 */
function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export default defineEventHandler(
  async (event): Promise<KycAttachResponse> => {
    const { adminClient, userId, platformRole } =
      await requirePlatformAdmin(event);

    const bookingId = getRouterParam(event, "id");
    if (!bookingId) {
      throw createError({ statusCode: 400, statusMessage: "Booking id is required" });
    }

    const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
    const profileId = asText(body.profileId);
    const identityType = body.identityType;
    const identityValue = body.identityValue;

    if (!profileId) {
      throw createError({ statusCode: 400, statusMessage: "PROFILE_ID_REQUIRED" });
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

    // Derive the ownership hash server-side. hashKycIdentity is the ONLY hashing
    // entry point. Format mismatch → 400; missing secret → 500. No PII in errors.
    let identityHash: string;
    try {
      identityHash = hashKycIdentity(identityType as KycIdentityType, identityValue);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const isSecretError = message.includes("KYC_HASH_SECRET");
      throw createError({
        statusCode: isSecretError ? 500 : 400,
        statusMessage: isSecretError ? "KYC_HASH_UNAVAILABLE" : "INVALID_IDENTITY_FORMAT",
      });
    }

    // Branch-access parity: resolve the booking's branch exactly as the
    // pickup/readiness path does, then run the same access check.
    const readiness = await loadRentalPickupReadiness({ adminClient, bookingId });
    await assertPickupReadinessBranchAccess({
      adminClient,
      userId,
      platformRole,
      branchId: readiness.rental.branchId,
    });

    // Walk-in only — registered bookings resolve KYC by user_id and ignore
    // kyc_profile_id, so attach must never apply to them.
    if (readiness.customer.userId) {
      throw createError({
        statusCode: 422,
        statusMessage: "REGISTERED_BOOKING_NO_ATTACH",
      });
    }

    // Pre-pickup lifecycle only.
    if (!ATTACHABLE_STATUSES.has(readiness.booking.status)) {
      throw createError({
        statusCode: 422,
        statusMessage: "BOOKING_NOT_ATTACHABLE_STATE",
      });
    }

    // Frozen after pickup — a pickup fulfillment snapshot is the audit record of
    // what authorized pickup; once it exists, the link must not change.
    const { data: pickupEvent, error: fulfillmentError } = await adminClient
      .from("rental_booking_fulfillments")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("event_type", "pickup")
      .limit(1)
      .maybeSingle();
    if (fulfillmentError) {
      throw createError({ statusCode: 500, statusMessage: fulfillmentError.message });
    }
    if (pickupEvent) {
      throw createError({
        statusCode: 409,
        statusMessage: "KYC_ATTACH_FROZEN_AFTER_PICKUP",
      });
    }

    // Load the target profile, including identity_hash for the ownership check.
    // identity_hash is read server-side ONLY for comparison and is stripped from
    // the response by toSafeKycProfile (which whitelists fields).
    const { data: profileRow, error: profileError } = await adminClient
      .from("kyc_profiles")
      .select(`${KYC_PROFILE_SAFE_SELECT}, identity_hash`)
      .eq("id", profileId)
      .maybeSingle();
    if (profileError) {
      throw createError({ statusCode: 500, statusMessage: profileError.message });
    }
    if (!profileRow) {
      throw createError({ statusCode: 404, statusMessage: "KYC_PROFILE_NOT_FOUND" });
    }

    // Identity ownership proof — the derived hash MUST equal the target profile's
    // stored identity_hash (constant-time compare). A bare profileId is never
    // sufficient.
    const targetHash = (profileRow as { identity_hash?: unknown }).identity_hash;
    if (typeof targetHash !== "string" || !hashesEqual(targetHash, identityHash)) {
      throw createError({
        statusCode: 403,
        statusMessage: "IDENTITY_OWNERSHIP_MISMATCH",
      });
    }

    // Walk-in-scoped profile only. A registered user's profile (user_id IS NOT
    // NULL) must never be attached to a walk-in booking, mirroring 4.2A-2
    // create-pending. Checked AFTER identity proof so a caller cannot probe
    // whether a profile is registered without first proving identity ownership.
    const profileUserId = (profileRow as { user_id?: unknown }).user_id;
    if (typeof profileUserId === "string" && profileUserId.length > 0) {
      throw createError({
        statusCode: 422,
        statusMessage: "REGISTERED_PROFILE_NOT_ATTACHABLE",
      });
    }

    // Capture the current link for traceability (re-attach / correction).
    const { data: currentBooking, error: currentError } = await adminClient
      .from("rental_bookings")
      .select("kyc_profile_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (currentError) {
      throw createError({ statusCode: 500, statusMessage: currentError.message });
    }
    const oldProfileId = asText(
      (currentBooking as { kyc_profile_id?: unknown } | null)?.kyc_profile_id,
    );

    // Write ONLY kyc_profile_id. The guards (`user_id IS NULL`, pre-pickup status)
    // are repeated on the UPDATE as a concurrency backstop — a registered booking
    // or a booking that advanced to pickup can never be written even under a race.
    const { data: updated, error: updateError } = await adminClient
      .from("rental_bookings")
      .update({ kyc_profile_id: profileId })
      .eq("id", bookingId)
      .is("user_id", null)
      .in("status", [...ATTACHABLE_STATUSES])
      .select("id")
      .maybeSingle();
    if (updateError) {
      throw createError({ statusCode: 500, statusMessage: updateError.message });
    }
    if (!updated) {
      // The guarded update matched no row — booking changed under us.
      throw createError({
        statusCode: 409,
        statusMessage: "KYC_ATTACH_BOOKING_STATE_CHANGED",
      });
    }

    return {
      profile: toSafeKycProfile(profileRow as KycProfileSafeRow),
      attached: true,
      oldProfileId,
      newProfileId: profileId,
    };
  },
);
