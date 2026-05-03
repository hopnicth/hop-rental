import { createError, defineEventHandler, getQuery } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PAYMENT_ALERT_SELECT,
  mapAdminPaymentAlert,
} from "~~/server/utils/admin-alerts";
import type { AdminPaymentAlertListResponse } from "~~/app/types/admin-order-detail";

const ALLOWED_SEVERITIES = new Set(["info", "warning", "error", "critical"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export default defineEventHandler(
  async (event): Promise<AdminPaymentAlertListResponse> => {
    const { adminClient } = await requirePlatformAdmin(event);
    const query = getQuery(event);

    const resolvedFilter =
      query.resolved === "true"
        ? "resolved"
        : query.resolved === "all"
          ? "all"
          : "open";
    const severity =
      typeof query.severity === "string" &&
      ALLOWED_SEVERITIES.has(query.severity)
        ? query.severity
        : null;
    const kind =
      typeof query.kind === "string" && query.kind.length > 0
        ? query.kind
        : null;
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(query.limit) || DEFAULT_LIMIT),
    );
    const offset = Math.max(0, Number(query.offset) || 0);

    let listQ = adminClient
      .from("payment_alerts")
      .select(ADMIN_PAYMENT_ALERT_SELECT, { count: "exact" })
      .eq("audience", "admin");

    if (resolvedFilter === "open") listQ = listQ.is("resolved_at", null);
    if (resolvedFilter === "resolved") listQ = listQ.not("resolved_at", "is", null);
    if (severity) listQ = listQ.eq("severity", severity);
    if (kind) listQ = listQ.eq("kind", kind);

    const { data, error, count } = await listQ
      .order("resolved_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }

    const { count: openCount } = await adminClient
      .from("payment_alerts")
      .select("id", { count: "exact", head: true })
      .eq("audience", "admin")
      .is("resolved_at", null);

    return {
      items: (data ?? []).map(mapAdminPaymentAlert),
      total: count ?? 0,
      unresolvedTotal: openCount ?? 0,
    };
  },
);
