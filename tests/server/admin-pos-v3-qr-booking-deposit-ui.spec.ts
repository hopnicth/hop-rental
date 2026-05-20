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

  it("does not invent BDC document print UI because poll response has no document fields", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain(
      "Poll response does not expose document number or print link.",
    );
    expect(source).not.toContain("officialDocumentId");
    expect(source).not.toContain("openBookingDepositDocumentPrint");
    expect(source).not.toContain("พิมพ์เอกสารยืนยันการรับเงินมัดจำการจอง");
  });
});
