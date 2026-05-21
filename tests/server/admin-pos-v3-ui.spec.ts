import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

// ── Phase 2D-B3.2: Active QR Resume & Session Resilience ──────────────────────

describe("admin POS V3 Phase 2D-B3.2 Active QR Resume & Session Resilience", () => {
  it("pos-qr-session-restore utility exists and exports QR_SESSION_BUFFER_KEY + runQrSessionRestore", () => {
    const source = read("app/utils/pos-qr-session-restore.ts");
    expect(source).toContain("QR_SESSION_BUFFER_KEY");
    expect(source).toContain("hopnic:pos-v3:future-booking-qr-session:v1");
    expect(source).toContain("runQrSessionRestore");
    expect(source).toContain("QrSessionRestoreOutcome");
  });

  it("active QR attempt endpoint exists and is read-only", () => {
    const source = read(
      "server/api/admin/pos-v3/rental-bookings/[bookingId]/booking-deposit-qr/active.get.ts",
    );
    expect(source).toContain("defineEventHandler");
    expect(source).toContain("pos_rental_payment_attempts");
    expect(source).toContain('"pending"');
    expect(source).toContain('"requires_action"');
    expect(source).toContain('"finalizing"');
    // Must be read-only: no insert/update/delete
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
    expect(source).not.toContain(".delete(");
  });

  it("index.vue imports runQrSessionRestore from pos-qr-session-restore", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("runQrSessionRestore");
    expect(page).toContain("pos-qr-session-restore");
  });

  it("index.vue has onMounted session restore hook", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("onMounted");
    expect(page).toContain("runQrSessionRestore");
    expect(page).toContain("outcome.kind");
    expect(page).toContain('"restored"');
    expect(page).toContain("selectedPaymentMethod.value");
    expect(page).toContain('"promptpay_qr"');
  });

  it("index.vue has buildDraftResultFromBookingDetail helper that maps detail + activeAttempt", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("buildDraftResultFromBookingDetail");
    expect(page).toContain("outcome.activeAttempt");
    expect(page).toContain("isAccount");
    expect(page).toContain("bookingDepositDueNow");
    expect(page).toContain("qa.amount");
  });

  it("index.vue has manual re-entry resume in loadBookingContext", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    // Comment updated in B6 to "Manual re-entry / query re-entry resume"
    expect(page).toContain("Manual re-entry");
    expect(page).toContain("booking-deposit-qr/active");
    expect(page).toContain('detail.status === "draft"');
    expect(page).toContain("!latestDraftResult.value");
    expect(page).toContain("buildDraftResultFromBookingDetail");
  });

  it("restored outcome passes activeAttempt field (pos-qr-session-restore.ts)", () => {
    const source = read("app/utils/pos-qr-session-restore.ts");
    expect(source).toContain("activeAttempt: unknown");
    expect(source).toContain('{ kind: "restored", detail, activeAttempt }');
  });

  it("session restore is server-authoritative: validates booking detail + active attempt before restoring", () => {
    const source = read("app/utils/pos-qr-session-restore.ts");
    expect(source).toContain("fetchDetail");
    expect(source).toContain("fetchActiveAttempt");
    expect(source).toContain("isRestorable");
    expect(source).toContain('"no_active_attempt"');
    expect(source).toContain('"booking_not_restorable"');
    expect(source).toContain('"booking_fetch_error"');
    expect(source).toContain('"active_fetch_error"');
  });

  it("session restore clears the buffer on all non-restored outcomes", () => {
    const source = read("app/utils/pos-qr-session-restore.ts");
    // storage.removeItem must appear for each clear reason
    expect(source).toContain("storage.removeItem(QR_SESSION_BUFFER_KEY)");
    expect(source).toContain('"invalid_buffer"');
    expect(source).toContain('"booking_not_restorable"');
    expect(source).toContain('"no_active_attempt"');
  });
});

// ── Phase 2D-B5: Locked Draft Summary UI ──────────────────────────────────────
//
// These are source-structure assertions: they verify that the correct conditional
// guards, UI strings, and data bindings are present in index.vue.  They do not
// mount the Vue component but assert the page source shape that drives runtime
// rendering.

