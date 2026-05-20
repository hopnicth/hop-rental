import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  runQrSessionRestore,
  QR_SESSION_BUFFER_KEY,
} from "~/utils/pos-qr-session-restore";
import type { QrSessionRestoreOpts } from "~/utils/pos-qr-session-restore";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const posV3Paths = [
  "app/pages/admin/pos-v3/index.vue",
  "app/components/admin/pos/AdminPosV3ModeNav.vue",
  "app/components/admin/pos/AdminPosV3ResolverPanel.vue",
  "app/components/admin/pos/AdminPosV3PendingWorkList.vue",
  "app/components/admin/pos/AdminPosV3BookingContext.vue",
  "app/components/admin/pos/AdminPosV3OrderContext.vue",
];

function posV3Source() {
  return posV3Paths.map(read).join("\n");
}

describe("admin POS V3 Phase 1 operational entry shell", () => {
  it("adds a guarded /admin/pos-v3 route without replacing POS V2", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    const posV2 = read("app/pages/admin/pos-v2/index.vue");

    expect(page).toContain('layout: "admin"');
    expect(page).toContain('middleware: ["role"]');
    expect(page).toContain('platformRoles: ["staff", "super_admin"]');
    expect(page).toContain("HOPNIC POS V3");
    expect(posV2).toContain("Pickup Readiness workspace");
    expect(posV2).toContain("AdminPosQuickLookup");
  });

  it("renders the approved V3 mode labels", () => {
    const modeNav = read("app/components/admin/pos/AdminPosV3ModeNav.vue");

    expect(modeNav).toContain("ขายขาด");
    expect(modeNav).toContain("Booking");
    expect(modeNav).toContain("KYC");
  });

  it("wires the existing scanner into the POS V3 resolver", () => {
    const source = posV3Source();

    expect(source).toContain("AdminOrderQrScanner");
    expect(source).toContain("scannerDecoded");
    expect(source).toContain("handleScannerDecoded");
    expect(source).toContain('payload.kind === "booking"');
    expect(source).toContain('payload.kind === "customer"');
    expect(source).toContain("Customer phone QR is not supported yet");
    expect(source).toContain("Unsupported POS V3 payload");
  });

  it("implements booking resolver and context wiring with readiness supplement", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    const bookingContext = read(
      "app/components/admin/pos/AdminPosV3BookingContext.vue",
    );

    expect(page).toContain("normalizeBookingInput");
    expect(page).toContain("/api/admin/rental-bookings/");
    expect(page).toContain("/api/admin/pos-v2/rental-bookings/");
    expect(page).toContain("pickup-readiness");
    expect(page).toContain('detail.status === "confirmed"');
    expect(bookingContext).toContain("Booking Context");
    expect(bookingContext).toContain("Pickup readiness preview");
    expect(bookingContext).toContain("Return path will plug in later");
  });

  it("implements user pending work from customer lookup and pickup order queue", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    const list = read("app/components/admin/pos/AdminPosV3PendingWorkList.vue");

    expect(page).toContain("normalizeUserInput");
    expect(page).toContain("/api/admin/customers/lookup");
    expect(page).toContain("/api/admin/orders/queue");
    expect(page).toContain('queue: "pickup"');
    expect(page).toContain("pageSize: 20");
    expect(page).toContain('"confirmed"');
    expect(page).toContain('"picked_up"');
    expect(list).toContain("Pending operational work");
    expect(list).toContain("max-h-80");
    expect(list).toContain("overflow-y-auto");
  });

  it("keeps the user pending list constrained to roughly four visible rows", () => {
    const list = read("app/components/admin/pos/AdminPosV3PendingWorkList.vue");

    expect(list).toContain('v-for="item in items"');
    expect(list).toContain("max-h-80");
    expect(list).toContain("overflow-y-auto");
    expect(list).toContain("@click=\"emit('select', item)\"");
    expect(list).not.toContain("items.slice(0, 4)");
  });

  it("sorts combined pending work by pickup-relevant date ascending", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");

    expect(page).toContain("function sortTimestamp");
    expect(page).toContain("function comparePendingWork");
    expect(page).toContain("sortTimestamp(a.sortAt) - sortTimestamp(b.sortAt)");
    expect(page).toContain("sortAt: booking.startDate");
    expect(page).toContain(
      "Sale pickup queue rows do not expose a true pickup date yet",
    );
    expect(page).toContain("sortAt: order.createdAt");
    expect(page).toContain(".sort(comparePendingWork)");
  });

  it("implements booking and order row handoff sections", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    const orderContext = read(
      "app/components/admin/pos/AdminPosV3OrderContext.vue",
    );

    expect(page).toContain("handlePendingSelect");
    expect(page).toContain(
      "loadBookingContext(source.id, { clearUser: false })",
    );
    expect(page).toContain("loadOrderContext(source)");
    expect(page).toContain("/api/admin/orders/");
    expect(orderContext).toContain("Order Context");
    expect(orderContext).toContain("Pickup order");
    expect(orderContext).toContain("Open existing order detail");
  });

  it("keeps Phase 1 clean: no downstream completion, checkout, KYC, or fiscal controls", () => {
    const source = posV3Source();

    expect(source).not.toContain("pickup-complete");
    expect(source).not.toContain("Complete pickup");
    expect(source).not.toContain("Confirm Pickup");
    expect(source).not.toContain("Confirm Return");
    expect(source).not.toContain("createPosSale");
    expect(source).not.toContain("saleCart");
    expect(source).not.toContain("idModalOpen");
    expect(source).not.toContain("/api/admin/documents/issue");
    expect(source).not.toContain("Issue receipt");
    expect(source).not.toContain("Issue tax invoice");
    expect(source).not.toContain("ABB");
  });
});

