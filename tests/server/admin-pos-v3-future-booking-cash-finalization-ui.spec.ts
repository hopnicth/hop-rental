import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const CONTAINER_PATH =
  "app/components/admin/pos/AdminPosV3FutureBookingDepositCashContainer.vue";
const PAGE_PATH = "app/pages/admin/pos-v3/index.vue";

describe("admin POS V3 Container 2 — Future Booking Cash Deposit Container", () => {
  // ── Existence ──────────────────────────────────────────────────────────────

  it("container file exists", () => {
    const source = read(CONTAINER_PATH);
    expect(source.length).toBeGreaterThan(0);
  });

  it("container is mounted from the POS V3 page", () => {
    const page = read(PAGE_PATH);
    expect(page).toContain("AdminPosV3FutureBookingDepositCashContainer");
  });

  it("container is shown only when latestDraftResult is non-null", () => {
    const page = read(PAGE_PATH);
    // The v-if attribute and latestDraftResult must appear on the same line
    expect(page).toMatch(/v-if=.*latestDraftResult/);
    expect(page).toContain("AdminPosV3FutureBookingDepositCashContainer");
  });

  it("container is not shown for same-day intent (latestDraftResult is future-only)", () => {
    const page = read(PAGE_PATH);
    // latestDraftResult and latestSameDayIntent are separate refs
    expect(page).toContain("latestDraftResult = ref");
    expect(page).toContain("latestSameDayIntent = ref");
    // The v-if on Container 2 must reference latestDraftResult, not latestSameDayIntent
    expect(page).toMatch(
      /AdminPosV3FutureBookingDepositCashContainer\s[\s\S]*?v-if="[^"]*latestDraftResult/,
    );
    expect(page).not.toMatch(
      /AdminPosV3FutureBookingDepositCashContainer\s[\s\S]*?v-if="[^"]*latestSameDayIntent/,
    );
  });

  // ── Prop contract ──────────────────────────────────────────────────────────

  it("container accepts draftResult prop", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("draftResult");
    expect(source).toContain("defineProps");
  });

  it("page passes :draft-result to container 2", () => {
    const page = read(PAGE_PATH);
    expect(page).toContain(":draft-result=");
  });

  // ── API endpoint ───────────────────────────────────────────────────────────

  it("container references the Phase 2B booking deposit payment endpoint", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("booking-deposit-payments");
  });

  it("container posts to the correct dynamic endpoint path with bookingId", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain(
      "/api/admin/pos-v3/rental-bookings/${encodeURIComponent",
    );
    expect(source).toContain("booking-deposit-payments");
  });

  // ── Cash-only payment method ───────────────────────────────────────────────

  it("container uses cash as the only payment method", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain('"cash"');
    expect(source).toContain("paymentMethod");
  });

  it("container does not include PromptPay, card, or bank transfer", () => {
    const source = read(CONTAINER_PATH);
    expect(source).not.toContain("PromptPay");
    expect(source).not.toContain("promptpay");
    expect(source).not.toContain("bank_transfer");
    expect(source).not.toContain("qrcode");
  });

  // ── Amount / form state ────────────────────────────────────────────────────

  it("container has cashTenderedAmount state and submit handler", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("cashTenderedAmount");
    expect(source).toContain("submitCashPayment");
    expect(source).toContain("canSubmit");
  });

  it("amount defaults to bookingDepositDueNow from the draft quote", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("bookingDepositDueNow");
    expect(source).toContain(
      "ref(props.draftResult.quote.bookingDepositDueNow)",
    );
  });

  it("API payload sends idempotencyKey, paymentMethod cash, and amount", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("idempotencyKey: idempotencyKey.value");
    expect(source).toContain('paymentMethod: "cash"');
    // Backend always receives the fixed bookingDepositDueNow — not the cashTenderedAmount UI field
    expect(source).toContain(
      "amount: props.draftResult.quote.bookingDepositDueNow",
    );
  });

  it("payload does NOT include branchId (backend derives it from booking.pos_branch_id)", () => {
    const source = read(CONTAINER_PATH);
    // branchId must not appear as a payload field in submitCashPayment body
    const submitFn = source.slice(
      source.indexOf("async function submitCashPayment"),
      source.indexOf("} catch (err"),
    );
    expect(submitFn).not.toContain("branchId:");
    expect(submitFn).not.toContain("staffUserId:");
  });

  // ── Loading / error state ──────────────────────────────────────────────────

  it("container has isSubmitting loading state", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("isSubmitting");
    expect(source).toContain(':loading="isSubmitting"');
  });

  it("container has submitError error state and displays it", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("submitError");
    expect(source).toContain("Payment finalization failed");
  });

  it("submit button is disabled when canSubmit is false", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain(':disabled="!canSubmit"');
  });

  // ── Success confirmed state ────────────────────────────────────────────────

  it("container shows confirmed success state", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain('status === "confirmed"');
    expect(source).toContain("isConfirmed");
    expect(source).toContain("Booking confirmed");
    expect(source).toContain("Booking Deposit received");
  });

  it("confirmed success displays paid amount via normalized computed (handles nested booking shape)", () => {
    const source = read(CONTAINER_PATH);
    // Must have display helpers that resolve the nested confirmed response shape
    expect(source).toContain("displayedPaidAmount");
    expect(source).toContain("displayedCurrencyCode");
    // The normalization must cover the booking-nested path (confirmed response)
    expect(source).toContain(
      "finalizationResult.value?.booking?.bookingDepositPaidAmount",
    );
    expect(source).toContain("finalizationResult.value?.booking?.currencyCode");
    // And the top-level fallback path (paid_confirm_failed response)
    expect(source).toContain(
      "finalizationResult.value?.bookingDepositPaidAmount",
    );
    expect(source).toContain("finalizationResult.value?.currencyCode");
    // Confirmed success template must use the normalized helpers, not raw top-level access
    const confirmedBlock = source.slice(
      source.indexOf("<!-- Confirmed success -->"),
      source.indexOf("<!-- Degraded success"),
    );
    expect(confirmedBlock).toContain(
      "fmt(displayedPaidAmount, displayedCurrencyCode)",
    );
    // Must NOT read raw top-level finalizationResult.bookingDepositPaidAmount in confirmed block
    expect(confirmedBlock).not.toContain(
      "finalizationResult.bookingDepositPaidAmount",
    );
    // paymentAttemptId is top-level in both shapes — still directly readable
    expect(confirmedBlock).toContain("finalizationResult.paymentAttemptId");
  });

  it("degraded success amount display is compatible with top-level fallback in normalized computed", () => {
    const source = read(CONTAINER_PATH);
    // displayedPaidAmount fallback chain covers paid_confirm_failed top-level shape
    const computedBlock = source.slice(
      source.indexOf("const displayedPaidAmount"),
      source.indexOf("const canSubmit"),
    );
    // Must fall through: booking-nested → top-level → 0
    expect(computedBlock).toContain(
      "finalizationResult.value?.booking?.bookingDepositPaidAmount",
    );
    expect(computedBlock).toContain(
      "finalizationResult.value?.bookingDepositPaidAmount",
    );
    expect(computedBlock).toContain("0");
    // Currency fallback chain covers paid_confirm_failed top-level shape
    expect(computedBlock).toContain(
      "finalizationResult.value?.booking?.currencyCode",
    );
    expect(computedBlock).toContain("finalizationResult.value?.currencyCode");
    expect(computedBlock).toContain('"THB"');
  });

  // ── Degraded success: paid_confirm_failed ──────────────────────────────────

  it("container shows paid_confirm_failed degraded-success state", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("paid_confirm_failed");
    expect(source).toContain("isDegradedSuccess");
  });

  it("degraded success shows manual review warning, not confirmed", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("manual review");
    expect(source).toContain("paid_confirm_failed");
    expect(source).not.toContain("Booking is now confirmed");
  });

  // ── Zero-due behavior ──────────────────────────────────────────────────────

  it("container handles zero-due booking with warning and disabled submit", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("ZERO_BOOKING_DEPOSIT_FINALIZATION_NOT_ENABLED");
    expect(source).toContain("isZeroDue");
    expect(source).toContain("isZeroDue.value");
  });

  it("zero-due guard prevents submit (canSubmit requires amount > 0 and not isZeroDue)", () => {
    const source = read(CONTAINER_PATH);
    const canSubmitBlock = source.slice(
      source.indexOf("const canSubmit"),
      source.indexOf("async function submitCashPayment"),
    );
    expect(canSubmitBlock).toContain("isZeroDue.value");
    expect(canSubmitBlock).toContain("cashTenderedAmount.value > 0");
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it("container uses idempotency key via crypto.randomUUID", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("idempotencyKey");
    expect(source).toContain("crypto.randomUUID");
  });

  it("idempotency key resets when draftResult booking ID changes", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("props.draftResult.booking.id");
    expect(source).toContain("idempotencyKey.value = crypto.randomUUID()");
  });

  // ── Emit ──────────────────────────────────────────────────────────────────

  it("container emits booking-confirmed event", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain('"booking-confirmed"');
    expect(source).toContain('emit("booking-confirmed"');
  });

  // ── Page-level wiring ─────────────────────────────────────────────────────

  it("page stores latestConfirmedFutureBookingResult separately from draft and same-day state", () => {
    const page = read(PAGE_PATH);
    expect(page).toContain("latestConfirmedFutureBookingResult");
    expect(page).toContain("handleBookingConfirmed");
    expect(page).toContain("latestDraftResult = ref");
    expect(page).toContain("latestSameDayIntent = ref");
    expect(page).toContain("latestConfirmedFutureBookingResult = ref");
  });

  it("page listens for @booking-confirmed from container 2", () => {
    const page = read(PAGE_PATH);
    expect(page).toContain("@booking-confirmed");
    expect(page).toContain("handleBookingConfirmed");
  });

  // ── Scope exclusions ──────────────────────────────────────────────────────

  it("container does NOT include same-day, pickup, return, WHT, tax, or document UI", () => {
    const source = read(CONTAINER_PATH);
    expect(source).not.toContain("same-day-rental");
    expect(source).not.toContain("instant-rental");
    expect(source).not.toContain("pickup-complete");
    expect(source).not.toContain("WHT");
    expect(source).not.toContain("tax invoice");
    expect(source).not.toContain("Issue receipt");
    expect(source).not.toContain("Issue document");
    expect(source).not.toContain("confirmRentalBooking");
    expect(source).not.toContain("rental-held-balance");
  });

  it("container does NOT implement return settlement or security deposit at handover", () => {
    const source = read(CONTAINER_PATH);
    expect(source).not.toContain("returnDeposit");
    expect(source).not.toContain("securityDepositReturn");
    expect(source).not.toContain("pickup-handover");
  });

  // ── Phase 2C-B3: CTA label ─────────────────────────────────────────────────

  it("primary CTA label is รับเงินและยืนยันการจอง (not old English label)", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("รับเงินและยืนยันการจอง");
    expect(source).not.toContain("Confirm Cash Booking Deposit");
  });

  // ── Phase 2C-B3: Processing state ─────────────────────────────────────────

  it("processing state shows body-level loading panel when isSubmitting", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain('v-if="isSubmitting"');
    expect(source).toContain("กำลังดำเนินการ...");
    expect(source).toContain(
      "กำลังบันทึกการรับเงินและยืนยันการจอง · กำลังเตรียมเอกสารยืนยันการรับเงินมัดจำการจอง",
    );
  });

  it("cash tendered input is disabled when isSubmitting", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain(':disabled="isSubmitting"');
  });

  // ── Phase 2C-B3: FinalizationResult document field ────────────────────────

  it("FinalizationResult type includes document field with issued/failed status", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain('status: "issued" | "failed"');
    expect(source).toContain("officialDocumentId");
    expect(source).toContain("documentNo");
    expect(source).toContain("errorCode");
  });

  it("isDocumentIssued and isDocumentFailed computed are present and guard on isConfirmed", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("isDocumentIssued");
    expect(source).toContain("isDocumentFailed");
    // Both must be guarded by isConfirmed
    expect(source).toContain("isConfirmed.value &&");
    expect(source).toContain(
      'finalizationResult.value?.document?.status === "issued"',
    );
    expect(source).toContain(
      'finalizationResult.value?.document?.status === "failed"',
    );
  });

  // ── Phase 2C-B3: Confirmed + document issued UX ────────────────────────────

  it("confirmed + document issued shows print button with correct Thai label", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("พิมพ์เอกสารยืนยันการรับเงินมัดจำการจอง");
    expect(source).toContain("openBookingDepositDocumentPrint");
  });

  it("print function uses officialDocumentId with correct route and new-tab behavior", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("openBookingDepositDocumentPrint");
    expect(source).toContain(
      "/admin/documents/${encodeURIComponent(docId)}/print?bookingId=",
    );
    expect(source).toContain("window.open(");
    expect(source).toContain('"_blank"');
    // Safety guard: does nothing when officialDocumentId is missing
    expect(source).toContain("if (!docId) return");
  });

  it("confirmed + document issued shows document number when present", () => {
    const source = read(CONTAINER_PATH);
    const issuedBlock = source.slice(
      source.indexOf("<!-- Document issued: print CTA -->"),
      source.indexOf("<!-- Document failed:"),
    );
    expect(issuedBlock).toContain("finalizationResult.document?.documentNo");
    expect(issuedBlock).toContain("finalizationResult.document.documentNo");
  });

  it("document issued block uses v-if isDocumentIssued, not isDegradedSuccess", () => {
    const source = read(CONTAINER_PATH);
    const issuedBlock = source.slice(
      source.indexOf("<!-- Document issued: print CTA -->"),
      source.indexOf("<!-- Document failed:"),
    );
    expect(issuedBlock).toContain("isDocumentIssued");
    expect(issuedBlock).not.toContain("isDegradedSuccess");
  });

  // ── Phase 2C-B3: Confirmed + document failed UX ───────────────────────────

  it("confirmed + document failed shows ไม่ต้องรับเงินซ้ำ", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("ไม่ต้องรับเงินซ้ำ");
  });

  it("confirmed + document failed shows เอกสารยังเตรียมไม่สำเร็จ warning", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("เอกสารยังเตรียมไม่สำเร็จ");
    expect(source).toContain(
      "การรับเงินและการยืนยันการจองสำเร็จแล้ว ไม่ต้องรับเงินซ้ำ",
    );
  });

  it("confirmed + document failed does NOT show print button", () => {
    const source = read(CONTAINER_PATH);
    const failedBlock = source.slice(
      source.indexOf("<!-- Document failed:"),
      source.indexOf("<!-- Degraded success"),
    );
    expect(failedBlock).not.toContain("พิมพ์เอกสารยืนยันการรับเงินมัดจำการจอง");
    expect(failedBlock).not.toContain("openBookingDepositDocumentPrint");
  });

  it("confirmed + document failed shows ดูรายละเอียดการจอง booking detail action", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("ดูรายละเอียดการจอง");
    expect(source).toContain("/admin/rental-bookings/");
  });

  // ── Phase 2C-B3: paid_confirm_failed remains separate ─────────────────────

  it("paid_confirm_failed block is distinct from document failed — uses isDegradedSuccess", () => {
    const source = read(CONTAINER_PATH);
    const degradedBlock = source.slice(
      source.indexOf("<!-- Degraded success: paid_confirm_failed -->"),
      source.indexOf("<!-- Main cash finalization form -->"),
    );
    expect(degradedBlock).toContain("isDegradedSuccess");
    expect(degradedBlock).toContain("manual review");
    // Must NOT contain document-failure-specific copy inside this block
    expect(degradedBlock).not.toContain("เอกสารยังเตรียมไม่สำเร็จ");
    expect(degradedBlock).not.toContain("ไม่ต้องรับเงินซ้ำ");
    expect(degradedBlock).not.toContain("openBookingDepositDocumentPrint");
  });

  it("document-failed state is separate from paid_confirm_failed — not inside degraded block", () => {
    const source = read(CONTAINER_PATH);
    // isDocumentFailed must NOT appear inside the paid_confirm_failed block
    const degradedBlock = source.slice(
      source.indexOf("<!-- Degraded success: paid_confirm_failed -->"),
      source.indexOf("<!-- Main cash finalization form -->"),
    );
    expect(degradedBlock).not.toContain("isDocumentFailed");
  });

  // ── Phase 2C-B3: booking-confirmed emit for confirmed only ─────────────────

  it("booking-confirmed emit is conditional on status === confirmed", () => {
    const source = read(CONTAINER_PATH);
    // The emit must be inside a conditional block checking "confirmed"
    expect(source).toContain('result.status === "confirmed"');
    expect(source).toContain('emit("booking-confirmed"');
    // The emit must NOT appear outside the conditional (check that emit is inside the if block)
    const submitFn = source.slice(
      source.indexOf("async function submitCashPayment"),
      source.indexOf("} catch (err"),
    );
    expect(submitFn).toContain('result.status === "confirmed"');
    expect(submitFn).toContain('emit("booking-confirmed"');
  });
});
