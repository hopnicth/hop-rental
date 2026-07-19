/**
 * Money-ops decision log writer (design §F, migration 132).
 *
 * Append-only audit of allow/deny decisions on money-destructive admin
 * operations. Mirrors logKycDocumentAccess (kyc-documents.ts):
 *  - `failClosed: true` → a failed log write throws 500 BEFORE the side
 *    effect (used for 'allowed' rows — no log, no money action).
 *  - default best-effort → returns false + server breadcrumb (used for
 *    'denied' rows — a log failure must never block the 403/409).
 *
 * NO-PII INVARIANT (table comment, mig 132): only opaque UUIDs, closed
 * vocabularies, and numeric amounts. Never names/phones/bank details/
 * transfer refs/slip paths/free-text business reasons.
 */
import { createError } from "h3";

type AnyClient = { from(table: string): any };

export type MoneyOpsOperation =
  | "company_cancel"
  | "late_cancel_forfeit"
  | "document_void"
  | "sale_cancel_paid"
  | "refund_mark_refunded"
  | "manual_stock_adjustment";

export type MoneyOpsEntityType =
  | "rental_booking"
  | "sale_order"
  | "official_document"
  | "payment_refund";

export interface MoneyOpsDecisionEntry {
  operation: MoneyOpsOperation;
  decision: "allowed" | "denied";
  /** Machine code only (e.g. 'window_not_reached'); required for denied. */
  denialReason?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  entityType?: MoneyOpsEntityType | null;
  /** Opaque UUID only — malformed raw input must be logged as null. */
  entityId?: string | null;
  amount?: number | null;
  currencyCode?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function logMoneyOpsDecision(
  client: AnyClient,
  entry: MoneyOpsDecisionEntry,
  options: { failClosed?: boolean } = {},
): Promise<boolean> {
  const { error } = await client.from("money_ops_decision_logs").insert({
    operation: entry.operation,
    decision: entry.decision,
    denial_reason: entry.decision === "denied" ? (entry.denialReason ?? "unspecified") : null,
    actor_user_id: entry.actorUserId ?? null,
    actor_role: entry.actorRole ?? null,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    amount: entry.amount ?? null,
    currency_code: entry.currencyCode ?? null,
    ip_address: entry.ipAddress ?? null,
    user_agent: entry.userAgent ?? null,
  });
  if (error) {
    if (options.failClosed) {
      throw createError({
        statusCode: 500,
        statusMessage: "MONEY_OPS_LOG_WRITE_FAILED",
      });
    }
    console.error("money-ops decision log write failed:", error.message);
    return false;
  }
  return true;
}
