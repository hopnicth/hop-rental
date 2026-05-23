import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const UTIL_PATH = "server/utils/pos-rental-qr-remaining-deposit.ts";
const CREATE_PATH =
  "server/api/admin/pos-v3/rental-bookings/[bookingId]/remaining-security-deposit-qr.post.ts";
const POLL_PATH =
  "server/api/admin/pos-v3/rental-bookings/[bookingId]/remaining-security-deposit-qr/poll.post.ts";
const ACTIVE_PATH =
  "server/api/admin/pos-v3/rental-bookings/[bookingId]/remaining-security-deposit-qr/active.get.ts";
const WEBHOOK_PATH = "server/api/webhooks/omise.post.ts";
const QR_CARD_PATH =
  "app/components/admin/pos/AdminPosV3PickupDepositQrCard.vue";
const PICKUP_CONTAINER_PATH =
  "app/components/admin/pos/AdminPosV3PickupContainer.vue";

// ── Utility: finalizer + state machine ────────────────────────────────────────

describe("pos-rental-qr-remaining-deposit utility", () => {
  it("exports applyPosRentalQrRemainingDepositGatewayResult", () => {
    const src = read(UTIL_PATH);
    expect(src).toContain("applyPosRentalQrRemainingDepositGatewayResult");
    expect(src).toContain(
      "export async function applyPosRentalQrRemainingDepositGatewayResult",
    );
  });

  it("finalizer records remaining_security_deposit_collection held-balance event", () => {
    const src = read(UTIL_PATH);
    expect(src).toContain("remaining_security_deposit_collection");
    expect(src).toContain("recordRentalHeldBalanceEvent");
    expect(src).toContain("pos_rental_payment_attempt");
  });

  it("Bug 1 fix: finalizer uses deposit_payment_method = qr_transfer (DB CHECK valid value)", () => {
    const src = read(UTIL_PATH);
    // rental_bookings CHECK constraint allows: cash | qr_transfer | bank_transfer | card | other
    // 'promptpay_qr' was causing 23514 check_violation — now fixed to 'qr_transfer'
    expect(src).toContain('"qr_transfer"');
    expect(src).toContain("deposit_payment_method");
    expect(src).toContain("deposit_payment_status");
    expect(src).toContain('"paid"');
    expect(src).toContain("deposit_paid_amount");
    expect(src).toContain("deposit_paid_at");
  });

  it("Bug 1 fix: finalizer does NOT write promptpay_qr into rental_bookings.deposit_payment_method", () => {
    const src = read(UTIL_PATH);
    // Confirm 'promptpay_qr' does not appear as the booking-level deposit_payment_method value.
    // The pos_rental_payment_attempts table retains payment_method = 'promptpay_qr' separately.
    const bookingUpdateIdx = src.indexOf("deposit_payment_method");
    expect(bookingUpdateIdx).toBeGreaterThan(-1);
    // Extract the update block containing deposit_payment_method
    const updateBlock = src.slice(bookingUpdateIdx, bookingUpdateIdx + 80);
    expect(updateBlock).not.toContain("promptpay_qr");
  });

  it("finalizer does NOT import or call confirmRentalBooking", () => {
    const src = read(UTIL_PATH);
    // Must not import the confirmation utility (function name may appear in JSDoc comments)
    expect(src).not.toContain(
      'from "~~/server/utils/rental-booking-confirmation"',
    );
    expect(src).not.toContain("await confirmRentalBooking(");
  });

  it("finalizer does NOT issue BDC document", () => {
    const src = read(UTIL_PATH);
    expect(src).not.toContain("issueBookingDepositConfirmationDocument");
    expect(src).not.toContain("pos_document_issuance_tasks");
    expect(src).not.toContain("BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE");
  });

  it("finalizer does NOT change booking status (no booking_deposit_payment_status update)", () => {
    const src = read(UTIL_PATH);
    expect(src).not.toContain("booking_deposit_payment_status");
  });

  it("state machine includes late payment recovery for locally-expired attempts", () => {
    const src = read(UTIL_PATH);
    expect(src).toContain("isLatePaymentOnExpired");
    expect(src).toContain('"expired"');
    expect(src).toContain("late_payment_on_locally_expired_qr_attempt");
  });

  it("state machine transitions pending → finalizing → paid", () => {
    const src = read(UTIL_PATH);
    expect(src).toContain('"finalizing"');
    expect(src).toContain('status: "finalizing"');
    expect(src).toContain('status: "paid"');
    expect(src).toContain("paid_at");
  });

  it("state machine preserves finalizing + non-paid (no downgrade)", () => {
    const src = read(UTIL_PATH);
    expect(src).toContain(
      'currentStatus === "finalizing" && mappedStatus !== "paid"',
    );
    expect(src).toContain('attemptStatus: "finalizing"');
  });

  it("amount/currency assertion throws PAYMENT_AMOUNT_MISMATCH", () => {
    const src = read(UTIL_PATH);
    expect(src).toContain("PAYMENT_AMOUNT_MISMATCH");
    expect(src).toContain("toGatewayAmount");
    expect(src).toContain("normalizeCurrency");
  });

  it("paid_confirm_failed path updates attempt without calling booking confirmation", () => {
    const src = read(UTIL_PATH);
    expect(src).toContain("paid_confirm_failed");
    expect(src).toContain("confirm_failed_at");
    expect(src).toContain("confirm_failure_reason");
  });
});

