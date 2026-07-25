/**
 * POST /api/admin/rental-bookings/:id/settlement-waive
 *
 * SUPER ADMIN only — waives the outstanding settlement payment (§8.9 half 2).
 * The RPC f_waive_settlement_payment (migration 141) is the writer authority:
 * it flips the payment state to `waived`, cancels the pending charge lines,
 * and writes its own §F success row atomically.
 *
 * §F INVERSION — requirePlatformAdmin here, with the explicit super_admin
 * check inside waiveSettlementPayment, so staff denials are LOGGED to
 * money_ops_decision_logs BEFORE the 403. Deliberately NOT requireSuperAdmin:
 * that helper throws before the denial log, which is precisely the silent
 * gap §8.9 exists to close. Same pattern as company-cancel.post.ts.
 *
 * The actor role is taken from the guard (public.users lookup), NEVER from
 * the request body.
 *
 * Auth:  requirePlatformAdmin (super_admin enforced in the util)
 * Input: JSON { reason }  — reason is MANDATORY (§F); stored on the domain
 *        row, never copied into the decision log (NO-PII invariant).
 * Returns: { ok: true, state: 'waived' }
 * Errors:  401 | 403 | 404 | 409 | 422 | 500
 */
import {
  defineEventHandler,
  getHeader,
  getRequestIP,
  getRouterParam,
  readBody,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  waiveSettlementPayment,
  type WaiveClient,
} from "~~/server/utils/rental-settlement-waive";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } =
    await requirePlatformAdmin(event);
  const body = (await readBody<{ reason?: string }>(event)) ?? {};

  return await waiveSettlementPayment({
    // Utils take the loose client shape (house pattern). The generated
    // Database type does not cover the mig-133/134 settlement objects yet, so
    // the typed client is not structurally assignable — cast at the boundary.
    client: adminClient as unknown as WaiveClient,
    rawBookingId: getRouterParam(event, "id"),
    actorUserId: userId,
    actorRole: platformRole,
    reason: body.reason,
    ipAddress: getRequestIP(event, { xForwardedFor: true }) ?? null,
    userAgent: getHeader(event, "user-agent") ?? null,
  });
});
