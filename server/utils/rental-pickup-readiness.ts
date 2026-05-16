import { createError } from "h3";
import {
  buildRentalMoneySummary,
  type RentalMoneySummary,
  type RentalMoneyWarning,
} from "~~/server/utils/rental-money-summary";

type Row = Record<string, unknown>;

export type PickupReadinessClassification = "ready" | "warning" | "blocked";
export type PickupReadinessReasonSeverity = "blocker" | "warning" | "info";

export interface PickupReadinessReason {
  code: string;
  severity: PickupReadinessReasonSeverity;
  message: string;
  context?: Record<string, unknown>;
}

export interface RentalPickupReadiness {
  booking: {
    id: string;
    reference: string;
    status: string;
    createdAt: string | null;
    source: {
      posBranchId: string | null;
      posBranchCode: string | null;
      posBranchName: string | null;
      posStaffUserId: string | null;
    };
  };
  customer: {
    kind: "account" | "walk_in" | "unknown";
    userId: string | null;
    displayName: string | null;
    phone: string | null;
    walkInPhone: string | null;
    kycStatus: string | null;
    idEvidencePresent: boolean;
  };
  rental: {
    assetId: string | null;
    assetCode: string | null;
    assetName: string | null;
    quantity: number;
    startDate: string;
    endDate: string;
    rentalDays: number;
    branchId: string | null;
    branchCode: string | null;
    branchName: string | null;
  };
  readiness: {
    classification: PickupReadinessClassification;
    canProceedToPickup: boolean;
    eligibleStatuses: string[];
    blockers: PickupReadinessReason[];
    warnings: PickupReadinessReason[];
  };
  moneySummary: RentalMoneySummary;
  moneyWarnings: RentalMoneyWarning[];
}

export const PICKUP_READINESS_BOOKING_SELECT =
  "id, user_id, walk_in_phone, status, asset_id, asset_code, asset_name, product_name, hub_id, hub_name, start_date, end_date, rental_days, currency_code, rental_total, deposit_amount, deposit_paid_amount, deposit_payment_status, deposit_refund_status, deposit_refund_amount, checkout_total_amount, checkout_paid_amount, booking_deposit_payment_status, booking_deposit_paid_amount, booker_name, booker_phone, created_at, pos_branch_id, pos_branch_code, pos_branch_name, pos_staff_user_id, asset:assets(storage_branch_id, store_branches(id, code, name_th, name_en))";

const PAYMENT_LINE_SELECT =
  "line_type, tax_category, description_th, description_en, gross_amount, wht_applicable, wht_rate, wht_amount, net_payable_amount, is_refundable, wht_certificate_required, applies_to_security_deposit, reduces_remaining_security_deposit, status, source, metadata";
const PICKUP_ELIGIBLE_STATUSES = ["confirmed"];

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  return text(value) || null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function assetBranch(booking: Row): Row {
  return row(row(booking.asset).store_branches);
}

function storageBranchId(booking: Row): string | null {
  return nullableText(row(booking.asset).storage_branch_id);
}

function resolvedBranch(input: Row) {
  const branch = assetBranch(input);
  return {
    id:
      nullableText(input.pos_branch_id) ??
      nullableText(input.hub_id) ??
      storageBranchId(input),
    code: nullableText(input.pos_branch_code) ?? nullableText(branch.code),
    name:
      nullableText(input.pos_branch_name) ??
      nullableText(input.hub_name) ??
      nullableText(branch.name_th) ??
      nullableText(branch.name_en),
  };
}

function reason(
  code: string,
  severity: PickupReadinessReasonSeverity,
  message: string,
  context?: Record<string, unknown>,
): PickupReadinessReason {
  return { code, severity, message, ...(context ? { context } : {}) };
}