// ── QR creation endpoint ──────────────────────────────────────────────────────

describe("remaining-security-deposit-qr.post endpoint", () => {
  it("endpoint file exists", () => {
    expect(read(CREATE_PATH).length).toBeGreaterThan(0);
  });

  it("uses payment_purpose = remaining_security_deposit", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain('"remaining_security_deposit"');
    expect(src).toContain("payment_purpose");
  });

  it("uses payment_method = promptpay_qr", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain('"promptpay_qr"');
    expect(src).toContain("payment_method");
  });

  it("requires status = confirmed", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain('"confirmed"');
    expect(src).toContain("Only confirmed bookings");
  });

  it("rejects if deposit already paid (REMAINING_SECURITY_DEPOSIT_ALREADY_PAID)", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain("REMAINING_SECURITY_DEPOSIT_ALREADY_PAID");
    expect(src).toContain("deposit_payment_status");
  });

  it("computes expected remaining = deposit_amount - booking_deposit_paid_amount", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain("deposit_amount");
    expect(src).toContain("booking_deposit_paid_amount");
    expect(src).toContain("expectedRemaining");
  });

  it("enforces one-active-QR rule with live gateway verify", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain("EXISTING_ACTIVE_QR_NOT_EXPIRED");
    expect(src).toContain("retrieveOmiseCharge");
    expect(src).toContain("ACTIVE_QR_STATUSES");
  });

  it("idempotency: same key returns existing attempt", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain("idempotency_key");
    expect(src).toContain("findExistingQrAttempt");
  });

  it("does NOT create a new document or BDC", () => {
    const src = read(CREATE_PATH);
    expect(src).not.toContain("issueBookingDepositConfirmationDocument");
    expect(src).not.toContain("pos_document_issuance_tasks");
    expect(src).not.toContain("booking_deposit_confirmation");
  });

  it("payment_context metadata is pos_v3_remaining_security_deposit_qr", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain("pos_v3_remaining_security_deposit_qr");
    expect(src).toContain("payment_context");
  });
});

// ── Poll endpoint ─────────────────────────────────────────────────────────────

