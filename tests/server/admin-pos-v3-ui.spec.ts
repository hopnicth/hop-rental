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

  it("same-day button uses sameDaySubmitting prop for loading/disabled state", () => {
    const source = read(CONTAINER_PATH);
    // prop declared
    expect(source).toContain("sameDaySubmitting");
    // button loading/disabled wired to the prop for same-day path
    expect(source).toContain("props.sameDaySubmitting");
  });

  it("same-day money policy card is shown when isSameDayRentalIntent and calendarPayload.isValid", () => {
    const source = read(CONTAINER_PATH);
    // v-if condition
    expect(source).toContain(
      "isSameDayRentalIntent && calendarPayload.isValid",
    );
    // header label
    expect(source).toContain("Walk-in Same-Day Rental");
    // rental fee deferred wording
    expect(source).toContain("ชำระวันคืนสินค้า");
    // deposit due at pickup wording
    expect(source).toContain("ชำระเมื่อรับสินค้า");
    // booking deposit not applicable
    expect(source).toContain("Booking Deposit");
    expect(source).toContain("ไม่ใช้ / ฿0");
  });

  it("same-day inline error alert is rendered from sameDayError prop when set", () => {
    const source = read(CONTAINER_PATH);
    expect(source).toContain("props.sameDayError");
    expect(source).toContain("สร้างการจอง Walk-in Same-Day ไม่สำเร็จ");
  });

  // ── Page-level state ──────────────────────────────────────────────────────

  it("page imports and mounts the draft container", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("AdminPosV3FutureBookingDraftContainer");
    expect(page).toContain("@draft-created");
    expect(page).toContain("latestDraftResult");
    expect(page).toContain("handleDraftCreated");
  });

  it("page has latestSameDayIntent state, same-day-rental-intent listener, and same-day endpoint wiring", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("latestSameDayIntent");
    expect(page).toContain("handleSameDayIntent");
    expect(page).toContain("@same-day-rental-intent");
    expect(page).toContain("/api/admin/pos-v3/rental-bookings/same-day");
    expect(page).toContain("loadBookingContext(result.booking.id");
  });

  it("handleSameDayIntent updates URL with bookingId after same-day success for refresh restore", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    // useRouter().replace must be called with bookingId after booking created
    expect(page).toContain("useRouter().replace");
    expect(page).toContain("bookingId: result.booking.id");
    // query re-entry path must still read bookingId from URL on mount
    expect(page).toContain("route.query.bookingId");
    expect(page).toContain("loadBookingContext(queryBookingId");
  });

  it("query-mode deposit alert is suppressed for confirmed bookings (same-day re-entry polish)", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    // Confirmed bookings use the pickup container, not the deposit-ineligible alert
    expect(page).toContain("bookingContext?.status !== 'confirmed'");
  });

  it("latestDraftResult and latestSameDayIntent are stored separately on the page", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("latestDraftResult");
    expect(page).toContain("latestSameDayIntent");
    // They must be separate refs
    expect(page).toContain("latestDraftResult = ref");
    expect(page).toContain("latestSameDayIntent = ref");
  });

  it("page has sameDayBookingCreated ref to gate draft container visibility after same-day success", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("sameDayBookingCreated");
    // set to true only after endpoint + context load succeeds
    expect(page).toContain("sameDayBookingCreated.value = true");
    // draft container v-if includes this gate
    expect(page).toContain("!sameDayBookingCreated");
  });

  it("page has sameDaySubmitting and sameDayError refs set in handleSameDayIntent finally", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("sameDaySubmitting = ref(false)");
    expect(page).toContain("sameDayError = ref");
    expect(page).toContain("sameDaySubmitting.value = true");
    expect(page).toContain("sameDaySubmitting.value = false");
    expect(page).toContain("sameDayError.value = null");
  });

  it("page passes sameDaySubmitting and sameDayError props to draft container", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain(":same-day-submitting");
    expect(page).toContain(":same-day-error");
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

  it("Container 1 does not include cash finalization or pickup controls", () => {
    const source = read(CONTAINER_PATH);
    const page = read("app/pages/admin/pos-v3/index.vue");
    // Container 1 source must never contain payment finalization or pickup logic
    expect(source).not.toContain("booking-deposit-payments");
    expect(source).not.toContain("pickup-complete");
    expect(source).not.toContain("instant-rental");
    // Page must continue to avoid introducing a separate same-day container.
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

  it("pickup container uses DigitalSignaturePad (AdminBookingHandoverItems removed from POS V3 pickup)", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("DigitalSignaturePad");
    // Handover Items removed from POS V3 pickup — staff check items physically with customer.
    expect(source).not.toContain("AdminBookingHandoverItems");
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

  it("pickup container active form shows inline AdminBookingChecklists (B2 replaces old hint)", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    // B2: inline checklist component replaces the old proactive-only alert
    expect(source).toContain("AdminBookingChecklists");
    // Fallback link to booking detail still present
    expect(source).toContain("เปิดหน้ารายละเอียดการจอง");
    // Old standalone hint text is gone — inline component takes its place
    expect(source).not.toContain("ตรวจสอบ Pickup Checklist ก่อนส่งมอบ");
    expect(source).not.toContain(
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
    expect(source).toContain(
      "ยังไม่สามารถส่งมอบได้ — ต้องรับเงินมัดจำประกันก่อน",
    );
    expect(source).toContain("ยอดเงินมัดจำประกันที่ต้องชำระก่อนรับสินค้า");
    // Must NOT use generic pickup-due wording that implies rental fee is blocked
    expect(source).not.toContain("มียอดค้างชำระ — ยังไม่สามารถส่งมอบได้");
  });

  // ── Phase 2E-B1.5: Remaining Security Deposit Collection ─────────────────────

  it("B1.5: pickup container shows interactive collection card when deposit is due", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    // Neutral Thai label (works for both same-day and future bookings)
    expect(source).toContain("มัดจำประกันที่ต้องชำระตอนรับของ");
    expect(source).toContain("เงินมัดจำประกัน (คืนได้) — ไม่ใช่ค่าเช่า");
    // Old misleading wording must be gone from the collection card
    expect(source).not.toContain("ชำระเงินมัดจำประกันส่วนที่เหลือ");
    expect(source).not.toContain("รับเงินมัดจำประกัน (เงินสด)");
  });

  it("B1.5: cashier UX — cash received input and change calculation", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("รับเงินสดจากลูกค้า");
    expect(source).toContain("cashReceived");
    expect(source).toContain("เงินทอน");
    expect(source).toContain("change");
  });

  it("B1.5: cashier UX — insufficient cash shows warning and blocks confirm", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain(
      "รับเงินสดยังไม่ครบมัดจำประกันที่ต้องชำระตอนรับของ",
    );
    expect(source).toContain("cashInsufficient");
    expect(source).toContain("canCollectDeposit");
    // Confirm button must be disabled when canCollectDeposit is false
    expect(source).toContain(':disabled="!canCollectDeposit"');
  });

  it("B1.5: cashier UX — confirm button label and endpoint sends amountDue not cashReceived", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("ยืนยันรับมัดจำประกัน");
    // amount sent is remainingDepositDue (amountDue), not cashReceived
    expect(source).toContain("amount: remainingDepositDue.value");
    // cashReceived must NOT be forwarded to the endpoint
    expect(source).not.toContain("amount: cashReceived");
  });

  it("same-day pickup UI shows no Booking Deposit and keeps rental fee deferred", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("Booking Deposit");
    expect(source).toContain("ไม่ใช้ / ฿0");
    expect(source).toContain("Refundable security deposit due at pickup");
    expect(source).not.toContain("รับชำระค่าเช่า");
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

  // ── Phase 2E-B2: Inline Pickup Checklist ─────────────────────────────────────

  it("B2: pickup container accepts checklists and templates props", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("checklists: AdminBookingChecklist[]");
    expect(source).toContain("templates: AssetChecklistTemplateSummary[]");
  });

  it("B2: pickup container mounts AdminBookingChecklists in the active pickup form", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("AdminBookingChecklists");
    expect(source).toContain(':checklists="checklists"');
    expect(source).toContain(':templates="templates"');
    expect(source).toContain("@updated");
  });

  it("B2: hasCompletedPickupChecklist is true when a pickup checklist status is completed", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("hasCompletedPickupChecklist");
    expect(source).toContain('c.kind === "pickup" && c.status === "completed"');
  });

  it("B2: confirm button is disabled when no completed pickup checklist exists", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    // canSubmit requires hasCompletedPickupChecklist
    expect(source).toContain("hasCompletedPickupChecklist.value");
    expect(source).toContain(':disabled="!canSubmit"');
  });

  it("B2: pickup container emits checklist-updated when AdminBookingChecklists emits updated", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain('"checklist-updated"');
    expect(source).toContain("$emit('checklist-updated', $event)");
  });

  it("B2: POS V3 index fetches ops endpoint when confirmed booking context is loaded", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("loadPickupOps");
    expect(page).toContain("/ops");
    expect(page).toContain("pickupOps");
  });

  it("B2: POS V3 index passes checklists and templates props to pickup container", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain(':checklists="pickupOps?.checklists ?? []"');
    expect(page).toContain(':templates="pickupOps?.templates ?? []"');
  });

  it("B2: POS V3 index handles checklist-updated and refreshes pickupOps", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("handleChecklistUpdated");
    expect(page).toContain("@checklist-updated");
  });

  it("B2: clearBookingContext clears pickupOps", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("clearBookingContext");
    expect(page).toContain("pickupOps.value = null");
  });

  it("B2: no pickup audit trail fields displayed (pickup_at, branch, staff, signature) — deferred to B3", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    const page = read("app/pages/admin/pos-v3/index.vue");
    // B2 must not claim to display pickup_at, branch, or staff audit trail
    expect(source).not.toContain("pickup_at");
    expect(source).not.toContain("pickupBranchId");
    expect(source).not.toContain("performedByUserId");
    expect(source).not.toContain("signature_url");
    expect(page).not.toContain("pickup_at");
    expect(page).not.toContain("pickupBranchId");
  });

  // ── Phase 2E-B2 UX corrections (gatekeeper fixes) ────────────────────────────

  it("B2-fix: deposit summary 'มัดจำประกันที่ต้องชำระตอนรับของ' is visible in State 4 (deposit cleared)", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    // Must appear in State 4 (v-else block), not only in State 3 (v-else-if hasPickupDue)
    expect(source).toContain("มัดจำประกันที่ต้องชำระตอนรับของ");
    // Cleared/paid status badge
    expect(source).toContain("ชำระครบแล้ว");
    // Deposit amount from booking object
    expect(source).toContain("booking.depositAmount");
  });

  it("B2-fix: deposit summary shows rental fee as deferred, not collected at pickup", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("ค่าเช่าจะชำระวันคืนสินค้า / หลังจบงาน");
    expect(source).toContain("ไม่ใช่ยอดที่ต้องชำระตอนรับของ");
    // Rental fee amount is informational only — still computed
    expect(source).toContain("deferredRentalFee");
  });

  it("B2-fix: Pickup Checklist section has its numbered label (Handover Items section removed)", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    // Section 1 label remains
    expect(source).toContain("1. Pickup Checklist");
    // Section 2 (Handover Items) removed — staff check items physically with customer
    expect(source).not.toContain("2. รายการสินค้า / อุปกรณ์ที่ส่งมอบ");
  });

  it("B2-fix: no misleading POS V2 wording in POS V3 pickup container", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).not.toContain("POS V2");
    expect(source).not.toContain("future POS");
  });

  it("B2-fix: no misleading POS V2 subtitle in handover items component", () => {
    const handover = read("app/components/admin/AdminBookingHandoverItems.vue");
    expect(handover).not.toContain("for future POS V2");
    expect(handover).not.toContain("future POS V2 pickup/return");
  });

  it("B2-fix: AdminBookingChecklists receives :auto-expand=true in POS pickup context", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain(':auto-expand="true"');
  });

  it("B2-fix: AdminBookingChecklists supports autoExpand prop that auto-expands items", () => {
    const checklist = read("app/components/admin/AdminBookingChecklists.vue");
    expect(checklist).toContain("autoExpand");
    // Watch expands items when prop is true
    expect(checklist).toContain("expanded.value[c.id] = true");
  });

  // ── Phase 2E-B2 UX corrections Round 2 (gate stalling + money wording) ──────

  it("B2-fix2: AdminBookingChecklists has completeChecklist for POS context (draft→in_progress→completed in one action)", () => {
    const checklist = read("app/components/admin/AdminBookingChecklists.vue");
    // Function must exist
    expect(checklist).toContain("completeChecklist");
    // Handles draft → in_progress first, then completed
    expect(checklist).toContain('status: "in_progress"');
    expect(checklist).toContain('status: "completed"');
    // Label on the prominent button
    expect(checklist).toContain("Complete Checklist");
    // Only shows in POS (autoExpand) context
    expect(checklist).toContain("autoExpand");
  });

  it("B2-fix2: AdminBookingChecklists 'Complete Checklist' button is hidden for completed/cancelled checklists", () => {
    const checklist = read("app/components/admin/AdminBookingChecklists.vue");
    // Button must be guarded by status check
    expect(checklist).toContain("c.status !== 'completed'");
    expect(checklist).toContain("c.status !== 'cancelled'");
  });

  it("B2-fix2: pickup container exposes pickupBlockingReason computed for near-button hint", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("pickupBlockingReason");
    // Both blocking messages must be present
    expect(source).toContain("ต้องสร้าง Pickup Checklist ก่อนยืนยันรับอุปกรณ์");
    expect(source).toContain("ต้องกด Complete Checklist ก่อนยืนยันรับอุปกรณ์");
  });

  it("B2-fix2: pickup container shows pickupBlockingReason alert near the disabled Confirm Pickup button", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    // Alert bound to pickupBlockingReason
    expect(source).toContain('v-if="pickupBlockingReason"');
    expect(source).toContain(':title="pickupBlockingReason"');
  });

  it("B2-fix2: BookingContext no longer shows ambiguous 'Pickup due' label", () => {
    const bookingContext = read(
      "app/components/admin/pos/AdminPosV3BookingContext.vue",
    );
    // Old ambiguous label must be gone
    expect(bookingContext).not.toContain("Pickup due:");
    expect(bookingContext).not.toContain("Pickup due: ");
  });

  it("B2-fix2: BookingContext shows ยอดค้างชำระตอนรับของ for the outstanding pickup amount", () => {
    const bookingContext = read(
      "app/components/admin/pos/AdminPosV3BookingContext.vue",
    );
    expect(bookingContext).toContain("ยอดค้างชำระตอนรับของ");
    expect(bookingContext).toContain("totalPickupDueAmount");
  });

  it("B2-fix2: BookingContext readiness alert also shows ยอดมัดจำประกันรวม to distinguish from outstanding", () => {
    const bookingContext = read(
      "app/components/admin/pos/AdminPosV3BookingContext.vue",
    );
    expect(bookingContext).toContain("ยอดมัดจำประกันรวม");
    // Uses booking.depositAmount for the total (not the outstanding amount)
    expect(bookingContext).toContain("booking?.depositAmount");
  });

  it("B2-fix2: BookingContext operationHint for confirmed booking no longer says 'plug in later'", () => {
    const bookingContext = read(
      "app/components/admin/pos/AdminPosV3BookingContext.vue",
    );
    expect(bookingContext).not.toContain("Pickup path will plug in later");
    // Return path hint for picked_up is still present (regression guard)
    expect(bookingContext).toContain("Return path will plug in later");
  });

  // ── Handover Items removal from POS V3 pickup (product decision) ─────────────

  it("Handover Items removal: pickup container does NOT import AdminBookingHandoverItems", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).not.toContain("AdminBookingHandoverItems");
  });

  it("Handover Items removal: pickup container does NOT render รายการสินค้า / อุปกรณ์ที่ส่งมอบ", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).not.toContain("รายการสินค้า / อุปกรณ์ที่ส่งมอบ");
  });

  it("Handover Items removal: pickup container does NOT render handover item helper text", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).not.toContain(
      "รายการที่เตรียมส่งมอบให้ลูกค้า — ตรวจสอบก่อนส่งมอบจริง",
    );
  });

  it("Handover Items removal: pickup container does NOT render สร้างรายการตั้งต้นจากสินค้าที่จอง", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).not.toContain("สร้างรายการตั้งต้นจากสินค้าที่จอง");
  });

  it("Handover Items removal: AdminBookingHandoverItems reusable component still exists (not deleted)", () => {
    const source = read("app/components/admin/AdminBookingHandoverItems.vue");
    expect(source.length).toBeGreaterThan(0);
  });

  it("Handover Items removal: Pickup Checklist section still renders in State 4", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("AdminBookingChecklists");
    expect(source).toContain("1. Pickup Checklist");
  });

  it("Handover Items removal: pickup gate unchanged — requires completed checklist + signature + deposit clear", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("hasCompletedPickupChecklist.value");
    expect(source).toContain("!!signatureDataUrl.value");
    expect(source).toContain("!hasPickupDue.value");
    // Handover items must NOT be part of the gate
    expect(source).not.toContain("handoverItems");
    expect(source).not.toContain("handover_items");
  });

  it("Handover Items removal: deposit wording regression — มัดจำประกันที่ต้องชำระตอนรับของ still present in State 4", () => {
    const source = read(PICKUP_CONTAINER_PATH);
    expect(source).toContain("มัดจำประกันที่ต้องชำระตอนรับของ");
    expect(source).toContain("ชำระครบแล้ว");
    expect(source).toContain("booking.depositAmount");
  });
});

