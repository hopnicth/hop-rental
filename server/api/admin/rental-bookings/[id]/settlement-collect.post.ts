/**
 * POST /api/admin/rental-bookings/:id/settlement-collect
 *
 * Records payment of the outstanding settlement amount — the ONE money item
 * the web collects. The RPC `f_confirm_settlement_payment` (migration 134,
 * hardened in 143) is the writer authority: it confirms the pending charge
 * lines, flips the payment state to `paid`, and writes its own §F success row
 * atomically.
 *
 * [T-UAT 2c] WHY THIS ENDPOINT EXISTS. The RPC shipped in mig-134 with no
 * caller — only waive was ever wired — so the counter had exactly one control
 * for a settled amount: ยกเว้นยอดชำระ. Staff could leave the money
 * awaiting_payment forever or write it off, and nothing in between
 * (UAT 2026-09-01, docs/BACKLOG.md T-UAT).
 *
 * §F INVERSION — requirePlatformAdmin here, with the role check inside
 * collectSettlementPayment, so a refusal is LOGGED to money_ops_decision_logs
 * BEFORE the error returns. requireSuperAdmin would throw ahead of the denial
 * log, which is the silent gap §8.9 exists to close. Same pattern as
 * settlement-waive.post.ts and company-cancel.post.ts.
 *
 * WHO: staff AND super_admin (CHiP ruling Q4) — taking payment is the ordinary
 * counter action. Waive stays super_admin-only because it destroys money.
 * BRANCH-SCOPED (Q3): staff need can_pos on the booking's hub; super_admin
 * bypasses. Enforced in the wrapper against the booking's own hub_id.
 *
 * The actor id and role come from the guard (public.users lookup), NEVER from
 * the request body.
 *
 * Auth:  requirePlatformAdmin (role + branch enforced in the util)
 * Input: JSON { amountPaid, paymentMethod: 'cash' | 'transfer',
 *               paymentReference?, slipEvidenceRef? }
 *        paymentReference is IGNORED for cash (generated server-side in
 *        Asia/Bangkok); for transfer both it and slipEvidenceRef — a path in
 *        the mig-113 PRIVATE rental-deposit-slips chain — are required.
 * Returns: { ok: true, state: 'paid', amountDue, amountPaid }
 * Errors:  400 | 401 | 403 | 404 | 409 | 422 | 500
 *          A replayed submit returns 409 (the state is no longer
 *          awaiting_payment), so a double-click cannot double-collect.
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
  collectSettlementPayment,
  type CollectClient,
} from "~~/server/utils/rental-settlement-collect";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } =
    await requirePlatformAdmin(event);
  const body =
    (await readBody<{
      amountPaid?: number;
      paymentMethod?: string;
      paymentReference?: string;
      slipEvidenceRef?: string;
    }>(event)) ?? {};

  return await collectSettlementPayment({
    // Utils take the loose client shape (house pattern). The generated
    // Database type does not cover the mig-133/134 settlement objects, so the
    // typed client is not structurally assignable — cast at the boundary.
    client: adminClient as unknown as CollectClient,
    rawBookingId: getRouterParam(event, "id"),
    actorUserId: userId,
    actorRole: platformRole,
    rawAmountPaid: body.amountPaid,
    rawPaymentMethod: body.paymentMethod,
    rawPaymentReference: body.paymentReference,
    rawSlipEvidenceRef: body.slipEvidenceRef,
    ipAddress: getRequestIP(event, { xForwardedFor: true }) ?? null,
    userAgent: getHeader(event, "user-agent") ?? null,
  });
});