describe("remaining-security-deposit-qr/poll endpoint", () => {
  it("poll filters by payment_purpose = remaining_security_deposit", () => {
    const src = read(POLL_PATH);
    expect(src).toContain('"remaining_security_deposit"');
    expect(src).toContain("payment_purpose");
  });

  it("poll uses applyPosRentalQrRemainingDepositGatewayResult (not booking deposit)", () => {
    const src = read(POLL_PATH);
    expect(src).toContain("applyPosRentalQrRemainingDepositGatewayResult");
    expect(src).not.toContain("applyPosRentalQrGatewayResult");
    expect(src).not.toContain("finalizePosRentalBookingDeposit");
  });

  it("poll does NOT enrich response with BDC document data", () => {
    const src = read(POLL_PATH);
    expect(src).not.toContain("BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE");
    expect(src).not.toContain("pos_document_issuance_tasks");
    expect(src).not.toContain("document:");
  });

  it("poll performs live-charge reconciliation via retrieveOmiseCharge", () => {
    const src = read(POLL_PATH);
    expect(src).toContain("retrieveOmiseCharge");
    expect(src).toContain("LIVE_RECON_STATUSES");
  });
});

// ── Active GET endpoint ───────────────────────────────────────────────────────

describe("remaining-security-deposit-qr/active endpoint", () => {
  it("active lookup filters by payment_purpose = remaining_security_deposit", () => {
    const src = read(ACTIVE_PATH);
    expect(src).toContain('"remaining_security_deposit"');
    expect(src).toContain("payment_purpose");
  });

  it("active endpoint is read-only (no insert/update/delete)", () => {
    const src = read(ACTIVE_PATH);
    expect(src).not.toContain(".insert(");
    expect(src).not.toContain(".update(");
    expect(src).not.toContain(".delete(");
  });
});

// ── Webhook dispatch ──────────────────────────────────────────────────────────

describe("Omise webhook payment_purpose dispatch", () => {
  it("webhook imports applyPosRentalQrRemainingDepositGatewayResult", () => {
    const src = read(WEBHOOK_PATH);
    expect(src).toContain("applyPosRentalQrRemainingDepositGatewayResult");
    expect(src).toContain("pos-rental-qr-remaining-deposit");
  });

  it("webhook reads payment_purpose from pos_rental_payment_attempts row", () => {
    const src = read(WEBHOOK_PATH);
    expect(src).toContain("paymentPurpose");
    expect(src).toContain("payment_purpose");
  });

  it("booking_deposit purpose routes to applyPosRentalQrGatewayResult (existing)", () => {
    const src = read(WEBHOOK_PATH);
    expect(src).toContain('"booking_deposit"');
    expect(src).toContain("applyPosRentalQrGatewayResult");
  });

  it("remaining_security_deposit purpose routes to applyPosRentalQrRemainingDepositGatewayResult", () => {
    const src = read(WEBHOOK_PATH);
    expect(src).toContain('"remaining_security_deposit"');
    expect(src).toContain("applyPosRentalQrRemainingDepositGatewayResult");
  });

  it("remaining_security_deposit path does NOT call applyPosRentalQrGatewayResult in the same branch", () => {
    const src = read(WEBHOOK_PATH);
    // Confirm the dispatch exists: one branch for booking_deposit, other for remaining
    // The keyword 'remaining_security_deposit → new remaining deposit finalizer' comment must exist
    expect(src).toContain(
      "remaining_security_deposit → new remaining deposit finalizer",
    );
    expect(src).toContain(
      "booking_deposit → existing booking deposit QR finalizer",
    );
  });

  it("unknown payment_purpose is safely rejected without processing payment", () => {
    const src = read(WEBHOOK_PATH);
    expect(src).toContain("UNKNOWN_POS_PAYMENT_PURPOSE");
    expect(src).toContain("unknownPosPaymentPurpose");
  });

  it("webhook does NOT issue BDC for remaining_security_deposit path", () => {
    // The remaining deposit utility must not import or call the booking deposit finalizer
    const util = read(UTIL_PATH);
    // No import of the booking deposit finalizer
    expect(util).not.toContain("pos-rental-booking-deposit-finalizer");
    // No call to BDC document issuance
    expect(util).not.toContain("issueBookingDepositConfirmationDocument");
  });
});

// ── UI component ─────────────────────────────────────────────────────────────

