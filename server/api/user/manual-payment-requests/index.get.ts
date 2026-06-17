/**
 * GET /api/user/manual-payment-requests
 *
 * List the authenticated customer's manual payment requests (newest first) so
 * they can return later to pay / upload a slip. Owner-scoped — never returns
 * another customer's requests.
 *
 * Query:   status?  source_type?  page?  pageSize?
 * Returns: { items, total, page, pageSize, hasMore } — each item includes a
 *          lightweight allocation summary, slipExists, and link.
 * Errors:  401 | 500
 */
import { createError, defineEventHandler, getQuery } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { listManualPaymentRequests } from "~~/server/utils/manual-payment-request";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const q = getQuery(event);
  const client = serverSupabaseServiceRole(event);

  return listManualPaymentRequests(client, {
    ownerUserId: String(userId),
    status: typeof q.status === "string" ? q.status : null,
    sourceType: typeof q.source_type === "string" ? q.source_type : null,
    page: Number(q.page ?? 0),
    pageSize: Number(q.pageSize ?? 20),
  });
});
