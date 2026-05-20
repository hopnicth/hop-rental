import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const PAGE_PATH = "app/pages/admin/pos-v3/index.vue";
const QR_CONTAINER_PATH =
  "app/components/admin/pos/AdminPosV3FutureBookingDepositQrContainer.vue";
const CASH_CONTAINER_PATH =
  "app/components/admin/pos/AdminPosV3FutureBookingDepositCashContainer.vue";

describe("admin POS V3 Phase 2D-B3 — QR booking deposit UI", () => {
  it("adds the parent payment method selector state and resets it for each new draft", () => {
    const page = read(PAGE_PATH);
    expect(page).toContain("selectedPaymentMethod");
    expect(page).toContain("FutureBookingDepositPaymentMethod");
    expect(page).toContain("selectedPaymentMethod.value = null");
    expect(page).toContain("function selectPaymentMethod");
  });

  it("renders the payment method selector only after a valid future draft exists", () => {
    const page = read(PAGE_PATH);
    expect(page).toContain("เลือกวิธีรับเงินมัดจำการจอง");
    expect(page).toContain("latestDraftResult !== null");
    expect(page).toContain("selectedPaymentMethod === null");
    expect(page).toContain("selectPaymentMethod('cash')");
    expect(page).toContain("selectPaymentMethod('promptpay_qr')");
  });

  it("mounts Cash vs PromptPay QR containers from the selected parent method", () => {
    const page = read(PAGE_PATH);
    expect(page).toContain("AdminPosV3FutureBookingDepositCashContainer");
    expect(page).toContain("AdminPosV3FutureBookingDepositQrContainer");
    expect(page).toContain("selectedPaymentMethod === 'cash'");
    expect(page).toContain("selectedPaymentMethod === 'promptpay_qr'");
    expect(page).toContain(':draft-result="latestDraftResult"');
    expect(page).toContain('@booking-confirmed="handleBookingConfirmed"');
  });

  it("leaves the existing Cash container source behaviorally separate from PromptPay QR", () => {
    const cash = read(CASH_CONTAINER_PATH);
    expect(cash).toContain("booking-deposit-payments");
    expect(cash).toContain('paymentMethod: "cash"');
    expect(cash).not.toContain("booking-deposit-qr");
    expect(cash).not.toContain("promptpay_qr");
  });

  it("creates the new QR container with aligned props and booking-confirmed emit", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain(
      "defineProps<{ draftResult: DraftBookingResult }>",
    );
    expect(source).toContain('"booking-confirmed"');
    expect(source).toContain('emit("booking-confirmed"');
    expect(source).toContain('paymentMethod: "promptpay_qr"');
  });

  it("calls the QR creation endpoint with idempotencyKey and bookingDepositDueNow amount", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("async function createQrAttempt");
    expect(source).toContain("crypto.randomUUID()");
    expect(source).toContain("booking-deposit-qr");
    expect(source).toContain("idempotencyKey: idempotencyKey.value");
    expect(source).toContain(
      "amount: props.draftResult.quote.bookingDepositDueNow",
    );
    expect(source).toContain("onMounted");
    expect(source).toContain("void createQrAttempt()");
  });

  it("models the exact B2 QR response contract fields and statuses", () => {
    const source = read(QR_CONTAINER_PATH);
    for (const field of [
      "paymentAttemptId",
      "qrImageUrl",
      "amount",
      "currency",
      "expiresAt",
      "status",
    ]) {
      expect(source).toContain(field);
    }
    for (const status of [
      "pending",
      "requires_action",
      "finalizing",
      "paid",
      "paid_confirm_failed",
      "expired",
      "failed",
      "cancelled",
    ]) {
      expect(source).toContain(`"${status}"`);
    }
  });

  it("treats requires_action as a non-terminal QR-visible state (Phase 2D-B2.2 resilience)", () => {
    const source = read(QR_CONTAINER_PATH);
    // terminalStatuses must contain the 5 expected terminal states
    expect(source).toContain('"paid"');
    expect(source).toContain('"paid_confirm_failed"');
    expect(source).toContain('"expired"');
    expect(source).toContain('"failed"');
    expect(source).toContain('"cancelled"');
    // requires_action must NOT appear in terminalStatuses — checked by absence of the pattern
    // that would place it as a terminal array element:
    expect(source).not.toContain('"requires_action",\n  "finalizing"');
    expect(source).not.toContain('"requires_action",\n  "paid"');
    // isRequiresAction computed must be defined
    expect(source).toContain('attempt.value?.status === "requires_action"');
    // QR image container stays visible when requires_action
    expect(source).toContain("isPending || isRequiresAction || isFinalizing");
    // Polling continues on requires_action
    expect(source).toContain('"requires_action", "finalizing"');
    // isLocallyPastExpiry includes requires_action for countdown UI
    expect(source).toContain("isPending.value || isRequiresAction.value");
  });

  it("implements countdown as visual-only state and does not finalize locally", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("expiresAtMs");
    expect(source).toContain("remainingSeconds");
    expect(source).toContain("remainingLabel");
    expect(source).toContain("isLocallyPastExpiry");
    expect(source).toContain("ระบบจะยังใช้ผลจาก backend เป็นสถานะจริง");
    expect(source).not.toContain("finalizePosRentalBookingDeposit");
    expect(source).not.toContain("applyPosRentalQrGatewayResult");
  });

  it("polls every 3 seconds without overlapping requests and stops on terminal states", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("async function pollQrAttempt");
    expect(source).toContain("booking-deposit-qr/poll");
    expect(source).toContain(
      "paymentAttemptId: attempt.value.paymentAttemptId",
    );
    expect(source).toContain(
      "if (!attempt.value || isPolling.value || isTerminalStatus.value) return",
    );
    expect(source).toContain("setInterval(() => void pollQrAttempt(), 3000)");
    expect(source).toContain("terminalStatuses.includes(result.status)");
    expect(source).toContain("stopPolling()");
  });

  it("cleans up polling and ticker timers on component unmount", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("onBeforeUnmount");
    expect(source).toContain("componentActive = false");
    expect(source).toContain("stopPolling()");
    expect(source).toContain("stopTicker()");
    expect(source).toContain("clearInterval(pollHandle)");
    expect(source).toContain("clearInterval(tickHandle)");
  });

  it("renders state-specific UI for pending, finalizing, paid, and paid_confirm_failed", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("สแกน QR เพื่อชำระเงินมัดจำการจอง");
    expect(source).toContain(
      "เมื่อลูกค้าชำระสำเร็จ ระบบจะยืนยันการจองให้อัตโนมัติ",
    );
    expect(source).toContain("ตรวจพบการชำระเงินแล้ว");
    expect(source).toContain(
      "กำลังยืนยันการจองและเตรียมข้อมูลที่เกี่ยวข้อง กรุณารอสักครู่",
    );
    expect(source).toContain("Booking Deposit received");
    expect(source).toContain("ได้รับชำระเงินแล้ว · ต้องตรวจสอบด้วยตนเอง");
    expect(source).toContain("Staff must not collect payment again");
  });

  it("renders expired and failed states with regeneration", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("QR หมดเวลาแล้ว");
    expect(source).toContain("การชำระเงินผ่าน QR ไม่สำเร็จ");
    expect(source).toContain("canRegenerate");
    expect(source).toContain("สร้าง QR ใหม่");
    expect(source).toContain('@click="createQrAttempt"');
    expect(source).toContain("idempotencyKey.value = crypto.randomUUID()");
  });

  it("handles 409 EXISTING_ACTIVE_QR_NOT_EXPIRED by resuming active attempt instead of showing error", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("EXISTING_ACTIVE_QR_NOT_EXPIRED");
    expect(source).toContain("isExistingActiveQrConflict");
    expect(source).toContain("resumeExistingActiveAttempt");
    expect(source).toContain("booking-deposit-qr/active");
  });

  // ── Phase 2D-B7: Print BDC CTA ────────────────────────────────────────────

  it("B7: QrAttemptResponse interface includes optional document field", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("officialDocumentId");
    expect(source).toContain("documentNo");
    expect(source).toContain("issuanceStatus");
    // field is on the interface (optional)
    expect(source).toContain("document?:");
  });

  it("B7: isDocumentIssued computed is defined and gates on officialDocumentId", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("isDocumentIssued");
    expect(source).toContain("isPaid.value");
    expect(source).toContain("attempt.value?.document?.officialDocumentId");
  });

  it("B7: openBookingDepositDocumentPrint function opens print route with bookingId query param", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("openBookingDepositDocumentPrint");
    expect(source).toContain("/admin/documents/");
    expect(source).toContain("/print?bookingId=");
    expect(source).toContain("window.open(");
    expect(source).toContain('"_blank"');
  });

  it("B7: print button uses correct Thai label", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("พิมพ์ใบยืนยันรับเงินมัดจำการจอง");
  });

  it("B7: print CTA is gated on isPaid && isDocumentIssued — not shown for finalizing or paid_confirm_failed", () => {
    const source = read(QR_CONTAINER_PATH);
    // Print CTA appears only inside v-if with isDocumentIssued condition
    expect(source).toContain("isPaid && isDocumentIssued");
    // paid_confirm_failed must not reach the print CTA section
    expect(source).not.toContain("isDegradedSuccess && isDocumentIssued");
  });

  it("B7: document-not-ready fallback note shown for paid without document", () => {
    const source = read(QR_CONTAINER_PATH);
    // The v-else-if for paid but no doc
    expect(source).toContain("isPaid && !isDocumentIssued");
    expect(source).toContain("เอกสารยังไม่พร้อม");
  });

  it("B7: Booking Detail secondary link present in paid success state", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("เปิด Booking Detail");
    expect(source).toContain(
      "/admin/rental-bookings/${draftResult.booking.id}",
    );
  });
});