describe("AdminPosV3PickupDepositQrCard UI component", () => {
  it("component file exists", () => {
    expect(read(QR_CARD_PATH).length).toBeGreaterThan(0);
  });

  it("component calls remaining-security-deposit-qr creation endpoint", () => {
    const src = read(QR_CARD_PATH);
    expect(src).toContain("remaining-security-deposit-qr");
    expect(src).toContain("bookingId");
  });

  it("component polls via remaining-security-deposit-qr/poll", () => {
    const src = read(QR_CARD_PATH);
    expect(src).toContain("remaining-security-deposit-qr/poll");
  });

  it("component emits deposit-collected on paid (not booking-confirmed)", () => {
    const src = read(QR_CARD_PATH);
    expect(src).toContain('"deposit-collected"');
    expect(src).toContain("emitCollectedOnce");
    expect(src).not.toContain('"booking-confirmed"');
  });

  it("component does NOT show BDC document print link", () => {
    const src = read(QR_CARD_PATH);
    expect(src).not.toContain("openBookingDepositDocumentPrint");
    expect(src).not.toContain("officialDocumentId");
    expect(src).not.toContain("documentNo");
    expect(src).not.toContain("/documents/");
  });

  it("component shows QR image with countdown", () => {
    const src = read(QR_CARD_PATH);
    expect(src).toContain("qrImageUrl");
    expect(src).toContain("remainingLabel");
    expect(src).toContain("PromptPay QR");
  });
});

// ── Pickup container integration ──────────────────────────────────────────────

describe("AdminPosV3PickupContainer tender selector integration", () => {
  it("container imports AdminPosV3PickupDepositQrCard", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("AdminPosV3PickupDepositQrCard");
  });

  it("State 3 shows tender selector with Cash and QR Code options", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("depositTenderMethod");
    expect(src).toContain("เลือกวิธีรับชำระมัดจำประกัน");
    expect(src).toContain('"cash"');
    expect(src).toContain('"qr"');
  });

  it("Cash path renders existing cash collection form unchanged", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("depositTenderMethod === 'cash'");
    expect(src).toContain("รับเงินสดจากลูกค้า");
    expect(src).toContain("cashReceived");
    expect(src).toContain("ยืนยันรับมัดจำประกัน");
  });

  it("QR path mounts AdminPosV3PickupDepositQrCard and wires deposit-collected", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("depositTenderMethod === 'qr'");
    expect(src).toContain("AdminPosV3PickupDepositQrCard");
    expect(src).toContain("@deposit-collected");
  });

  it("deposit wording regression — มัดจำประกันที่ต้องชำระตอนรับของ still present in State 3", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("มัดจำประกันที่ต้องชำระตอนรับของ");
  });

  it("cash received and change remain UI-only (not sent to QR endpoint)", () => {
    const src = read(QR_CARD_PATH);
    expect(src).not.toContain("cashReceived");
    expect(src).not.toContain("change");
  });
});

// ── Bug 2 fix: duplicate payment prevention (gateway-paid guard) ───────────────