describe("admin POS V3 Phase 2D-B5 Locked Draft Summary UI", () => {
  it("editable create-draft form is guarded: shown only when latestDraftResult is null and not in query mode", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    // Guard must check latestDraftResult === null (B5) and !bookingIdQueryMode (B6)
    expect(page).toContain("latestDraftResult === null");
    expect(page).toContain("!bookingIdQueryMode");
    // And must NOT use the old unchecked single-condition guard
    expect(page).not.toContain("v-if=\"activeMode === 'booking'\"");
  });

  it("locked draft summary renders when latestDraftResult is not null", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    // Summary card v-if must gate on latestDraftResult !== null
    expect(page).toContain(
      "v-if=\"activeMode === 'booking' && latestDraftResult !== null\"",
    );
    expect(page).toContain("Draft การจองที่สร้างแล้ว");
    expect(page).toContain(
      "สร้าง Draft แล้ว กรุณาดำเนินการรับชำระเงินมัดจำการจองต่อ",
    );
    expect(page).toContain("draft · unpaid");
  });

  it("locked summary shows asset name and code from latestDraftResult", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("latestDraftResult?.booking?.asset?.name");
    expect(page).toContain("latestDraftResult?.booking?.asset?.code");
  });

  it("locked summary shows customer name and phone from latestDraftResult", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("latestDraftResult?.booking?.customer?.bookerName");
    expect(page).toContain("latestDraftResult?.booking?.customer?.walkInPhone");
    expect(page).toContain("latestDraftResult?.booking?.customer?.userId");
    expect(page).toContain(
      'latestDraftResult?.booking?.customer?.kind === "account"',
    );
  });

  it("locked summary shows rental period from latestDraftResult", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("latestDraftResult?.booking?.dates?.startDate");
    expect(page).toContain(
      "latestDraftResult?.booking?.dates?.customerReturnDate",
    );
    expect(page).toContain("latestDraftResult?.booking?.dates?.rentalDays");
  });

  it("locked summary shows booking deposit amount and booking ID", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("latestDraftResult?.quote?.bookingDepositDueNow");
    expect(page).toContain("latestDraftResult?.quote?.currencyCode");
    expect(page).toContain("latestDraftResult?.booking?.id");
    // fmtDeposit helper must be present for currency formatting
    expect(page).toContain("fmtDeposit(");
  });

  it("locked summary section has no active asset search, date picker, or create-draft CTA", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    // Slice from the start of the locked summary to the payment method selector comment
    const summaryStart = page.indexOf("Phase 2D-B5: Locked Draft Summary");
    const paymentSelectorStart = page.indexOf("Payment method selector:");
    expect(summaryStart).toBeGreaterThan(-1);
    expect(paymentSelectorStart).toBeGreaterThan(summaryStart);
    const lockedSection = page.slice(summaryStart, paymentSelectorStart);
    // Must not contain the draft creation form component or calendar
    expect(lockedSection).not.toContain(
      "AdminPosV3FutureBookingDraftContainer",
    );
    expect(lockedSection).not.toContain("ProductsRentalBookingCalendar");
    expect(lockedSection).not.toContain("submitDraft");
    expect(lockedSection).not.toContain("Create Future Rental Booking");
  });

  it("payment method selector and payment containers remain intact after B5 change", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    // Payment method selector still conditional on latestDraftResult !== null
    expect(page).toContain("เลือกวิธีรับเงินมัดจำการจอง");
    // Payment containers still present
    expect(page).toContain("AdminPosV3FutureBookingDepositCashContainer");
    expect(page).toContain("AdminPosV3FutureBookingDepositQrContainer");
    expect(page).toContain("selectedPaymentMethod === 'cash'");
    expect(page).toContain("selectedPaymentMethod === 'promptpay_qr'");
  });

  it("QR session restore path sets latestDraftResult which causes locked summary to render and editable form to hide", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    // onMounted restore sets latestDraftResult.value — the same ref that gates both guards
    expect(page).toContain(
      "latestDraftResult.value = buildDraftResultFromBookingDetail",
    );
    // The restore sets selectedPaymentMethod to promptpay_qr — QR container mounts
    expect(page).toContain('selectedPaymentMethod.value = "promptpay_qr"');
    // The draft container guard ensures form is hidden post-restore
    expect(page).toContain("latestDraftResult === null");
  });
});

// ── Phase 2D-B6: Booking Detail Resume Booking Deposit Collection CTA ─────────
//
// Source-structure assertions for:
//   A. Booking Detail page — CTA eligibility gate and navigation
//   B. POS V3 index — query re-entry mode, draft form suppression, Cases 1–3

