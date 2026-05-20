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
    // Phase 2D-B3.2: onMounted now calls mountOrResumeQrAttempt which calls createQrAttempt
    expect(source).toContain("void mountOrResumeQrAttempt()");
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

  // ── Phase 2D-B3.2: Resume-first behavior & session buffer ────────────────
  it("implements resume-first mountOrResumeQrAttempt that calls active endpoint before create", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("async function mountOrResumeQrAttempt");
    expect(source).toContain("booking-deposit-qr/active");
    expect(source).toContain("attempt: activeAttempt");
    // Path 1: server confirmed active attempt — resume without creating
    expect(source).toContain("attempt.value = activeAttempt");
    expect(source).toContain("startPolling()");
    // Path 2: server explicitly returned no active attempt — safe to create new QR
    expect(source).toContain("await createQrAttempt()");
    expect(source).toContain(
      "// Path 2: server explicitly returned no active attempt",
    );
    // Path 3: lookup error — fail-closed; do NOT create new QR
    expect(source).toContain(
      "// Path 3: Active lookup failed — session buffer preserved; do NOT create new QR",
    );
  });

  it("fail-closed: active lookup error sets resumeError and does NOT fall through to createQrAttempt", () => {
    const source = read(QR_CONTAINER_PATH);
    // resumeError ref exists
    expect(source).toContain("const resumeError = ref<string | null>(null)");
    // Error message is set in catch, not a fall-through
    expect(source).toContain(
      '"ไม่สามารถตรวจสอบรายการ QR เดิมได้ กรุณาลองอีกครั้ง"',
    );
    expect(source).toContain("resumeError.value =");
    // createQrAttempt() only called inside the try on explicit no-active (Path 2),
    // NOT inside the catch block
    expect(source).not.toContain("} catch {\n    await createQrAttempt()");
  });

  it("retryResumeCheck function exists and clears resumeError then re-runs active lookup", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("async function retryResumeCheck");
    expect(source).toContain("resumeError.value = null");
    expect(source).toContain("await mountOrResumeQrAttempt()");
  });

  it("template shows resumeError alert with retry button — no new QR created on lookup failure", () => {
    const source = read(QR_CONTAINER_PATH);
    // Alert shown when resumeError is set
    expect(source).toContain('v-else-if="resumeError"');
    expect(source).toContain("ตรวจสอบ QR ไม่สำเร็จ");
    // Retry button wired to retryResumeCheck (not createQrAttempt)
    expect(source).toContain('v-if="resumeError"');
    expect(source).toContain('@click="retryResumeCheck"');
    expect(source).toContain("ลองอีกครั้ง");
    // Loading text distinguishes resume-check from create
    expect(source).toContain("กำลังตรวจสอบ QR เดิม...");
  });

  it("session buffer is NOT cleared when active lookup fails (preserved for retry)", () => {
    const source = read(QR_CONTAINER_PATH);
    // clearSessionBuffer is NOT called inside the catch block of mountOrResumeQrAttempt
    // The catch block only sets resumeError
    expect(source).toContain(
      "// Path 3: Active lookup failed — session buffer preserved; do NOT create new QR",
    );
    // clearSessionBuffer is only called in emitConfirmedOnce (on paid/paid_confirm_failed)
    // and retryResumeCheck does NOT call clearSessionBuffer before re-checking
    expect(source).toContain("async function retryResumeCheck");
    expect(source).not.toContain("retryResumeCheck(){\n    clearSessionBuffer");
  });

  it("session buffer is written to sessionStorage after create or resume with active lifecycle shape", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("hopnic:pos-v3:future-booking-qr-session:v1");
    expect(source).toContain("function writeSessionBufferActive");
    expect(source).toContain('"future_booking_qr_deposit"');
    expect(source).toContain('"active"');
    expect(source).toContain("lastKnownPaymentAttemptId");
    expect(source).toContain("lastKnownAttemptExpiresAt");
    expect(source).toContain("resumeUntil");
    // Written after create success
    expect(source).toContain(
      "writeSessionBufferActive(result.paymentAttemptId, result.expiresAt)",
    );
    // Written after resume success (contains both args)
    expect(source).toContain("activeAttempt.paymentAttemptId");
    expect(source).toContain("activeAttempt.expiresAt");
  });

  it("session buffer is cleared on paid and paid_confirm_failed (terminal success states)", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("function clearSessionBuffer");
    expect(source).toContain(
      'result.status === "paid" || result.status === "paid_confirm_failed"',
    );
    expect(source).toContain("clearSessionBuffer()");
  });

  it("isResumingAttempt ref shows loading state while active endpoint is checked", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("isResumingAttempt");
    expect(source).toContain("isResumingAttempt.value = true");
    expect(source).toContain("isResumingAttempt.value");
    // Template shows loading skeleton during resume check
    expect(source).toContain("isCreating || isResumingAttempt");
  });
});