// ── Phase 2E-B2: Booking Detail → POS V3 Resume Action ────────────────────────
//
// Source-structure assertions for the "ไปทำต่อใน POS V3" CTA added to the
// rental booking detail page.  These do NOT mount the Vue component — they
// assert the page source shape that drives runtime rendering.

describe("admin POS V3 Phase 2E-B2 Booking Detail → POS V3 Resume Action", () => {
  const BOOKING_DETAIL_PATH = "app/pages/admin/rental-bookings/[id].vue";

  it("Booking Detail: canResumePosV3Pickup computed is declared", () => {
    const page = read(BOOKING_DETAIL_PATH);
    expect(page).toContain("canResumePosV3Pickup");
  });

  it("Booking Detail: canResumePosV3Pickup gates on confirmed status only", () => {
    const page = read(BOOKING_DETAIL_PATH);
    // Must check status === 'confirmed' — confirmed is the pickup-ready state
    expect(page).toContain('booking.value?.status === "confirmed"');
  });

  it("Booking Detail: CTA alert is guarded by canResumePosV3Pickup", () => {
    const page = read(BOOKING_DETAIL_PATH);
    expect(page).toContain('v-if="canResumePosV3Pickup"');
  });

  it("Booking Detail: CTA button has Thai label ไปทำต่อใน POS V3", () => {
    const page = read(BOOKING_DETAIL_PATH);
    expect(page).toContain("ไปทำต่อใน POS V3");
  });

  it("Booking Detail: CTA navigates to /admin/pos-v3?bookingId=", () => {
    const page = read(BOOKING_DETAIL_PATH);
    // Must use the exact path prefix — bookingId is dynamic
    expect(page).toContain("/admin/pos-v3?bookingId=");
  });

  it("Booking Detail: CTA link binds the bookingId from page context", () => {
    const page = read(BOOKING_DETAIL_PATH);
    // The :to binding must interpolate bookingId
    expect(page).toContain("`/admin/pos-v3?bookingId=${bookingId}`");
  });

  it("Booking Detail: CTA helper text mentions resuming from latest booking state", () => {
    const page = read(BOOKING_DETAIL_PATH);
    expect(page).toContain(
      "เปิดหน้ารับของและทำต่อจากสถานะล่าสุดของ booking นี้",
    );
  });

  it("Booking Detail: CTA label does not mention POS V2", () => {
    const page = read(BOOKING_DETAIL_PATH);
    // Slice the canResumePosV3Pickup alert section only
    const alertStart = page.indexOf("canResumePosV3Pickup");
    const alertEnd = page.indexOf("</UAlert>", alertStart);
    expect(alertStart).toBeGreaterThan(-1);
    expect(alertEnd).toBeGreaterThan(alertStart);
    const ctaSection = page.slice(alertStart, alertEnd);
    expect(ctaSection).not.toContain("POS V2");
  });

  it("Booking Detail: POS V3 re-entry via bookingId query param is the same path used by both CTAs", () => {
    const page = read(BOOKING_DETAIL_PATH);
    // Both the deposit CTA and the pickup CTA use the same /admin/pos-v3?bookingId= path
    const matches = [...page.matchAll(/\/admin\/pos-v3\?bookingId=/g)];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("POS V3: bookingId query param re-entry support still reads route.query.bookingId on mount", () => {
    const posPage = read("app/pages/admin/pos-v3/index.vue");
    expect(posPage).toContain("route.query.bookingId");
    expect(posPage).toContain("bookingIdQueryMode.value = true");
    expect(posPage).toContain("loadBookingContext(queryBookingId");
  });

  it("POS V3: confirmed booking triggers pickup container (not deposit form) on re-entry", () => {
    const posPage = read("app/pages/admin/pos-v3/index.vue");
    // Pickup container is mounted for confirmed status
    expect(posPage).toContain("bookingContext.status === 'confirmed'");
    expect(posPage).toContain("AdminPosV3PickupContainer");
    // Ineligible-deposit alert is suppressed for confirmed bookings
    expect(posPage).toContain("bookingContext?.status !== 'confirmed'");
  });

  it("POS V3: existing pickup regression — deposit wording must remain correct", () => {
    const source = read(
      "app/components/admin/pos/AdminPosV3PickupContainer.vue",
    );
    // Locked deposit label (regression guard)
    expect(source).toContain("มัดจำประกันที่ต้องชำระตอนรับของ");
    // No ambiguous pickup-due wording
    expect(source).not.toContain("มียอดค้างชำระ — ยังไม่สามารถส่งมอบได้");
  });
});

// ── Phase 2E-B2 QR: Pickup deposit tender selector regression lock ─────────────

describe("admin POS V3 Phase 2E-B2 QR pickup deposit tender selector", () => {
  const PICKUP_CONTAINER_PATH =
    "app/components/admin/pos/AdminPosV3PickupContainer.vue";

  it("State 3 shows tender selector: staff must choose Cash or QR before collecting", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("depositTenderMethod");
    expect(src).toContain("เลือกวิธีรับชำระมัดจำประกัน");
  });

  it("State 3 Cash button is present in tender selector", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain('"cash"');
    expect(src).toContain("Cash");
  });

  it("State 3 QR Code button is present in tender selector", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain('"qr"');
    expect(src).toContain("QR Code");
  });

  it("Cash path remains unchanged: shows cash input, change, and confirm button", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("depositTenderMethod === 'cash'");
    expect(src).toContain("รับเงินสดจากลูกค้า");
    expect(src).toContain("cashReceived");
    expect(src).toContain("เงินทอน");
    expect(src).toContain("ยืนยันรับมัดจำประกัน");
    expect(src).toContain("collectRemainingDeposit");
  });

  it("QR path mounts AdminPosV3PickupDepositQrCard component", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("depositTenderMethod === 'qr'");
    expect(src).toContain("AdminPosV3PickupDepositQrCard");
  });

  it("QR path wires @deposit-collected to emit parent deposit-collected event", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("@deposit-collected");
    expect(src).toContain("emit('deposit-collected')");
  });

  it("no BDC document link or document print appears in the pickup QR card", () => {
    const qrCard = read(
      "app/components/admin/pos/AdminPosV3PickupDepositQrCard.vue",
    );
    expect(qrCard).not.toContain("officialDocumentId");
    expect(qrCard).not.toContain("documentNo");
    expect(qrCard).not.toContain("openBookingDepositDocumentPrint");
  });

  it("deposit wording regression: มัดจำประกันที่ต้องชำระตอนรับของ locked in State 3", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("มัดจำประกันที่ต้องชำระตอนรับของ");
  });

  it("Confirm Pickup gate remains deposit clear + checklist + signature (unchanged)", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("hasCompletedPickupChecklist.value");
    expect(src).toContain("!!signatureDataUrl.value");
    expect(src).toContain("!hasPickupDue.value");
    // handover items must not be part of the gate
    expect(src).not.toContain("handoverItems");
  });

  it("rental fee deferred wording remains unchanged after QR addition", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("ค่าเช่าจะชำระวันคืนสินค้า / หลังจบงาน");
  });

  it("no POS V2 references added to pickup container", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).not.toContain("POS V2");
    expect(src).not.toContain("pos-v2");
  });

  // ── Bug fix regression: manual-review lock prevents duplicate payment ──────────

  it("QR card shows locked manual-review warning (ห้ามรับชำระซ้ำ) in gateway-paid-confirm-failed state", () => {
    const src = read(
      "app/components/admin/pos/AdminPosV3PickupDepositQrCard.vue",
    );
    expect(src).toContain("ห้ามรับชำระซ้ำ");
    expect(src).toContain("พบการชำระเงินจาก Omise แล้ว");
    expect(src).toContain("isGatewayPaidManualReview");
  });

  it("QR card regenerate button is hidden in manual-review locked state", () => {
    const src = read(
      "app/components/admin/pos/AdminPosV3PickupDepositQrCard.vue",
    );
    // Must not show regenerate in manual-review state
    expect(src).toContain("!isGatewayPaidManualReview");
    expect(src).not.toContain('v-if="createError || canRegenerate"');
  });

  it("QR card normal expired/failed QR can still retry (canRegenerate still exists)", () => {
    const src = read(
      "app/components/admin/pos/AdminPosV3PickupDepositQrCard.vue",
    );
    // canRegenerate computed still exists for expired/failed/cancelled
    expect(src).toContain("canRegenerate");
    expect(src).toContain("isExpired");
    expect(src).toContain("isFailed");
  });

  it("Pickup container cash/QR paths are hidden when isCashManualReviewLocked", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("isCashManualReviewLocked");
    expect(src).toContain(
      "!isCashManualReviewLocked && depositTenderMethod === null",
    );
    expect(src).toContain("ห้ามรับชำระซ้ำ");
  });

  it("Cash tender still works normally when no manual-review lock exists", () => {
    const src = read(PICKUP_CONTAINER_PATH);
    expect(src).toContain("depositTenderMethod === 'cash'");
    expect(src).toContain("collectRemainingDeposit");
    expect(src).toContain("ยืนยันรับมัดจำประกัน");
  });
});