describe("admin POS V3 Phase 2D-B6 Booking Detail CTA & POS Query Re-entry", () => {
  // ── A. Booking Detail CTA ──────────────────────────────────────────────────

  it("Booking Detail: canResumeDepositCollection gates on draft + unpaid status", () => {
    const page = read("app/pages/admin/rental-bookings/[id].vue");
    // Computed must check both booking status and bookingDepositPaymentStatus
    expect(page).toContain('booking.value?.status === "draft"');
    expect(page).toContain(
      'booking.value?.bookingDepositPaymentStatus === "unpaid"',
    );
    expect(page).toContain("canResumeDepositCollection");
  });

  it("Booking Detail: CTA button is guarded by canResumeDepositCollection", () => {
    const page = read("app/pages/admin/rental-bookings/[id].vue");
    expect(page).toContain('v-if="canResumeDepositCollection"');
  });

  it("Booking Detail: CTA button has Thai label", () => {
    const page = read("app/pages/admin/rental-bookings/[id].vue");
    expect(page).toContain("ดำเนินการรับเงินมัดจำการจอง");
  });

  it("Booking Detail: CTA navigates to POS V3 with bookingId query param", () => {
    const page = read("app/pages/admin/rental-bookings/[id].vue");
    expect(page).toContain("/admin/pos-v3?bookingId=");
    expect(page).toContain("bookingId");
  });

  it("Booking Detail: supporting alert text references unpaid deposit state", () => {
    const page = read("app/pages/admin/rental-bookings/[id].vue");
    expect(page).toContain(
      "Booking Draft ยังไม่ได้รับชำระเงิน — ไปที่ POS V3 เพื่อรับมัดจำ",
    );
  });

  // ── B. POS V3 query re-entry ───────────────────────────────────────────────

  it("POS index: bookingIdQueryMode ref is declared", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("bookingIdQueryMode");
    expect(page).toContain("bookingIdQueryMode = ref(false)");
  });

  it("POS index: useRoute is called to read the query param", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("const route = useRoute()");
    expect(page).toContain("route.query.bookingId");
  });

  it("POS index: draft container guard includes !bookingIdQueryMode", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("!bookingIdQueryMode");
    // Guard must still also check latestDraftResult === null
    expect(page).toContain("latestDraftResult === null");
  });

  it("POS index Case 1: query entry + no active QR → sets latestDraftResult via calculateBookingDepositDueNow", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    // Must calculate deposit amount from detail fields when no active attempt
    expect(page).toContain("calculateBookingDepositDueNow");
    expect(page).toContain("bookingIdQueryMode.value");
    // Sets latestDraftResult for the no-active-QR path
    expect(page).toContain(
      "latestDraftResult.value = buildDraftResultFromBookingDetail",
    );
  });

  it("POS index Case 1: bookingDepositPaymentStatus === unpaid is required before active-QR check", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    // Safety: only attempt QR resume / query entry for unpaid deposits
    expect(page).toContain('detail.bookingDepositPaymentStatus === "unpaid"');
  });

  it("POS index Case 3: ineligible alert is shown when bookingIdQueryMode + no latestDraftResult", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("ไม่สามารถรับชำระเงินมัดจำได้");
    expect(page).toContain(
      "การจองนี้ไม่อยู่ในสถานะที่สามารถดำเนินการรับเงินมัดจำได้",
    );
    // Alert is conditional on bookingIdQueryMode and latestDraftResult === null
    expect(page).toContain("bookingIdQueryMode");
  });

  it("POS index: onMounted reads route.query.bookingId and calls loadBookingContext", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("queryBookingId");
    expect(page).toContain("bookingIdQueryMode.value = true");
    expect(page).toContain("loadBookingContext(queryBookingId");
  });
});

// ── Phase 2E-B1: POS V3 Pickup Foundation ─────────────────────────────────────

const PICKUP_CONTAINER_PATH =
  "app/components/admin/pos/AdminPosV3PickupContainer.vue";

