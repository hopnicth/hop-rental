/**
 * Admin payment-alert helpers.
 *
 * Shared between:
 *  - GET  /api/admin/payment-alerts                 (list)
 *  - POST /api/admin/payment-alerts/[id]/resolve
 *  - POST /api/admin/orders/[id]/apply-inventory    (auto-resolve on success)
 *  - GET  /api/admin/orders/[id]                    (embed alerts on detail)
 *  - PATCH /api/admin/orders/[id]                   (auto-resolve on tracking)
 */
import type {
  AdminPaymentAlert,
  AdminPaymentAlertSeverity,
} from "~~/app/types/admin-order-detail";

export const ADMIN_PAYMENT_ALERT_SELECT =
  "id, order_id, payment_attempt_id, kind, audience, severity, message, metadata, created_at, resolved_at, resolved_by, order:orders(order_number)";

const SEVERITIES: AdminPaymentAlertSeverity[] = [
  "info",
  "warning",
  "error",
  "critical",
];

function asSeverity(value: unknown): AdminPaymentAlertSeverity {
  return SEVERITIES.includes(value as AdminPaymentAlertSeverity)
    ? (value as AdminPaymentAlertSeverity)
    : "info";
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function mapAdminPaymentAlert(row: unknown): AdminPaymentAlert {
  const r = (row ?? {}) as Record<string, unknown>;
  const orderRow = r.order as { order_number?: unknown } | null | undefined;
  return {
    id: String(r.id ?? ""),
    orderId: r.order_id ? String(r.order_id) : null,
    orderNumber:
      orderRow && typeof orderRow.order_number === "string"
        ? orderRow.order_number
        : null,
    paymentAttemptId: r.payment_attempt_id
      ? String(r.payment_attempt_id)
      : null,
    kind: String(r.kind ?? ""),
    severity: asSeverity(r.severity),
    message: String(r.message ?? ""),
    metadata: asMetadata(r.metadata),
    createdAt: String(r.created_at ?? ""),
    resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
    resolvedBy: r.resolved_by ? String(r.resolved_by) : null,
  };
}

type AnyClient = { from: (table: string) => any };

/**
 * Mark every unresolved admin-audience alert for an order as resolved by the
 * given user. Used by the tracking-save auto-resolve hook and by the manual
 * apply-inventory success path.
 */
export async function autoResolveOrderAlerts(
  client: AnyClient,
  orderId: string,
  resolvedBy: string,
  options: { kind?: string } = {},
): Promise<number> {
  let q = client
    .from("payment_alerts")
    .update({ resolved_at: new Date().toISOString(), resolved_by: resolvedBy })
    .eq("order_id", orderId)
    .eq("audience", "admin")
    .is("resolved_at", null);
  if (options.kind) q = q.eq("kind", options.kind);
  const { data, error } = await q.select("id");
  if (error) return 0;
  return Array.isArray(data) ? data.length : 0;
}

/**
 * Fetch alerts for a single order (used by admin order detail GET).
 * Returns up to `limit` rows, newest first.
 */
export async function fetchAlertsForOrder(
  client: AnyClient,
  orderId: string,
  limit = 20,
): Promise<AdminPaymentAlert[]> {
  const { data, error } = await client
    .from("payment_alerts")
    .select(ADMIN_PAYMENT_ALERT_SELECT)
    .eq("order_id", orderId)
    .eq("audience", "admin")
    .order("resolved_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map(mapAdminPaymentAlert);
}