// ── Phase 2D-B4: Cancel Active QR Attempt UI tests ───────────────────────────
describe("admin POS V3 Phase 2D-B4 — QR cancel button visibility and wiring", () => {
  it("cancel button is visible for pending status (canCancel)", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("canCancel");
    // canCancel includes isPending
    expect(source).toContain("isPending.value || isRequiresAction.value");
    expect(source).toContain('v-if="canCancel"');
    expect(source).toContain("ยกเลิก QR นี้");
  });

  it("cancel button is visible for requires_action status (canCancel)", () => {
    const source = read(QR_CONTAINER_PATH);
    // canCancel computed covers both pending and requires_action
    expect(source).toContain("isPending.value || isRequiresAction.value");
    expect(source).toContain('v-if="canCancel"');
  });

  it("cancel button is NOT shown for finalizing status", () => {
    const source = read(QR_CONTAINER_PATH);
    // isFinalizing must not appear in canCancel
    const canCancelBlock = source.slice(
      source.indexOf("const canCancel"),
      source.indexOf("const canCancel") + 300,
    );
    expect(canCancelBlock).not.toContain("isFinalizing");
  });

  it("cancel button is NOT shown for paid, paid_confirm_failed, expired, failed, cancelled statuses", () => {
    const source = read(QR_CONTAINER_PATH);
    // All terminal statuses belong to terminalStatuses[], which stops polling but does
    // not satisfy canCancel — confirm canCancel only tests pending/requires_action
    const canCancelBlock = source.slice(
      source.indexOf("const canCancel"),
      source.indexOf("const canCancel") + 300,
    );
    expect(canCancelBlock).not.toContain('"paid"');
    expect(canCancelBlock).not.toContain('"paid_confirm_failed"');
    expect(canCancelBlock).not.toContain('"expired"');
    expect(canCancelBlock).not.toContain('"failed"');
    expect(canCancelBlock).not.toContain('"cancelled"');
  });

  it("cancel success path: cancel endpoint is wired to the correct URL", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("async function cancelQrAttempt");
    expect(source).toContain("booking-deposit-qr/cancel");
    expect(source).toContain('method: "POST"');
  });

  it("cancel success path: session buffer is cleared after successful cancel", () => {
    const source = read(QR_CONTAINER_PATH);
    // clearSessionBuffer must be called inside cancelQrAttempt (success branch),
    // not only in emitConfirmedOnce
    const cancelFnStart = source.indexOf("async function cancelQrAttempt");
    const cancelFnEnd = source.indexOf("\nasync function", cancelFnStart + 1);
    const cancelFn = source.slice(
      cancelFnStart,
      cancelFnEnd > cancelFnStart ? cancelFnEnd : cancelFnStart + 800,
    );
    expect(cancelFn).toContain("clearSessionBuffer()");
  });

  it("cancel success path: qr-cancelled is emitted after successful cancel", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain('"qr-cancelled"');
    expect(source).toContain('emit("qr-cancelled")');
  });

  it("cancel success path: no auto-create-new-QR is triggered after emit", () => {
    const source = read(QR_CONTAINER_PATH);
    const cancelFnStart = source.indexOf("async function cancelQrAttempt");
    const cancelFnEnd = source.indexOf("\nasync function", cancelFnStart + 1);
    const cancelFn = source.slice(
      cancelFnStart,
      cancelFnEnd > cancelFnStart ? cancelFnEnd : cancelFnStart + 800,
    );
    // cancelQrAttempt must not invoke createQrAttempt or mountOrResumeQrAttempt
    expect(cancelFn).not.toContain("createQrAttempt");
    expect(cancelFn).not.toContain("mountOrResumeQrAttempt");
  });

  it("cancel failure path: cancelError ref exists and is shown as an error alert", () => {
    const source = read(QR_CONTAINER_PATH);
    expect(source).toContain("const cancelError = ref<string | null>(null)");
    expect(source).toContain('v-if="cancelError"');
    expect(source).toContain("ยกเลิก QR ไม่สำเร็จ");
  });

  it("cancel failure path: session buffer is NOT cleared on cancel failure", () => {
    const source = read(QR_CONTAINER_PATH);
    const cancelFnStart = source.indexOf("async function cancelQrAttempt");
    const cancelFnEnd = source.indexOf("\nasync function", cancelFnStart + 1);
    const cancelFn = source.slice(
      cancelFnStart,
      cancelFnEnd > cancelFnStart ? cancelFnEnd : cancelFnStart + 800,
    );
    // clearSessionBuffer must appear exactly once inside the function — inside the try
    // success branch, not inside the catch
    const catchStart = cancelFn.indexOf("} catch");
    const catchBlock = cancelFn.slice(catchStart);
    expect(catchBlock).not.toContain("clearSessionBuffer");
  });

  it("cancel failure path: QR flow is not reset on failure (polling is restarted)", () => {
    const source = read(QR_CONTAINER_PATH);
    const cancelFnStart = source.indexOf("async function cancelQrAttempt");
    const cancelFnEnd = source.indexOf("\nasync function", cancelFnStart + 1);
    const cancelFn = source.slice(
      cancelFnStart,
      cancelFnEnd > cancelFnStart ? cancelFnEnd : cancelFnStart + 800,
    );
    const catchStart = cancelFn.indexOf("} catch");
    const catchBlock = cancelFn.slice(catchStart);
    // Polling is restarted in catch so QR remains visible
    expect(catchBlock).toContain("startPolling()");
    // emit("qr-cancelled") must NOT appear in catch block
    expect(catchBlock).not.toContain('emit("qr-cancelled")');
  });
});
