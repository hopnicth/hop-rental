import { createError, defineEventHandler } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  mapPosQrAttemptResponse,
  POS_QR_ATTEMPT_SELECT,
} from "~~/server/utils/pos-rental-qr-booking-deposit";

/**
 * GET /api/admin/pos-v3/rental-bookings/[bookingId]/remaining-security-deposit-qr/active
 *
 * Returns the most recent non-terminal (pending | requires_action | finalizing) QR
 * remaining security deposit attempt for a given booking, or { attempt: null }.
 *
 * Used for in-page recovery when staff refreshes while QR is pending at pickup.
 * Read-only: does NOT create, mutate, or expire any attempt.
 */

// asset join provides storage_branch_id as branch fallback for non-POS (online) bookings
const BOOKING_SELECT =
  "id, status, deposit_payment_status, pos_branch_id, asset:assets(storage_branch_id)";
const ACTIVE_STATUSES = ["pending", "requires_action", "finalizing"];

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function getStorageBranchId(booking: AnyRecord): string | null {
  const asset = booking.asset as AnyRecord | null | undefined;
  return typeof asset?.storage_branch_id === "string"
    ? asset.storage_branch_id
    : null;
}

async function assertPosBranchAccess(input: {
  adminClient: AnyClient;
  platformRole: string;
  userId: string;
  branchId: string | null;
}) {
  if (!input.branchId || input.platformRole === "super_admin") return;
  const { data, error } = await input.adminClient
    .from("admin_user_branch_access")
    .select("branch_id")
    .eq("user_id", input.userId)
    .eq("branch_id", input.branchId)
    .eq("can_pos", true)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({
      statusCode: 403,
      statusMessage: "No POS access for selected branch",
    });
}

export default defineEventHandler(async (event) => {
  const {
    adminClient,
    userId: staffUserId,
    platformRole,
  } = await requirePlatformAdmin(event);
  const bookingId = asText(event.context.params?.bookingId);
  if (!bookingId)
    throw createError({
      statusCode: 422,
      statusMessage: "bookingId is required",
    });

  const { data: bookingData, error: bookingError } = await adminClient
    .from("rental_bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError)
    throw createError({ statusCode: 500, statusMessage: bookingError.message });
  if (!bookingData)
    throw createError({
      statusCode: 404,
      statusMessage: "Rental booking not found",
    });
  const booking = bookingData as AnyRecord;

  const posBranchId = asText(booking.pos_branch_id) || null;
  const resolvedBranchId = posBranchId ?? getStorageBranchId(booking);
  await assertPosBranchAccess({
    adminClient,
    platformRole,
    userId: staffUserId,
    branchId: resolvedBranchId,
  });

  const { data: activeAttemptData, error: activeError } = await adminClient
    .from("pos_rental_payment_attempts")
    .select(POS_QR_ATTEMPT_SELECT)
    .eq("rental_booking_id", bookingId)
    .eq("payment_method", "promptpay_qr")
    .eq("payment_purpose", "remaining_security_deposit")
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError)
    throw createError({ statusCode: 500, statusMessage: activeError.message });

  return {
    attempt: activeAttemptData
      ? mapPosQrAttemptResponse(activeAttemptData as AnyRecord)
      : null,
  };
});
