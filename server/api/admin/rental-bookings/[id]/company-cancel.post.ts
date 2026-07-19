// Company-side cancellation (design §A case 3): SUPER ADMIN only, full
// refund always. §F inversion pattern: requirePlatformAdmin here, the
// explicit super_admin check in the util so staff denials are LOGGED to
// money_ops_decision_logs BEFORE the 403 — deliberately NOT the
// super-admin-only guard helper (it would throw before the denial log).
import {
  defineEventHandler,
  getHeader,
  getRequestIP,
  getRouterParam,
  readBody,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { companyCancelRentalBooking } from "~~/server/utils/admin-rental-booking-cancel";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } = await requirePlatformAdmin(event);
  const body =
    (await readBody<{
      reason?: string;
      refundBankName?: string;
      refundBankAccountNumber?: string;
      refundBankAccountName?: string;
      refundContactPhone?: string;
    }>(event)) ?? {};
  return companyCancelRentalBooking({
    client: adminClient,
    rawBookingId: getRouterParam(event, "id"),
    actorUserId: userId,
    actorRole: platformRole,
    reason: body.reason,
    refundBankName: body.refundBankName,
    refundBankAccountNumber: body.refundBankAccountNumber,
    refundBankAccountName: body.refundBankAccountName,
    refundContactPhone: body.refundContactPhone,
    ipAddress: getRequestIP(event, { xForwardedFor: true }) ?? null,
    userAgent: getHeader(event, "user-agent") ?? null,
  });
});
