import { createError } from "h3";
import {
  ADMIN_RENTAL_BOOKING_DETAIL_SELECT,
  fetchAdminCustomerProfile,
  mapAdminRentalBookingDetail,
} from "~~/server/utils/admin-orders";
import type { AdminRentalBookingDetail } from "~~/app/types/admin-order-detail";
import type {
  RentalBookingStatus,
  RentalDepositRefundStatus,
} from "~~/app/types/rental-booking";

export type AdminClient = {
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
};

export type RentalFulfillmentEventType = "pickup" | "return";

export interface RentalFulfillmentPayload {
  signatureDataUrl?: string | null;
  notes?: string | null;
  refundAmount?: number | null;
  refundStatus?: RentalDepositRefundStatus | null;
  refundNotes?: string | null;
  branchId?: string | null;
  idempotencyKey?: string | null;
}

export interface CompleteRentalFulfillmentOptions {
  adminClient: AdminClient;
  userId: string;
  platformRole: string;
  bookingId: string;
  eventType: RentalFulfillmentEventType;
  payload: RentalFulfillmentPayload;
}

const SIGNATURE_BUCKET = "catalog-media";
const REFUND_STATUSES = new Set<RentalDepositRefundStatus>([
  "not_refunded",
  "pending",
  "refunded",
  "forfeited",
  "not_applicable",
]);
const REFUND_PROOF_STATUSES = new Set<RentalDepositRefundStatus>(["refunded"]);

const CURRENT_BOOKING_SELECT =
  "id, user_id, walk_in_phone, status, deposit_paid_amount, deposit_payment_status, deposit_refund_status, deposit_refund_amount, deposit_refund_notes, pos_branch_id, asset:assets(storage_branch_id)";

function cleanText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function rowString(row: Record<string, unknown>, key: string): string | null {
  return typeof row[key] === "string" && row[key].length > 0
    ? (row[key] as string)
    : null;
}

function parsePngDataUrl(value: string | null | undefined): Buffer | null {
  if (!value) return null;
  const match = /^data:image\/png;base64,(.+)$/i.exec(value);
  if (!match) return null;
  const buffer = Buffer.from(match[1], "base64");
  return buffer.byteLength > 0 ? buffer : null;
}

function statusAfter(
  eventType: RentalFulfillmentEventType,
): RentalBookingStatus {
  return eventType === "pickup" ? "picked_up" : "returned";
}

function expectedStatus(
  eventType: RentalFulfillmentEventType,
): RentalBookingStatus {
  return eventType === "pickup" ? "confirmed" : "picked_up";
}

function storageBranchId(row: Record<string, unknown>): string | null {
  const asset = row.asset as Record<string, unknown> | null | undefined;
  return typeof asset?.storage_branch_id === "string"
    ? asset.storage_branch_id
    : null;
}

function resolveEventBranch(
  row: Record<string, unknown>,
  payload: RentalFulfillmentPayload,
): string | null {
  return (
    cleanText(payload.branchId) ??
    rowString(row, "pos_branch_id") ??
    storageBranchId(row)
  );
}

function isMissingBranchAccessTable(error: unknown): boolean {
  const err = error as { code?: string | null; message?: string | null } | null;
  return (
    err?.code === "42P01" ||
    /admin_user_branch_access/i.test(err?.message ?? "")
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string | null } | null)?.code === "23505";
}