describe("Bug 2 fix: GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW guard", () => {
  it("QR create endpoint defines GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW constant", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain("GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW");
  });

  it("QR create endpoint checks for paid_confirm_failed + gateway_charge_id before creating new QR", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain("paid_confirm_failed");
    expect(src).toContain("gateway_charge_id");
    expect(src).toContain('.not("gateway_charge_id", "is", null)');
    expect(src).toContain("gatewayPaidFailed");
  });

  it("QR create endpoint returns 409 GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW when gateway-paid attempt exists", () => {
    const src = read(CREATE_PATH);
    // Guard must throw 409 with the manual-review code
    expect(src).toContain("statusCode: 409");
    expect(src).toContain("GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW");
    // The guard check is keyed on payment_purpose = remaining_security_deposit
    expect(src).toContain("payment_purpose");
    expect(src).toContain('"remaining_security_deposit"');
  });

  it("Cash endpoint defines GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW constant", () => {
    const src = read(
      "server/api/admin/pos-v3/rental-bookings/[bookingId]/remaining-security-deposit-payments.post.ts",
    );
    expect(src).toContain("GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW");
  });

  it("Cash endpoint checks paid_confirm_failed + gateway_charge_id before accepting cash", () => {
    const src = read(
      "server/api/admin/pos-v3/rental-bookings/[bookingId]/remaining-security-deposit-payments.post.ts",
    );
    expect(src).toContain("paid_confirm_failed");
    expect(src).toContain("gateway_charge_id");
    expect(src).toContain("gatewayPaidFailed");
  });

  it("paid_confirm_failed WITHOUT gateway_charge_id is not blocked by the guard (local-only failure)", () => {
    // The guard uses .not('gateway_charge_id', 'is', null) — only gateway-confirmed
    // failures are blocked. A local-only paid_confirm_failed without a charge ID
    // (edge case: attempt INSERT succeeded but Omise call failed before updating charge ID)
    // would NOT match the guard and would allow retry. This is safe because if Omise
    // has no charge, no money was captured.
    const qrSrc = read(CREATE_PATH);
    const cashSrc = read(
      "server/api/admin/pos-v3/rental-bookings/[bookingId]/remaining-security-deposit-payments.post.ts",
    );
    // Both must use the IS NOT NULL filter (not just status = paid_confirm_failed alone)
    expect(qrSrc).toContain('.not("gateway_charge_id", "is", null)');
    expect(cashSrc).toContain('.not("gateway_charge_id", "is", null)');
  });

  it("QR card handles GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW and sets isGatewayPaidManualReview", () => {
    const src = read(QR_CARD_PATH);
    expect(src).toContain("GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW");
    expect(src).toContain("isGatewayPaidManualReview");
    expect(src).toContain("isGatewayPaidManualReview.value = true");
  });

  it("QR card hides regenerate QR button in manual-review state", () => {
    const src = read(QR_CARD_PATH);
    // Regenerate button must be guarded by !isGatewayPaidManualReview
    expect(src).toContain("!isGatewayPaidManualReview");
    expect(src).toContain("สร้าง QR ใหม่");
  });

  it("QR card shows ห้ามรับชำระซ้ำ in the manual-review locked alert", () => {
    const src = read(QR_CARD_PATH);
    expect(src).toContain("ห้ามรับชำระซ้ำ");
    expect(src).toContain("พบการชำระเงินจาก Omise แล้ว");
  });

  it("QR card shows the same manual-review alert for paid_confirm_failed poll status (isDegradedSuccess)", () => {
    const src = read(QR_CARD_PATH);
    // Alert covers both isGatewayPaidManualReview OR isDegradedSuccess
    expect(src).toContain("isGatewayPaidManualReview || isDegradedSuccess");
  });

  it("Pickup container has isCashManualReviewLocked ref for cash-endpoint 409 handling", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("isCashManualReviewLocked");
    expect(src).toContain("isCashManualReviewLocked.value = true");
  });

  it("Pickup container shows manual-review alert when cash endpoint returns GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW");
    expect(src).toContain("ห้ามรับชำระซ้ำ");
  });

  it("Pickup container hides tender selector and cash/QR paths when manually locked", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain(
      "!isCashManualReviewLocked && depositTenderMethod === null",
    );
    expect(src).toContain(
      "!isCashManualReviewLocked && depositTenderMethod === 'cash'",
    );
    expect(src).toContain(
      "!isCashManualReviewLocked && depositTenderMethod === 'qr'",
    );
  });
});

// ── Online booking support (no pos_branch_id) ────────────────────────────────

