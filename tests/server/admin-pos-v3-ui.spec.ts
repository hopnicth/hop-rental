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

  it("page imports and mounts the draft container", () => {
    const page = read("app/pages/admin/pos-v3/index.vue");
    expect(page).toContain("AdminPosV3FutureBookingDraftContainer");
    expect(page).toContain("@draft-created");
    expect(page).toContain("latestDraftResult");
    expect(page).toContain("handleDraftCreated");
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
});