async function assertBranchAccess(
  adminClient: AdminClient,
  userId: string,
  platformRole: string,
  branchId: string | null,
) {
  if (!branchId || platformRole === "super_admin") return;
  const { data, error } = await adminClient
    .from("admin_user_branch_access")
    .select("user_id")
    .eq("user_id", userId)
    .eq("branch_id", branchId)
    .eq("can_pos", true)
    .maybeSingle();
  if (error) {
    if (isMissingBranchAccessTable(error)) return;
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
  if (!data) {
    throw createError({
      statusCode: 403,
      statusMessage: "POS branch access required",
    });
  }
}

async function assertNoDuplicateEvent(
  adminClient: AdminClient,
  bookingId: string,
  eventType: RentalFulfillmentEventType,
) {
  const { data, error } = await adminClient
    .from("rental_booking_fulfillments")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("event_type", eventType)
    .limit(1)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (data) {
    throw createError({
      statusCode: 409,
      statusMessage: `${eventType} was already recorded`,
    });
  }
}

async function assertPickupCustomerEvidence(
  adminClient: AdminClient,
  row: Record<string, unknown>,
) {
  const userId = rowString(row, "user_id");
  const walkInPhone = rowString(row, "walk_in_phone");
  if (userId) {
    const { data, error } = await adminClient
      .from("users")
      .select("id, kyc_status")
      .eq("id", userId)
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    if ((data as { kyc_status?: string } | null)?.kyc_status !== "verified") {
      throw createError({
        statusCode: 422,
        statusMessage: "Pickup requires verified customer KYC",
      });
    }
    return;
  }
  if (walkInPhone) {
    const { data, error } = await adminClient
      .from("walk_in_customers")
      .select("phone, id_card_url")
      .eq("phone", walkInPhone)
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    if (
      !cleanText((data as { id_card_url?: string | null } | null)?.id_card_url)
    ) {
      throw createError({
        statusCode: 422,
        statusMessage: "Pickup requires walk-in ID evidence",
      });
    }
    return;
  }
  throw createError({
    statusCode: 422,
    statusMessage: "Pickup requires customer identity evidence",
  });
}

async function loadCompletedChecklist(
  adminClient: AdminClient,
  bookingId: string,
  eventType: RentalFulfillmentEventType,
) {
  const { data: checklist, error } = await adminClient
    .from("rental_booking_checklists")
    .select("id, status")
    .eq("booking_id", bookingId)
    .eq("kind", eventType)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!checklist) {
    throw createError({
      statusCode: 422,
      statusMessage: `${eventType} requires a completed checklist`,
    });
  }

  const checklistId = String((checklist as { id: string }).id);
  const { data: items, error: itemsError } = await adminClient
    .from("rental_booking_checklist_items")
    .select("id, is_required, checked, result_status")
    .eq("booking_checklist_id", checklistId);
  if (itemsError)
    throw createError({ statusCode: 500, statusMessage: itemsError.message });
  const incomplete = ((items ?? []) as Array<Record<string, unknown>>).some(
    (item) =>
      item.is_required === true &&
      item.checked !== true &&
      String(item.result_status ?? "pending") === "pending",
  );
  if (incomplete) {
    throw createError({
      statusCode: 422,
      statusMessage: `${eventType} checklist has unanswered required items`,
    });
  }
  return checklistId;
}

async function assertRefundProof(
  adminClient: AdminClient,
  bookingId: string,
  refundAmount: number,
  refundStatus: RentalDepositRefundStatus,
) {
  if (refundAmount <= 0 && !REFUND_PROOF_STATUSES.has(refundStatus)) return;
  let query = adminClient
    .from("rental_booking_deposit_proofs")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("proof_kind", "refund")
    .limit(1);
  if (refundAmount > 0) query = query.gt("amount", 0);
  const { data, error } = await query.maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data) {
    throw createError({
      statusCode: 422,
      statusMessage: "Return refund requires uploaded refund proof",
    });
  }
}

async function uploadSignature(
  adminClient: AdminClient,
  bookingId: string,
  eventType: RentalFulfillmentEventType,
  signatureDataUrl: string | null | undefined,
) {
  const buffer = parsePngDataUrl(signatureDataUrl);
  if (!buffer) {
    throw createError({
      statusCode: 422,
      statusMessage: `${eventType} signature is required`,
    });
  }
  const path = `rental-fulfillment/${bookingId}/${eventType}-${crypto.randomUUID()}.png`;
  const { error } = await adminClient.storage
    .from(SIGNATURE_BUCKET)
    .upload(path, buffer, { contentType: "image/png", upsert: true });
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  const url = adminClient.storage.from(SIGNATURE_BUCKET).getPublicUrl(path)
    .data.publicUrl;
  return { signatureUrl: url, signaturePath: path };
}