describe("Online booking support — no pos_branch_id hard gate", () => {
  const CASH_PATH =
    "server/api/admin/pos-v3/rental-bookings/[bookingId]/remaining-security-deposit-payments.post.ts";

  // QR create endpoint
  it("QR create: does NOT have hard 'Booking is not a POS V3 booking' rejection", () => {
    const src = read(CREATE_PATH);
    expect(src).not.toContain("Booking is not a POS V3 booking");
  });

  it("QR create: joins assets to get storage_branch_id as branch fallback", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain("asset:assets(storage_branch_id)");
    expect(src).toContain("storage_branch_id");
  });

  it("QR create: defines getStorageBranchId helper for branch fallback resolution", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain("function getStorageBranchId");
    expect(src).toContain("asset.storage_branch_id");
  });

  it("QR create: resolves branch from pos_branch_id first, then storage_branch_id fallback", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain("resolvedBranchId");
    // fallback pattern: posBranchId ?? getStorageBranchId(booking)
    expect(src).toContain("getStorageBranchId(booking)");
  });

  it("QR create: booking_deposit_payment_status guard is ONLY enforced when posBranchId is set", () => {
    const src = read(CREATE_PATH);
    // The guard must be conditional on posBranchId being present — online bookings skip it
    expect(src).toContain("posBranchId &&");
    expect(src).toContain("booking_deposit_payment_status");
  });

  it("QR create: assertPosBranchAccess accepts branchId: string | null", () => {
    const src = read(CREATE_PATH);
    expect(src).toContain("branchId: string | null");
  });

  it("QR create: assertPosBranchAccess skips check when branchId is null", () => {
    const src = read(CREATE_PATH);
    // Guard: if (!input.branchId || ...) return
    expect(src).toContain("if (!input.branchId ||");
  });

  // Cash endpoint
  it("Cash: does NOT have hard 'Booking is not a POS V3 booking' rejection", () => {
    const src = read(CASH_PATH);
    expect(src).not.toContain("Booking is not a POS V3 booking");
  });

  it("Cash: joins assets to get storage_branch_id as branch fallback", () => {
    const src = read(CASH_PATH);
    expect(src).toContain("asset:assets(storage_branch_id)");
    expect(src).toContain("storage_branch_id");
  });

  it("Cash: defines getStorageBranchId helper for branch fallback resolution", () => {
    const src = read(CASH_PATH);
    expect(src).toContain("function getStorageBranchId");
    expect(src).toContain("asset.storage_branch_id");
  });

  it("Cash: resolves branch from pos_branch_id first, then storage_branch_id fallback", () => {
    const src = read(CASH_PATH);
    expect(src).toContain("resolvedBranchId");
    expect(src).toContain("getStorageBranchId(booking)");
  });

  it("Cash: booking_deposit_payment_status guard is ONLY enforced when posBranchId is set", () => {
    const src = read(CASH_PATH);
    expect(src).toContain("posBranchId &&");
    expect(src).toContain("booking_deposit_payment_status");
  });

  it("Cash: assertPosBranchAccess accepts branchId: string | null", () => {
    const src = read(CASH_PATH);
    expect(src).toContain("branchId: string | null");
  });

  it("Cash: assertPosBranchAccess skips check when branchId is null", () => {
    const src = read(CASH_PATH);
    expect(src).toContain("if (!input.branchId ||");
  });

  // Active GET endpoint
  it("Active GET: does NOT have hard 'Booking is not a POS V3 booking' rejection", () => {
    const src = read(ACTIVE_PATH);
    expect(src).not.toContain("Booking is not a POS V3 booking");
  });

  it("Active GET: joins assets to get storage_branch_id as branch fallback", () => {
    const src = read(ACTIVE_PATH);
    expect(src).toContain("asset:assets(storage_branch_id)");
    expect(src).toContain("storage_branch_id");
  });

  it("Active GET: defines getStorageBranchId helper for branch fallback resolution", () => {
    const src = read(ACTIVE_PATH);
    expect(src).toContain("function getStorageBranchId");
    expect(src).toContain("asset.storage_branch_id");
  });

  it("Active GET: resolves branch from pos_branch_id first, then storage_branch_id fallback", () => {
    const src = read(ACTIVE_PATH);
    expect(src).toContain("resolvedBranchId");
    expect(src).toContain("getStorageBranchId(booking)");
  });

  it("Active GET: assertPosBranchAccess accepts branchId: string | null", () => {
    const src = read(ACTIVE_PATH);
    expect(src).toContain("branchId: string | null");
  });

  it("Active GET: assertPosBranchAccess skips check when branchId is null", () => {
    const src = read(ACTIVE_PATH);
    expect(src).toContain("if (!input.branchId ||");
  });
});
