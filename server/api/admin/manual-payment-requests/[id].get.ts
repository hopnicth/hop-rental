/**
 * GET /api/admin/manual-payment-requests/:id
 *
 * Staff/admin detail for one manual payment request: header, allocation items,
 * slip metadata, related sale order / rental booking summaries, admin note.
 * The customer profile (name/email) is attached for context.
 *
 * Auth:    requirePlatformAdmin.
 * Returns: { ...detail, customer }
 * Errors:  400 | 401 | 403 | 404 | 500
 */
import { defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { assembleManualPaymentRequestDetail } from "~~/server/utils/manual-payment-request";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const id = getRouterParam(event, "id");

  const detail = await assembleManualPaymentRequestDetail(
    adminClient,
    String(id ?? ""),
    { admin: true },
  );

  let customer: {
    id: string;
    fullName: string | null;
    phone: string | null;
  } | null = null;
  if (detail.paymentRequest.customerId) {
    const { data } = await adminClient
      .from("users")
      .select("id, full_name, phone")
      .eq("id", detail.paymentRequest.customerId)
      .maybeSingle();
    if (data) {
      customer = {
        id: String(data.id ?? ""),
        fullName: typeof data.full_name === "string" ? data.full_name : null,
        phone: typeof data.phone === "string" ? data.phone : null,
      };
    }
  }

  return { ...detail, customer };
});