async function loadCurrentBooking(adminClient: AdminClient, bookingId: string) {
  const { data, error } = await adminClient
    .from("rental_bookings")
    .select(CURRENT_BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({
      statusCode: 404,
      statusMessage: "Rental booking not found",
    });
  return data as Record<string, unknown>;
}

async function insertReturnDepositLog(
  adminClient: AdminClient,
  userId: string,
  bookingId: string,
  branchId: string | null,
  current: Record<string, unknown>,
  refundStatus: RentalDepositRefundStatus,
  refundAmount: number,
  refundNotes: string | null,
) {
  const { error } = await adminClient
    .from("rental_booking_deposit_action_logs")
    .insert({
      booking_id: bookingId,
      action: "return_refund",
      staff_user_id: userId,
      branch_id: branchId,
      old_values: {
        depositPaidAmount: money(current.deposit_paid_amount),
        depositPaymentStatus: cleanText(current.deposit_payment_status),
        depositRefundStatus: cleanText(current.deposit_refund_status),
        depositRefundAmount: money(current.deposit_refund_amount),
        depositRefundNotes: cleanText(current.deposit_refund_notes),
      },
      new_values: {
        depositPaidAmount: money(current.deposit_paid_amount),
        depositRefundStatus: refundStatus,
        depositRefundAmount: refundAmount,
        depositRefundNotes: refundNotes,
      },
      change_summary: `POS return deposit refund ${money(current.deposit_refund_amount)} -> ${refundAmount}`,
      reason: refundNotes,
    });
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
}

export async function completeRentalBookingFulfillment({
  adminClient,
  userId,
  platformRole,
  bookingId,
  eventType,
  payload,
}: CompleteRentalFulfillmentOptions): Promise<AdminRentalBookingDetail> {
  const current = await loadCurrentBooking(adminClient, bookingId);
  const requiredStatus = expectedStatus(eventType);
  const currentStatus = cleanText(current.status);
  if (currentStatus !== requiredStatus) {
    throw createError({
      statusCode: 422,
      statusMessage: `${eventType} requires a ${requiredStatus} booking`,
    });
  }

  const branchId = resolveEventBranch(current, payload);
  await assertBranchAccess(adminClient, userId, platformRole, branchId);
  await assertNoDuplicateEvent(adminClient, bookingId, eventType);
  if (eventType === "pickup") {
    if (cleanText(current.deposit_payment_status) !== "paid") {
      throw createError({
        statusCode: 422,
        statusMessage: "Pickup requires paid deposit/payment status",
      });
    }
    await assertPickupCustomerEvidence(adminClient, current);
  }

  const checklistId = await loadCompletedChecklist(
    adminClient,
    bookingId,
    eventType,
  );
  const depositPaidAmount = money(current.deposit_paid_amount);
  const refundAmount = money(payload.refundAmount);
  const refundStatus = REFUND_STATUSES.has(
    payload.refundStatus as RentalDepositRefundStatus,
  )
    ? (payload.refundStatus as RentalDepositRefundStatus)
    : depositPaidAmount > 0
      ? "pending"
      : "not_applicable";
  if (eventType === "return") {
    if (refundAmount > depositPaidAmount) {
      throw createError({
        statusCode: 422,
        statusMessage: "Refund amount cannot exceed deposit paid amount",
      });
    }
    await assertRefundProof(adminClient, bookingId, refundAmount, refundStatus);
  }

  const { signatureUrl, signaturePath } = await uploadSignature(
    adminClient,
    bookingId,
    eventType,
    payload.signatureDataUrl,
  );
  const eventAt = new Date().toISOString();
  const fulfillmentId = crypto.randomUUID();
  const { error: insertError } = await adminClient
    .from("rental_booking_fulfillments")
    .insert({
      id: fulfillmentId,
      booking_id: bookingId,
      event_type: eventType,
      status_after: statusAfter(eventType),
      booking_checklist_id: checklistId,
      branch_id: branchId,
      event_at: eventAt,
      idempotency_key: cleanText(payload.idempotencyKey),
      signature_url: signatureUrl,
      signature_storage_path: signaturePath,
      notes: cleanText(payload.notes),
      performed_by_user_id: userId,
    });
  if (insertError) {
    throw createError({
      statusCode: isUniqueViolation(insertError) ? 409 : 500,
      statusMessage: isUniqueViolation(insertError)
        ? `${eventType} was already recorded`
        : insertError.message,
    });
  }

  const updatePayload: Record<string, unknown> = {
    status: statusAfter(eventType),
  };
  if (eventType === "pickup") {
    updatePayload.pickup_at = eventAt;
    updatePayload.pickup_branch_id = branchId;
  } else {
    const refundNotes =
      cleanText(payload.refundNotes) ?? cleanText(payload.notes);
    updatePayload.returned_at = eventAt;
    updatePayload.return_branch_id = branchId;
    updatePayload.deposit_refund_status = refundStatus;
    updatePayload.deposit_refund_amount = refundAmount;
    updatePayload.deposit_refund_notes = refundNotes;
    updatePayload.deposit_refunded_at =
      refundStatus === "refunded" ? eventAt : null;
    if (refundStatus === "refunded") {
      updatePayload.deposit_payment_status =
        refundAmount >= depositPaidAmount ? "refunded" : "partial_refund";
    }
  }

  const { data: updated, error: updateError } = await adminClient
    .from("rental_bookings")
    .update(updatePayload)
    .eq("id", bookingId)
    .eq("status", requiredStatus)
    .select(ADMIN_RENTAL_BOOKING_DETAIL_SELECT)
    .maybeSingle();
  if (updateError) {
    await adminClient
      .from("rental_booking_fulfillments")
      .delete()
      .eq("id", fulfillmentId);
    throw createError({ statusCode: 500, statusMessage: updateError.message });
  }
  if (!updated) {
    await adminClient
      .from("rental_booking_fulfillments")
      .delete()
      .eq("id", fulfillmentId);
    throw createError({
      statusCode: 409,
      statusMessage: `${eventType} was already processed`,
    });
  }

  if (eventType === "return") {
    await insertReturnDepositLog(
      adminClient,
      userId,
      bookingId,
      branchId,
      current,
      refundStatus,
      refundAmount,
      cleanText(payload.refundNotes) ?? cleanText(payload.notes),
    );
  }

  const customer = await fetchAdminCustomerProfile(
    adminClient,
    String((updated as Record<string, unknown>).user_id ?? ""),
  );
  return mapAdminRentalBookingDetail(updated, customer);
}
