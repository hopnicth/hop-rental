// Staff late-cancel forfeiture (design §A case 2). §F inversion pattern:
// requirePlatformAdmin here; every post-guard refusal in the util logs a
// denied money_ops_decision_logs row BEFORE throwing; the allowed row is
// fail-closed before the money RPC. Deliberately NOT the super-admin-only
// guard helper — late-cancel is a staff-level operation (§b) and denials
// must be loggable before any throw.
import {
  defineEventHandler,
  getHeader,
  getRequestIP,
  getRouterParam,
  readBody,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { lateCancelForfeitRentalBooking } from "~~/server/utils/admin-rental-booking-cancel";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } = await requirePlatformAdmin(event);
  const body = (await readBody<{ reason?: string }>(event)) ?? {};
  return lateCancelForfeitRentalBooking({
    client: adminClient,
    rawBookingId: getRouterParam(event, "id"),
    actorUserId: userId,
    actorRole: platformRole,
    reason: body.reason,
    ipAddress: getRequestIP(event, { xForwardedFor: true }) ?? null,
    userAgent: getHeader(event, "user-agent") ?? null,
  });
});