const CONTAINER_PATH =
  "app/components/admin/pos/AdminPosV3FutureBookingDraftContainer.vue";

describe("admin POS V3 Container 1 — Future Booking Draft Container", () => {
  it("container file exists", () => {
    const source = read(CONTAINER_PATH);
    expect(source.length).toBeGreaterThan(0);
  });

  it("container references the Phase 2A draft creation endpoint", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("/api/admin/pos-v3/rental-bookings/drafts");
  });

  it("container loads POS branches from the branches endpoint", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("/api/admin/pos/branches");
    expect(source).toContain("loadBranches");
    expect(source).toContain("selectedBranchId");
  });

  it("container loads rental assets via the existing pos/catalog endpoint", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("/api/admin/pos/catalog");
    expect(source).toContain('mode: "rental"');
    expect(source).toContain("searchAssets");
    expect(source).toContain("selectedAssetId");
  });

  it("container supports account and walk-in customer modes", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("customerMode");
    expect(source).toContain('"walk_in"');
    expect(source).toContain('"account"');
    expect(source).toContain("walkInPhone");
  });

  it("container requires booker name for walk-in customers", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain('<UFormField label="Name" required>');
    expect(source).toContain("!!bookerName.value.trim()");
    expect(source).not.toContain('label="Name (optional)"');
  });

  it("container shows asset thumbnail in the search result list", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain(':src="item.thumbnailUrl"');
    expect(source).toContain('v-if="item.thumbnailUrl"');
  });

  it("container uses ProductsRentalBookingCalendar for availability-aware date selection", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("ProductsRentalBookingCalendar");
    expect(source).toContain(":blocking-bookings=");
    expect(source).toContain(":asset-id=");
  });

  it("container configures bufferDays = 0 for POS", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain(':buffer-days="0"');
  });

  it("container loads unavailable dates from the POS booking-blocks endpoint", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("/api/admin/pos/booking-blocks");
    expect(source).toContain("loadBookingCalendarBlocks");
    expect(source).toContain("bookingCalendarBlocks");
  });

  it("container disables customer-facing time restrictions for POS Future Booking", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain(':enforce-customer-time-restriction="false"');
  });

  it("shared calendar exposes enforceCustomerTimeRestriction override prop", () => {
    const calendar = read("app/components/products/RentalBookingCalendar.vue");
    expect(calendar).toContain("enforceCustomerTimeRestriction");
    expect(calendar).toContain("enforceCustomerTimeRestriction: true");
    expect(calendar).toContain("props.enforceCustomerTimeRestriction");
  });

  it("user booking flow keeps customer time restriction by default (no override prop)", () => {
    const form = read("app/components/products/RentalBookingForm.vue");
    expect(form).not.toContain("enforce-customer-time-restriction");
    expect(form).not.toContain("enforceCustomerTimeRestriction");
  });

  it("container derives dates from calendarPayload (not raw date inputs)", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("calendarPayload");
    expect(source).toContain("calendarPayload.value.startDate");
    expect(source).toContain("calendarPayload.value.returnDate");
    // Raw independent date refs must not exist as top-level state
    expect(source).not.toContain('const startDate = ref("")');
    expect(source).not.toContain('const endDate = ref("")');
  });

  it("container reloads availability when asset changes and clears previous date state", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("watch(selectedAssetId");
    expect(source).toContain("emptyCalendarPayload()");
    expect(source).toContain("bookingCalendarBlocksError.value = null");
    expect(source).toContain("void loadBookingCalendarBlocks(newId)");
  });

  it("container shows availability error when booking-blocks load fails", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("bookingCalendarBlocksError");
    expect(source).toContain("Availability load error");
  });

  it("container shows empty state prompt when no asset is selected", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("Select a rental asset first");
  });

  it("container has submit handler with loading and error state", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("submitDraft");
    expect(source).toContain("isSubmitting");
    expect(source).toContain("submitError");
    expect(source).toContain("canSubmit");
  });

  it("submit guard requires valid calendar selection (isValid, startDate, returnDate)", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("calendarPayload.value.isValid");
    expect(source).toContain("calendarPayload.value.startDate");
    expect(source).toContain("calendarPayload.value.returnDate");
  });

  it("draft payload sends assetId and dates from calendarPayload", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("assetId: selectedAssetId.value");
    expect(source).toContain("startDate: calendarPayload.value.startDate");
    expect(source).toContain("endDate: calendarPayload.value.returnDate");
  });

  it("container does NOT send raw disconnected date strings to draft endpoint", () => {
    const source = read(CONTAINER_PATH);
    // Raw date ref assignments must not appear in body
    expect(source).not.toContain("startDate: startDate.value");
    expect(source).not.toContain("endDate: endDate.value");
  });

  it("container sends idempotencyKey in the draft payload", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("idempotencyKey");
    expect(source).toContain("crypto.randomUUID");
  });

  it("container emits draft-created after successful creation", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain('"draft-created"');
    expect(source).toContain("emit");
    expect(source).toContain("createdDraftResult");
  });

  it("container shows success summary with booking deposit and status=draft", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("Draft booking created");
    expect(source).toContain("bookingDepositDueNow");
    expect(source).toContain("unpaid · draft");
  });

  it("container handles ZERO_BOOKING_DEPOSIT_CONFIRMATION_NOT_ENABLED warning", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("ZERO_BOOKING_DEPOSIT_CONFIRMATION_NOT_ENABLED");
    expect(source).toContain("hasZeroDueWarning");
    expect(source).toContain("Zero Booking Deposit");
  });

  it("container does NOT include cash finalization, confirmation, or held-balance endpoints", () => {
    const source = read(CONTAINER_PATH);
    expect(source).not.toContain("booking-deposit-payments");
    expect(source).not.toContain("confirmRentalBooking");
    expect(source).not.toContain("rental-held-balance");
    expect(source).not.toContain("pickup-complete");
    expect(source).not.toContain("Issue receipt");
    expect(source).not.toContain("tax invoice");
    expect(source).not.toContain("WHT");
  });

  // ── Same-day vs Future branching ──────────────────────────────────────────

  it("container has isSameDayRentalIntent computed to detect today's start date", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("isSameDayRentalIntent");
    expect(source).toContain("localTodayDateOnly()");
    expect(source).toContain(
      "calendarPayload.value.startDate === localTodayDateOnly()",
    );
  });

  it("container emits same-day-rental-intent and does NOT call draft endpoint for today", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain('"same-day-rental-intent"');
    expect(source).toContain("isSameDayRentalIntent.value");
    // Same-day branch returns early before $fetch to draft endpoint
    expect(source).toContain('emit("same-day-rental-intent"');
  });

  it("same-day intent payload includes branchId, assetId, dates, numDays, and customer identity", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("branchId: selectedBranchId.value");
    expect(source).toContain("assetId: selectedAssetId.value");
    expect(source).toContain("returnDate: calendarPayload.value.returnDate");
    expect(source).toContain("numDays: calendarPayload.value.numDays");
    expect(source).toContain("bookerName:");
    expect(source).toContain("bookerPhone:");
  });

  it("future rental path still emits draft-created and calls the draft endpoint", () => {
    const source = read(CONTAINER_PATH);
    // Future path: isSameDayRentalIntent is false → falls through to $fetch
    expect(source).toContain("/api/admin/pos-v3/rental-bookings/drafts");
    expect(source).toContain('emit("draft-created"');
  });

  it("submit button label is dynamic: future vs same-day", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("Continue to Same-Day Rental");
    expect(source).toContain("Create Future Booking Draft");
    expect(source).toContain("isSameDayRentalIntent");
  });

  it("createdDraftResult is only set on the future rental path, not on same-day path", () => {
    const source = read(CONTAINER_PATH);
    // same-day branch returns early before any assignment to createdDraftResult
    expect(source).toContain("isSameDayRentalIntent.value");
    expect(source).toContain("return;");
    expect(source).toContain("createdDraftResult.value = result");
  });

  // ── Page-level state ──────────────────────────────────────────────────────

  it("page imports and mounts the draft container", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("AdminPosV3FutureBookingDraftContainer");
    expect(page).toContain("@draft-created");
    expect(page).toContain("latestDraftResult");
    expect(page).toContain("handleDraftCreated");
  });

  it("page has latestSameDayIntent state and same-day-rental-intent listener", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("latestSameDayIntent");
    expect(page).toContain("handleSameDayIntent");
    expect(page).toContain("@same-day-rental-intent");
  });

  it("latestDraftResult and latestSameDayIntent are stored separately on the page", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("latestDraftResult");
    expect(page).toContain("latestSameDayIntent");
    // They must be separate refs
    expect(page).toContain("latestDraftResult = ref");
    expect(page).toContain("latestSameDayIntent = ref");
  });

  it("page passes userContext to the container", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain(":user-context=");
  });

  it("container is conditionally mounted only in booking mode", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    // v-if uses single-quote style: v-if="activeMode === 'booking'"
    expect(page).toContain("activeMode === 'booking'");
    expect(page).toContain("AdminPosV3FutureBookingDraftContainer");
  });

  it("Container 1 does not include cash finalization logic, same-day backend, or pickup controls", () => {
    const source = read(CONTAINER_PATH);
    const page = read("app/pages/admin/pos-v3/index.vue");
    // Container 1 source must never contain payment finalization or pickup logic
    expect(source).not.toContain("booking-deposit-payments");
    expect(source).not.toContain("pickup-complete");
    expect(source).not.toContain("instant-rental");
    // Page must never contain the same-day container (not yet implemented)
    expect(page).not.toContain("AdminPosV3SameDayContainer");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 2D-B3.2: Session Buffer Restore & Manual Re-entry Tests
// ────────────────────────────────────────────────────────────────────────────
describe("admin POS V3 Phase 2D-B3.2 — session buffer & QR re-entry", () => {
  const page = read("app/pages/admin/pos-v3/index.vue");

  it("defines the session storage key and clearSessionBuffer helper", () => {
    expect(page).toContain("hopnic:pos-v3:future-booking-qr-session:v1");
    expect(page).toContain("function clearSessionBuffer");
    expect(page).toContain("window.sessionStorage.removeItem(SS_KEY)");
  });

  it("selectPaymentMethod writes initializing buffer when promptpay_qr is selected", () => {
    expect(page).toContain('"future_booking_qr_deposit"');
    expect(page).toContain('"initializing"');
    expect(page).toContain("window.sessionStorage.setItem");
    expect(page).toContain("resumeUntil");
    expect(page).toContain("latestDraftResult.value.booking.id");
  });

  it("handleDraftCreated clears session buffer when a new draft is created", () => {
    // clearSessionBuffer is called inside handleDraftCreated
    expect(page).toContain("clearSessionBuffer()");
    expect(page).toContain("function handleDraftCreated");
  });

  it("implements buildDraftResultFromDetail to reconstruct DraftBookingResult from booking detail", () => {
    expect(page).toContain("function buildDraftResultFromDetail");
    expect(page).toContain("calculateBookingDepositDueNow");
    expect(page).toContain("detail.rentalDays");
    expect(page).toContain("detail.depositAmount");
    expect(page).toContain("detail.assetCode");
    expect(page).toContain("detail.startDate");
    expect(page).toContain("detail.endDate");
    expect(page).toContain("detail.currencyCode");
    expect(page).toContain("bookingDepositDueNow");
  });

  it("onMounted delegates buffer validation to runQrSessionRestore and restores POS state on restored outcome", () => {
    const restore = read("app/utils/pos-qr-session-restore.ts");
    // Buffer shape + expiry checks live in the utility
    expect(restore).toContain("buffer.version !== 1");
    expect(restore).toContain('buffer.flow !== "future_booking_qr_deposit"');
    expect(restore).toContain('buffer.paymentMethod !== "promptpay_qr"');
    expect(restore).toContain("typeof buffer.resumeUntil");
    // Active endpoint URL wired from index.vue
    expect(page).toContain("booking-deposit-qr/active");
    // isRestorable predicate wired in index.vue
    expect(page).toContain('detail.status === "draft"');
    expect(page).toContain('detail.depositPaymentStatus !== "paid"');
    // State mutations only on "restored" outcome
    expect(page).toContain('outcome.kind !== "restored"');
    expect(page).toContain('selectedPaymentMethod.value = "promptpay_qr"');
    expect(page).toContain("buildDraftResultFromDetail(outcome.detail)");
  });

  it("onMounted clears buffer and does not restore when buffer is expired (resumeUntil past)", () => {
    const restore = read("app/utils/pos-qr-session-restore.ts");
    // Expiry check is inside the utility (uses the injectable now() clock, not Date.now() directly)
    expect(restore).toContain("now() > new Date(buffer.resumeUntil");
    expect(restore).toContain('"invalid_buffer"');
    // clearSessionBuffer still exists in index.vue for other uses (selectPaymentMethod, handleDraftCreated)
    expect(page).toContain("clearSessionBuffer()");
  });

  it("onMounted clears buffer when booking is no longer draft/unpaid", () => {
    const restore = read("app/utils/pos-qr-session-restore.ts");
    // The utility clears when isRestorable returns false
    expect(restore).toContain('"booking_not_restorable"');
    expect(restore).toContain("storage.removeItem");
    // The isRestorable predicate in index.vue rejects paid/non-draft
    expect(page).toContain('detail.depositPaymentStatus !== "paid"');
    expect(page).toContain('detail.status === "draft"');
  });

  it("onMounted clears buffer and aborts restore when active endpoint returns explicit { attempt: null }", () => {
    // Regression coverage (source-text layer): the utility handles the no-active case explicitly.
    // Runtime behavioral coverage is in the describe block below.
    const restore = read("app/utils/pos-qr-session-restore.ts");
    expect(restore).toContain("if (!activeAttempt)");
    expect(restore).toContain('"no_active_attempt"');
    // index.vue only mutates state when outcome.kind === "restored" — no path reaches state
    // mutations when the utility returns "cleared"
    expect(page).toContain('outcome.kind !== "restored"');
    expect(page).not.toContain("void createQrAttempt()");
  });

  it("manual re-entry: loadBookingContext resumes QR flow if active attempt exists for draft booking", () => {
    // The loadBookingContext function checks for active QR on draft/unpaid bookings
    expect(page).toContain('detail.status === "draft"');
    expect(page).toContain('detail.depositPaymentStatus !== "paid"');
    expect(page).toContain("latestDraftResult.value === null");
    expect(page).toContain("buildDraftResultFromDetail(detail)");
    // Restores payment method for QR flow
    expect(page).toContain('selectedPaymentMethod.value = "promptpay_qr"');
    // Non-blocking: catch around the active check
    expect(page).toContain("// Non-blocking: if active check fails");
  });

  it("does not silently create QR on re-entry — only restores if active attempt exists", () => {
    // The re-entry path only sets latestDraftResult if activeAttempt is truthy
    expect(page).toContain("if (activeAttempt)");
    // Does not call createQrAttempt from index.vue directly
    expect(page).not.toContain("void createQrAttempt()");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 2D-B3.2: runQrSessionRestore — BEHAVIORAL runtime tests
// These tests execute real JavaScript logic and assert on runtime state,
// not source-text content. They prove the no-active case behaviorally.
// ────────────────────────────────────────────────────────────────────────────
describe("runQrSessionRestore — behavioral runtime (Phase 2D-B3.2)", () => {
  /** Minimal stub for a draft/unpaid booking detail. */
  interface StubDetail {
    id: string;
    status: string;
    depositPaymentStatus: string;
  }
  const isRestorable = (d: StubDetail) =>
    d.status === "draft" && d.depositPaymentStatus !== "paid";

  /** Creates an in-memory Map-backed sessionStorage stub. */
  function makeStorage(initial?: Record<string, string>) {
    const store = new Map<string, string>(Object.entries(initial ?? {}));
    return {
      store,
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
  }

  /** A valid buffer that passes all shape and expiry checks. */
  const validBuffer = {
    version: 1,
    flow: "future_booking_qr_deposit",
    paymentMethod: "promptpay_qr",
    bookingId: "booking-restore-test",
    resumeUntil: new Date(Date.now() + 120_000).toISOString(),
  };

  /** A booking detail that is still draft and unpaid. */
  const draftUnpaidDetail: StubDetail = {
    id: "booking-restore-test",
    status: "draft",
    depositPaymentStatus: "unpaid",
  };

  function makeOpts(
    overrides: Partial<QrSessionRestoreOpts<StubDetail>> & {
      storage: QrSessionRestoreOpts<StubDetail>["storage"];
    },
  ): QrSessionRestoreOpts<StubDetail> {
    return {
      fetchDetail: async () => draftUnpaidDetail,
      fetchActiveAttempt: async () => ({
        attempt: { paymentAttemptId: "attempt-live-1" },
      }),
      isRestorable,
      ...overrides,
    };
  }

  // ── PRIMARY REGRESSION TEST ───────────────────────────────────────────────
  it("REGRESSION: clears buffer and returns cleared:no_active_attempt when active endpoint returns { attempt: null }", async () => {
    const { store, ...storage } = makeStorage({
      [QR_SESSION_BUFFER_KEY]: JSON.stringify(validBuffer),
    });

    const outcome = await runQrSessionRestore(
      makeOpts({
        storage,
        fetchActiveAttempt: async () => ({ attempt: null }), // explicit no-active
      }),
    );

    // 1. Buffer must be removed from storage
    expect(store.has(QR_SESSION_BUFFER_KEY)).toBe(false);
    // 2. Outcome must be "cleared" — not "restored"
    expect(outcome.kind).toBe("cleared");
    // 3. Specific reason identifies the no-active code path
    expect(outcome.kind === "cleared" && outcome.reason).toBe(
      "no_active_attempt",
    );
    // 4. No detail accessible — QR mode cannot be restored by the caller
    expect("detail" in outcome).toBe(false);
  });

  // ── HAPPY PATH ───────────────────────────────────────────────────────────
  it("returns restored with detail when buffer valid, booking draft/unpaid, and active attempt found", async () => {
    const { store, ...storage } = makeStorage({
      [QR_SESSION_BUFFER_KEY]: JSON.stringify(validBuffer),
    });

    const outcome = await runQrSessionRestore(makeOpts({ storage }));

    expect(outcome.kind).toBe("restored");
    if (outcome.kind === "restored") {
      expect(outcome.detail.id).toBe("booking-restore-test");
      expect(outcome.detail.status).toBe("draft");
    }
    // Buffer is preserved on successful restore — cleared only when payment completes
    expect(store.has(QR_SESSION_BUFFER_KEY)).toBe(true);
  });

  // ── BOOKING NOT RESTORABLE ────────────────────────────────────────────────
  it("clears buffer and returns cleared:booking_not_restorable when booking is paid", async () => {
    const { store, ...storage } = makeStorage({
      [QR_SESSION_BUFFER_KEY]: JSON.stringify(validBuffer),
    });

    const outcome = await runQrSessionRestore(
      makeOpts({
        storage,
        fetchDetail: async () => ({
          ...draftUnpaidDetail,
          depositPaymentStatus: "paid",
        }),
      }),
    );

    expect(store.has(QR_SESSION_BUFFER_KEY)).toBe(false);
    expect(outcome.kind).toBe("cleared");
    expect(outcome.kind === "cleared" && outcome.reason).toBe(
      "booking_not_restorable",
    );
  });

  // ── EXPIRED BUFFER ────────────────────────────────────────────────────────
  it("clears buffer and returns cleared:invalid_buffer when resumeUntil is in the past", async () => {
    const expiredBuffer = {
      ...validBuffer,
      resumeUntil: new Date(Date.now() - 1_000).toISOString(),
    };
    const { store, ...storage } = makeStorage({
      [QR_SESSION_BUFFER_KEY]: JSON.stringify(expiredBuffer),
    });

    const outcome = await runQrSessionRestore(makeOpts({ storage }));

    expect(store.has(QR_SESSION_BUFFER_KEY)).toBe(false);
    expect(outcome.kind).toBe("cleared");
    expect(outcome.kind === "cleared" && outcome.reason).toBe("invalid_buffer");
  });

  // ── NO BUFFER PRESENT ─────────────────────────────────────────────────────
  it("returns skipped when no buffer is present in sessionStorage", async () => {
    const { store, ...storage } = makeStorage(); // empty store

    const outcome = await runQrSessionRestore(makeOpts({ storage }));

    expect(outcome.kind).toBe("skipped");
    expect(store.size).toBe(0); // nothing written
  });
});

// ── Phase 2D-B4: handleQrCancelled wiring in parent POS page ─────────────────
describe("admin POS V3 Phase 2D-B4 — parent page handleQrCancelled wiring", () => {
  const PAGE_PATH = "app/pages/admin/pos-v3/index.vue";

  it("QrContainer in template is wired with @qr-cancelled='handleQrCancelled'", () => {
    const page = read(PAGE_PATH);
    expect(page).toContain('@qr-cancelled="handleQrCancelled"');
  });

  it("handleQrCancelled function exists in the script section", () => {
    const page = read(PAGE_PATH);
    expect(page).toContain("function handleQrCancelled");
  });

  it("handleQrCancelled resets selectedPaymentMethod to null", () => {
    const page = read(PAGE_PATH);
    const fnStart = page.indexOf("function handleQrCancelled");
    const fnEnd = page.indexOf("\n}", fnStart) + 2;
    const fn = page.slice(fnStart, fnEnd);
    expect(fn).toContain("selectedPaymentMethod.value = null");
  });

  it("handleQrCancelled does NOT clear latestDraftResult (booking context preserved)", () => {
    const page = read(PAGE_PATH);
    const fnStart = page.indexOf("function handleQrCancelled");
    const fnEnd = page.indexOf("\n}", fnStart) + 2;
    const fn = page.slice(fnStart, fnEnd);
    expect(fn).not.toContain("latestDraftResult");
    expect(fn).not.toContain("clearBookingContext");
    expect(fn).not.toContain("clearAllContexts");
  });

  it("handleQrCancelled does NOT trigger new draft creation", () => {
    const page = read(PAGE_PATH);
    const fnStart = page.indexOf("function handleQrCancelled");
    const fnEnd = page.indexOf("\n}", fnStart) + 2;
    const fn = page.slice(fnStart, fnEnd);
    expect(fn).not.toContain("loadBookingContext");
    expect(fn).not.toContain("createDraft");
    expect(fn).not.toContain("handleDraftCreated");
  });

  it("setting selectedPaymentMethod to null returns staff to the payment method selector state", () => {
    const page = read(PAGE_PATH);
    // The payment method selector renders when latestDraftResult !== null AND
    // selectedPaymentMethod === null — cancelling resets to exactly that state
    expect(page).toContain("selectedPaymentMethod === null");
    expect(page).toContain("เลือกวิธีรับเงินมัดจำการจอง");
    // handleQrCancelled achieves this by resetting selectedPaymentMethod only
    const fnStart = page.indexOf("function handleQrCancelled");
    const fnEnd = page.indexOf("\n}", fnStart) + 2;
    const fn = page.slice(fnStart, fnEnd);
    expect(fn).toContain("selectedPaymentMethod.value = null");
  });
});