// ── Phase 2D-B3.2: Session Buffer Lifecycle ───────────────────────────────────

describe("admin POS V3 QR container Phase 2D-B3.2 session buffer lifecycle", () => {
  it("imports QR_SESSION_BUFFER_KEY from pos-qr-session-restore", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("QR_SESSION_BUFFER_KEY");
    expect(source).toContain("pos-qr-session-restore");
  });

  it("defines writeSessionBuffer that writes to sessionStorage with required fields", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("writeSessionBuffer");
    expect(source).toContain("sessionStorage.setItem");
    expect(source).toContain("QR_SESSION_BUFFER_KEY");
    expect(source).toContain("future_booking_qr_deposit");
    expect(source).toContain("promptpay_qr");
    expect(source).toContain("resumeUntil");
  });

  it("defines clearSessionBuffer that removes QR_SESSION_BUFFER_KEY from sessionStorage", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("clearSessionBuffer");
    expect(source).toContain("sessionStorage.removeItem");
  });

  it("calls writeSessionBuffer after successful QR creation (createQrAttempt)", () => {
    const source = read(QR_CONTAINER_PATH);
    // writeSessionBuffer must be called right after attempt.value = result in createQrAttempt
    expect(source).toContain(
      "writeSessionBuffer(props.draftResult.booking.id, result.expiresAt)",
    );
  });

  it("calls writeSessionBuffer after resuming active attempt (resumeExistingActiveAttempt)", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain(
      "writeSessionBuffer(props.draftResult.booking.id, active.expiresAt)",
    );
  });

  it("calls clearSessionBuffer when poll reaches a terminal status", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("terminalStatuses.includes(result.status)");
    expect(source).toContain("clearSessionBuffer()");
  });

  it("calls clearSessionBuffer inside resetAttemptState so regeneration always clears the buffer", () => {
    const source = read(QR_CONTAINER_PATH);
    // clearSessionBuffer must appear inside the resetAttemptState function body
    const resetIdx = source.indexOf("function resetAttemptState()");
    const clearIdx = source.indexOf("clearSessionBuffer()", resetIdx);
    expect(resetIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeGreaterThan(resetIdx);
  });

  it("writeSessionBuffer guards against null/undefined expiresAt before writing", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("if (!expiresAt) return");
  });

  it("writeSessionBuffer and clearSessionBuffer are both wrapped in try/catch for SSR/private-browsing safety", () => {
    const source = read(QR_CONTAINER_PATH);
    // Both functions should have try/catch guards
    const writeIdx = source.indexOf("function writeSessionBuffer");
    const clearIdx = source.indexOf("function clearSessionBuffer");
    const writeTryIdx = source.indexOf("try {", writeIdx);
    const clearTryIdx = source.indexOf("try {", clearIdx);
    expect(writeTryIdx).toBeGreaterThan(writeIdx);
    expect(clearTryIdx).toBeGreaterThan(clearIdx);
  });
});
