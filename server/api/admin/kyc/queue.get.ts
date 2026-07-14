/**
 * GET /api/admin/kyc/queue
 *
 * Super Admin approve queue — the ratified pending-only exception to the
 * lookup-first rule (decisions.md §a addendum item 1). Lists PENDING KYC
 * profiles only, with MINIMAL fields: display name, customer type, branch,
 * submitted-at, and §a document completeness. NEVER returns identity_hash,
 * identity_last4, or any phone number.
 *
 * Auth: requirePlatformAdmin + EXPLICIT super_admin check (§a addendum
 * item 2 — the download.get.ts inversion), so the denial is audit-logged
 * via logKycDocumentAccess (action='list_pending', best-effort) BEFORE the
 * 403. Deliberately NOT the dedicated super-admin guard helper (it would throw before the denial could be logged).
 *
 * Returns: { items: Array<{ id, displayName, customerType, branchId,
 *            submittedAt, hasUserId, complete, missingDocumentTypes }> }
 * Errors:  401 | 403 | 500
 */
import { createError, defineEventHandler, getHeader } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { computeKycDocumentCompleteness } from "~~/server/utils/kyc";
import {
  logKycDocumentAccess,
  parseSingleForwardedIp,
} from "~~/server/utils/kyc-documents";

export interface KycQueueItem {
  id: string;
  displayName: string | null;
  customerType: string;
  branchId: string | null;
  submittedAt: string;
  hasUserId: boolean;
  complete: boolean;
  missingDocumentTypes: string[];
}

export default defineEventHandler(
  async (event): Promise<{ items: KycQueueItem[] }> => {
    const { adminClient, userId, platformRole } =
      await requirePlatformAdmin(event);

    const actor = {
      actorUserId: userId,
      actorRole: platformRole,
      ipAddress:
        parseSingleForwardedIp(getHeader(event, "x-forwarded-for")) ??
        parseSingleForwardedIp(event.node.req.socket?.remoteAddress),
      userAgent: getHeader(event, "user-agent") ?? null,
    };

    // Denial is logged BEFORE the throw (best-effort) — §a addendum item 2.
    if (platformRole !== "super_admin") {
      await logKycDocumentAccess(adminClient, {
        ...actor,
        action: "list_pending",
        result: "denied",
        reason: "not_super_admin",
      });
      throw createError({
        statusCode: 403,
        statusMessage: "Super admin access required",
      });
    }

    // Pending rows only. Minimal columns — deliberately NO identity_last4,
    // NO identity_hash, NO walk_in_phone (ratified decision 1).
    const { data: rows, error } = await adminClient
      .from("kyc_profiles")
      .select("id, user_id, holder_name, customer_type, identity_type, branch_id, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }
    const pending = rows ?? [];
    if (pending.length === 0) return { items: [] };

    // Display name: holder_name (§a capture) with users.full_name fallback
    // for user-bound rows created before migration 122.
    const boundIds = pending
      .map((r) => r.user_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    const nameByUser = new Map<string, string | null>();
    if (boundIds.length > 0) {
      const { data: users, error: usersError } = await adminClient
        .from("users")
        .select("id, full_name")
        .in("id", boundIds);
      if (usersError) {
        throw createError({ statusCode: 500, statusMessage: usersError.message });
      }
      for (const u of users ?? []) nameByUser.set(u.id, u.full_name ?? null);
    }

    // §a completeness per profile from its document types.
    const { data: docs, error: docsError } = await adminClient
      .from("kyc_documents")
      .select("kyc_profile_id, document_type")
      .in("kyc_profile_id", pending.map((r) => r.id));
    if (docsError) {
      throw createError({ statusCode: 500, statusMessage: docsError.message });
    }
    const typesByProfile = new Map<string, string[]>();
    for (const d of docs ?? []) {
      const list = typesByProfile.get(d.kyc_profile_id) ?? [];
      list.push(String(d.document_type));
      typesByProfile.set(d.kyc_profile_id, list);
    }

    return {
      items: pending.map((r) => {
        const completeness = computeKycDocumentCompleteness(
          String(r.customer_type),
          String(r.identity_type),
          typesByProfile.get(r.id) ?? [],
        );
        return {
          id: r.id,
          displayName:
            r.holder_name ?? (r.user_id ? (nameByUser.get(r.user_id) ?? null) : null),
          customerType: String(r.customer_type),
          branchId: r.branch_id,
          submittedAt: r.created_at,
          hasUserId: typeof r.user_id === "string" && r.user_id.length > 0,
          complete: completeness.complete,
          missingDocumentTypes: completeness.missing,
        };
      }),
    };
  },
);