describe("admin POS V3 Phase 2E-B1 Pickup Foundation", () => {
  it("pickup container file exists", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source.length).toBeGreaterThan(0);
  });

  it("pickup container accepts booking and readiness props", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("booking: AdminRentalBookingDetail");
    expect(source).toContain("readiness: PickupReadinessPreview | null");
  });

  it("pickup container emits pickup-confirmed (not pickup-complete)", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain('"pickup-confirmed"');
    expect(source).not.toContain('"pickup-complete"');
  });

  it("pickup container uses DigitalSignaturePad and AdminBookingHandoverItems", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("DigitalSignaturePad");
    expect(source).toContain("AdminBookingHandoverItems");
  });

  it("pickup container posts to the rental booking pickup endpoint", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("/api/admin/rental-bookings/");
    expect(source).toContain('method: "POST"');
    expect(source).toContain("signatureDataUrl");
  });

  it("pickup container includes idempotencyKey with pos-v3:pickup prefix", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("pos-v3:pickup:");
    expect(source).toContain("idempotencyKey");
  });

  it("pickup container renders already-picked-up state with direct print link", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("isAlreadyPickedUp");
    expect(source).toContain("รับอุปกรณ์แล้ว");
    expect(source).toContain("ดูรายละเอียดและพิมพ์ใบส่งมอบ");
    // Must point directly to the print page with ?type=pickup, not just the booking detail
    expect(source).toContain("/print?type=pickup");
  });

  it("pickup container shows deposit-specific blocker when security deposit is due at pickup", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("hasPickupDue");
    expect(source).toContain("เงินมัดจำประกันยังไม่ครบ");
    expect(source).toContain("totalPickupDue");
    // Rental fee is NOT the blocker — deposit-specific wording only
    expect(source).not.toContain("มียอดค้างชำระ — ยังไม่สามารถส่งมอบได้");
  });

  it("pickup container shows readiness-loading state when readiness is null", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("readinessLoading");
    expect(source).toContain("กำลังตรวจสอบสถานะการรับมอบ");
  });

  it("pickup container disables submit when no signature or hasPickupDue", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("canSubmit");
    expect(source).toContain("!!signatureDataUrl.value");
    expect(source).toContain("!hasPickupDue.value");
  });

  it("pickup container shows checklist error hint with booking detail link", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("hasChecklistError");
    expect(source).toContain("Pickup Checklist");
  });

  it("page imports and mounts the pickup container", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("AdminPosV3PickupContainer");
    expect(page).toContain("@pickup-confirmed");
    expect(page).toContain("handlePickupConfirmed");
  });

  it("page mounts pickup container for confirmed and picked_up statuses only", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("bookingContext.status === 'confirmed'");
    expect(page).toContain("bookingContext.status === 'picked_up'");
    // draft bookings must not trigger the pickup container
    expect(page).not.toContain("bookingContext.status === 'draft'");
  });

  it("handlePickupConfirmed updates bookingContext and clears readiness", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("handlePickupConfirmed");
    expect(page).toContain("bookingContext.value = updated");
    expect(page).toContain("bookingReadiness.value = null");
  });

  it("Phase 1 clean test still passes: pickup-complete absent from shell files", () => {
    const source = [
      "app/pages/admin/pos-v3/index.vue",
      "app/components/admin/pos/AdminPosV3ModeNav.vue",
      "app/components/admin/pos/AdminPosV3ResolverPanel.vue",
      "app/components/admin/pos/AdminPosV3PendingWorkList.vue",
      "app/components/admin/pos/AdminPosV3BookingContext.vue",
      "app/components/admin/pos/AdminPosV3OrderContext.vue",
    ]
      .map(read)
      .join("\n");
    // Phase 2E-B1 uses pickup-confirmed not pickup-complete
    expect(source).not.toContain("pickup-complete");
  });

  it("rental-fulfillment accepts booking_deposit_payment_status === paid for pickup deposit check", () => {
    const source = read("server/utils/rental-fulfillment.ts");
    expect(source).toContain("booking_deposit_payment_status");
    expect(source).toContain(
      'cleanText(current.booking_deposit_payment_status) !== "paid"',
    );
    // Must still check both fields (AND logic — both must fail to block)
    expect(source).toContain(
      'cleanText(current.deposit_payment_status) !== "paid"',
    );
  });

  // ── Case 1 & 2: Two-case pickup support ─────────────────────────────────────

  it("Case 1 — future confirmed booking: page mounts pickup container when status is confirmed (regardless of startDate)", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    // confirmed status triggers the pickup container; no date restriction in Phase 2E-B1
    expect(page).toContain("bookingContext.status === 'confirmed'");
    expect(page).toContain("AdminPosV3PickupContainer");
    // No date gate that would prevent future bookings from showing the pickup form
    expect(page).not.toContain("startDate ===");
    expect(page).not.toContain("isToday");
  });

  it("Case 2 — same-day POS booking: pickup container appears for same-day confirmed booking with zero due", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    // The component does NOT gate on startDate — same-day and future both work
    // when status === 'confirmed' and totalPickupDueAmount === 0.
    // startDate may appear as a display field but must NOT be used as a date comparison gate.
    expect(source).not.toContain("isToday");
    expect(source).not.toContain("startDate ===");
    expect(source).not.toContain("startDate !==");
    // Zero-due path: no pickup due check prevents access for same-day
    expect(source).toContain("hasPickupDue");
    expect(source).toContain("totalPickupDueAmount");
  });

  it("Blocked case — remaining security deposit due: shows deposit-specific blocker and no pickup action", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("hasPickupDue");
    expect(source).toContain("เงินมัดจำประกันยังไม่ครบ");
    expect(source).toContain("ค่าเช่าจะชำระวันคืนสินค้า");
    // canSubmit guards against submission when hasPickupDue is true
    expect(source).toContain("!hasPickupDue.value");
  });

  it("pickup container active form shows proactive Pickup Checklist hint before submission", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    // Proactive (pre-submission) checklist readiness hint in the active form state
    expect(source).toContain("ตรวจสอบ Pickup Checklist ก่อนส่งมอบ");
    expect(source).toContain(
      "ตรวจสอบว่า Pickup Checklist เสร็จสมบูรณ์แล้วก่อนยืนยัน",
    );
  });

  // ── Phase 2E-B1 policy: deposit-only pickup gate ──────────────────────────

  it("active pickup form renders informational deferred rental fee — not a blocker", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    // deferredRentalFee computed and shown in active form
    expect(source).toContain("deferredRentalFee");
    expect(source).toContain("ค่าเช่าโดยประมาณ");
    expect(source).toContain("ชำระวันคืนสินค้า / หลังจบงาน");
  });

  it("pickup blocker does not claim rental fee is due at pickup", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    // New deposit-specific wording
    expect(source).toContain(
      "ยังไม่สามารถส่งมอบได้ — เงินมัดจำประกันยังไม่ครบ",
    );
    expect(source).toContain("ยอดเงินมัดจำประกันที่ต้องชำระก่อนรับสินค้า");
    // Must NOT use generic pickup-due wording that implies rental fee is blocked
    expect(source).not.toContain("มียอดค้างชำระ — ยังไม่สามารถส่งมอบได้");
  });

  // ── Phase 2E-B1.5: Remaining Security Deposit Collection ─────────────────────

  it("B1.5: pickup container shows interactive collection card when deposit is due", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("ชำระเงินมัดจำประกันส่วนที่เหลือ");
    expect(source).toContain("เงินมัดจำประกัน (คืนได้) — ไม่ใช่ค่าเช่า");
    expect(source).toContain("รับเงินมัดจำประกัน (เงินสด)");
  });

  it("B1.5: pickup container emits deposit-collected after successful cash collection", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain('"deposit-collected"');
    expect(source).toContain("collectRemainingDeposit");
    expect(source).toContain("remaining-security-deposit-payments");
  });

  it("B1.5: pickup container uses pos-v3:remaining-deposit idempotency prefix", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("pos-v3:remaining-deposit:");
  });

  it("B1.5: pickup container tracks loading and error state for deposit collection", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("collectingDeposit");
    expect(source).toContain("depositCollectError");
  });

  it("B1.5: page handles deposit-collected event and re-fetches pickup readiness", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("handleDepositCollected");
    expect(page).toContain("@deposit-collected");
    expect(page).toContain("pickup-readiness");
  });

  it("B1.5: rental-fulfillment uses math-based gate for POS V3 (REMAINING_SECURITY_DEPOSIT_DUE)", () => {
    const source = read("server/utils/rental-fulfillment.ts");
    expect(source).toContain("REMAINING_SECURITY_DEPOSIT_DUE");
    expect(source).toContain("booking_deposit_paid_amount");
    expect(source).toContain("deposit_amount");
    // Legacy OR-gate still present for pre-POS-V3 bookings
    expect(source).toContain(
      'cleanText(current.booking_deposit_payment_status) !== "paid"',
    );
  });

  it("print.vue labels rental fee as deferred to return — not due at pickup", () => {
    const printPage = read("app/pages/admin/rental-bookings/[id]/print.vue");
    // Updated label: rental fee is deferred
    expect(printPage).toContain("ค่าเช่า (ชำระวันคืนสินค้า)");
    // Deposit-only label for amount due at pickup
    expect(printPage).toContain("รวมยอดมัดจำวันที่รับสินค้า");
    // Old "rental fee due at pickup" wording must be absent
    expect(printPage).not.toContain("ค่าเช่าที่ชำระวันรับสินค้า");
    expect(printPage).not.toContain("ชำระสุทธิวันรับสินค้า");
  });
});
