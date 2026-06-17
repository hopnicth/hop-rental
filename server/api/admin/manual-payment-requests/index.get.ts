/**
 * GET /api/admin/manual-payment-requests
 *
 * Staff/admin list of manual payment requests (newest first) with allocation
 * summary + slipExists. Filterable by status / source_type / customer.
 *
 * Auth:    requirePlatformAdmin (staff + super_admin).
 * Query:   status?  source_type?  customer_id?  page?  pageSize?
 * Returns: { items, total, page, pageSize, hasMore }
 * Errors:  401 | 403 | 500
 */
import { defineEventHandler, getQuery } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { listManualPaymentRequests } from "~~/server/utils/manual-payment-request";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const q = getQuery(event);

  return listManualPaymentRequests(adminClient, {
    status: typeof q.status === "string" ? q.status : null,
    sourceType: typeof q.source_type === "string" ? q.source_type : null,
    customerId: typeof q.customer_id === "string" ? q.customer_id : null,
    page: Number(q.page ?? 0),
    pageSize: Number(q.pageSize ?? 20),
  });
});