function statusBlocker(status: string): PickupReadinessReason | null {
  if (PICKUP_ELIGIBLE_STATUSES.includes(status)) return null;
  const messages: Record<string, string> = {
    cancelled: "Cancelled bookings cannot proceed to pickup.",
    no_show: "No-show bookings cannot proceed to pickup readiness.",
    picked_up: "This booking has already been picked up.",
    returned: "This booking has already been returned.",
    draft: "Draft bookings must be confirmed before pickup readiness.",
  };
  return reason(
    "booking_status_not_pickup_eligible",
    "blocker",
    messages[status] ?? "Booking status is not eligible for pickup readiness.",
    { actualStatus: status, eligibleStatuses: PICKUP_ELIGIBLE_STATUSES },
  );
}

export function buildRentalPickupReadiness(input: {
  booking: Row;
  paymentLines?: unknown[] | null;
  customerProfile?: Row | null;
  walkInCustomer?: Row | null;
}): RentalPickupReadiness {
  const booking = input.booking;
  const profile = row(input.customerProfile);
  const walkIn = row(input.walkInCustomer);
  const moneySummary = buildRentalMoneySummary({
    booking,
    paymentLines: input.paymentLines ?? [],
  });
  const blockers: PickupReadinessReason[] = [];
  const warnings: PickupReadinessReason[] = [];
  const status = text(booking.status) || "unknown";
  const userId = nullableText(booking.user_id);
  const walkInPhone = userId
    ? nullableText(booking.walk_in_phone)
    : nullableText(booking.walk_in_phone) ?? nullableText(booking.booker_phone);
  const kycStatus = userId ? nullableText(profile.kyc_status) : null;
  const idEvidencePresent = userId
    ? Boolean(nullableText(profile.id_card_url))
    : Boolean(
        nullableText(walkIn.id_card_storage_path) ?? nullableText(walkIn.id_card_url),
      );
  const branch = resolvedBranch(booking);

  const statusReason = statusBlocker(status);
  if (statusReason) blockers.push(statusReason);

  if (!branch.id) {
    blockers.push(
      reason(
        "missing_pickup_branch_context",
        "blocker",
        "Pickup readiness requires a branch context from POS, hub, or asset storage branch.",
      ),
    );
  } else if (!nullableText(booking.pos_branch_id)) {
    warnings.push(
      reason(
        "missing_pos_branch_context",
        "warning",
        "Booking has no POS branch context; readiness falls back to hub or asset branch.",
      ),
    );
  }

  if (!nullableText(booking.pos_staff_user_id)) {
    warnings.push(
      reason(
        "missing_pos_staff_context",
        "warning",
        "Booking has no POS staff context; this is acceptable for legacy bookings but should be reviewed before pickup.",
      ),
    );
  }

  if (userId) {
    if (kycStatus !== "verified") {
      blockers.push(
        reason(
          "customer_kyc_not_verified",
          "blocker",
          "Pickup currently requires verified customer KYC for account bookings.",
          { kycStatus },
        ),
      );
    }
  } else if (walkInPhone) {
    if (!idEvidencePresent) {
      blockers.push(
        reason(
          "walk_in_id_evidence_missing",
          "blocker",
          "Pickup currently requires walk-in ID evidence before handover.",
        ),
      );
    }
  } else {
    blockers.push(
      reason(
        "customer_identity_missing",
        "blocker",
        "Pickup readiness requires an account customer or walk-in phone identity.",
      ),
    );
  }

  const startDate = text(booking.start_date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    const today = todayDateOnly();
    if (startDate > today) {
      warnings.push(
        reason(
          "pickup_date_in_future",
          "warning",
          "Booking pickup date is in the future; readiness can be reviewed but handover should wait until pickup day.",
          { startDate, today },
        ),
      );
    } else if (startDate < today) {
      warnings.push(
        reason(
          "pickup_date_in_past",
          "warning",
          "Booking pickup date is in the past; staff should verify whether this booking is still valid for handover.",
          { startDate, today },
        ),
      );
    }
  }

  for (const warning of moneySummary.warnings) {
    warnings.push(
      reason("money_summary_warning", "warning", warning.message, {
        moneyWarningCode: warning.code,
        severity: warning.severity,
        ...(warning.context ?? {}),
      }),
    );
  }

  const classification: PickupReadinessClassification = blockers.length
    ? "blocked"
    : warnings.length
      ? "warning"
      : "ready";

  return {
    booking: {
      id: text(booking.id),
      reference: text(booking.id),
      status,
      createdAt: nullableText(booking.created_at),
      source: {
        posBranchId: nullableText(booking.pos_branch_id),
        posBranchCode: nullableText(booking.pos_branch_code),
        posBranchName: nullableText(booking.pos_branch_name),
        posStaffUserId: nullableText(booking.pos_staff_user_id),
      },
    },
    customer: {
      kind: userId ? "account" : walkInPhone ? "walk_in" : "unknown",
      userId,
      displayName:
        nullableText(profile.full_name) ??
        nullableText(walkIn.full_name) ??
        nullableText(booking.booker_name),
      phone:
        nullableText(profile.phone) ?? walkInPhone ?? nullableText(booking.booker_phone),
      walkInPhone,
      kycStatus,
      idEvidencePresent,
    },
    rental: {
      assetId: nullableText(booking.asset_id),
      assetCode: nullableText(booking.asset_code),
      assetName:
        nullableText(booking.asset_name) ?? nullableText(booking.product_name),
      quantity: 1,
      startDate,
      endDate: text(booking.end_date),
      rentalDays: numberValue(booking.rental_days),
      branchId: branch.id,
      branchCode: branch.code,
      branchName: branch.name,
    },
    readiness: {
      classification,
      canProceedToPickup: classification !== "blocked",
      eligibleStatuses: [...PICKUP_ELIGIBLE_STATUSES],
      blockers,
      warnings,
    },
    moneySummary,
    moneyWarnings: moneySummary.warnings,
  };
}

