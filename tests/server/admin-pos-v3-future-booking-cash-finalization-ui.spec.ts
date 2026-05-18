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

  it("cash tendered defaults to bookingDepositDueNow from the draft quote", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("bookingDepositDueNow");
    expect(source).toContain(
      "ref(props.draftResult.quote.bookingDepositDueNow)",
    );
  });

  it("Booking Deposit Due is shown read-only with lock icon", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("Booking Deposit Due");
    expect(source).toContain("Exact amount");
    expect(source).toContain("bx:lock");
  });

  it("API payload sends idempotencyKey, paymentMethod cash, and bookingDepositDueNow (not cashTenderedAmount)", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("idempotencyKey: idempotencyKey.value");
    expect(source).toContain('paymentMethod: "cash"');
    expect(source).toContain(
      "amount: props.draftResult.quote.bookingDepositDueNow",
    );
    // Ensure backend payload does NOT send cashTenderedAmount
    const submitFn = source.slice(
      source.indexOf("async function submitCashPayment"),
      source.indexOf("} catch (err"),
    );
    expect(submitFn).not.toContain("amount: cashTenderedAmount");
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

  // ── Cashier UX: Change + Underpayment ──────────────────────────────────

  it("container computes and displays change amount when cash tendered >= due", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("changeAmount");
    expect(source).toContain("Change to return");
    expect(source).toContain("bg-success/5");
  });

  it("change amount = max(cashTenderedAmount - bookingDepositDueNow, 0)", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("Math.max");
    expect(source).toContain(
      "cashTenderedAmount.value - props.draftResult.quote.bookingDepositDueNow",
    );
  });

  it("container detects insufficient cash (cashTenderedAmount < bookingDepositDueNow)", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("isCashTenderedInsufficient");
    expect(source).toContain(
      "cashTenderedAmount.value < props.draftResult.quote.bookingDepositDueNow",
    );
  });

  it("insufficient cash warning is shown and submit is disabled when cash < due", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("Insufficient cash");
    expect(source).toContain(
      "Cash received is lower than the required Booking Deposit",
    );
    // canSubmit must check isCashTenderedInsufficient
    const canSubmitBlock = source.slice(
      source.indexOf("const canSubmit"),
      source.indexOf("async function submitCashPayment"),
    );
    expect(canSubmitBlock).toContain("isCashTenderedInsufficient.value");
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
});