export async function loadRentalPickupReadiness(input: {
  adminClient: { from: (table: string) => any };
  bookingId: string;
}): Promise<RentalPickupReadiness> {
  const { data: booking, error } = await input.adminClient
    .from("rental_bookings")
    .select(PICKUP_READINESS_BOOKING_SELECT)
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: "Rental booking not found" });
  }

  const bookingRow = booking as Row;
  const userId = text(bookingRow.user_id);
  const walkInPhone = text(bookingRow.walk_in_phone) || text(bookingRow.booker_phone);
  const [linesResult, userResult, walkInResult] = await Promise.all([
    input.adminClient
      .from("rental_booking_payment_lines")
      .select(PAYMENT_LINE_SELECT)
      .eq("booking_id", input.bookingId)
      .order("created_at", { ascending: true }),
    userId
      ? input.adminClient
          .from("users")
          .select("id, full_name, phone, kyc_status, id_card_url")
          .eq("id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    !userId && walkInPhone
      ? input.adminClient
          .from("walk_in_customers")
          .select("phone, full_name, id_card_url, id_card_storage_path")
          .eq("phone", walkInPhone)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (linesResult.error) {
    throw createError({ statusCode: 500, statusMessage: linesResult.error.message });
  }
  if (userResult.error) {
    throw createError({ statusCode: 500, statusMessage: userResult.error.message });
  }
  if (walkInResult.error) {
    throw createError({ statusCode: 500, statusMessage: walkInResult.error.message });
  }

  return buildRentalPickupReadiness({
    booking: bookingRow,
    paymentLines: linesResult.data ?? [],
    customerProfile: userResult.data,
    walkInCustomer: walkInResult.data,
  });
}

export async function assertPickupReadinessBranchAccess(input: {
  adminClient: { from: (table: string) => any };
  userId: string;
  platformRole: string;
  branchId: string | null;
}): Promise<void> {
  if (!input.branchId || input.platformRole === "super_admin") return;
  const { data, error } = await input.adminClient
    .from("admin_user_branch_access")
    .select("user_id")
    .eq("user_id", input.userId)
    .eq("branch_id", input.branchId)
    .eq("can_pos", true)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data) {
    throw createError({ statusCode: 403, statusMessage: "POS branch access required" });
  }
}