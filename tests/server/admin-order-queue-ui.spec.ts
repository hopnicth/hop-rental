import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("app/pages/admin/orders/index.vue", "utf8");
const composable = readFileSync("app/composables/useAdminOrderQueue.ts", "utf8");

describe("admin sale order queue UI wiring", () => {
  it("uses the sale order queue endpoint and defaults to action_required", () => {
    expect(page).toContain("useAdminOrderQueue()");
    expect(composable).toContain('"/api/admin/orders/queue"');
    expect(composable).toContain('"action_required"');
    expect(composable).toContain("router.replace");
    expect(composable).toContain("pageSize");
  });

  it("renders operations queue header, summary cards, tabs, and backend summary counts", () => {
    expect(page).toContain("คำสั่งซื้อ");
    expect(page).toContain("ติดตามคำสั่งซื้อที่ต้องชำระ");
    expect(page).toContain("Sale Order Operations Queue");
    expect(page).toContain("summaryCount(card)");
    expect(page).toContain("summary.value[card.summaryKey]");

    for (const label of [
      "ต้องจัดการ",
      "ต้องจัดส่ง",
      "ลูกค้ารับเอง",
      "รอชำระ",
      "ทั้งหมด",
    ]) {
      expect(page).toContain(label);
    }
  });

  it("syncs card/tab queue changes and exposes endpoint query values", () => {
    expect(page).toContain('@click="setQueue(card.value)"');
    expect(page).toContain('@click="setQueue(tab.value)"');
    expect(composable).toContain("queue: filters.queue");

    for (const queue of [
      "action_required",
      "delivery",
      "pickup",
      "awaiting_payment",
      "all",
    ]) {
      expect(page + composable).toContain(queue);
    }
  });

  it("keeps sale-order-only filters and removes old grouped/rental wording", () => {
    for (const label of [
      "Search",
      "Date from",
      "Date to",
      "Order status",
      "Payment status",
      "Fulfillment status",
    ]) {
      expect(page).toContain(label);
    }

    expect(page).not.toContain("Orders & Bookings");
    expect(page).not.toContain("Customer-grouped view");
    expect(page).not.toContain("Rental bookings");
    expect(page).not.toContain("Rental status");
    expect(page).not.toContain("Storage branch (rental only)");
    expect(page).not.toContain("Showing {{ items.length }} of {{ total }} customers");
    expect(page).not.toContain("No customers match the current filters");
    expect(page).not.toContain("/api/admin/orders/customers");
  });

  it("renders compact desktop/mobile rows with bounded desktop scroll", () => {
    expect(page).toContain("max-h-[calc(100vh-28rem)]");
    expect(page).toContain("overflow-y-auto");
    expect(page).toContain("hidden md:block");
    expect(page).toContain("md:hidden");
    expect(page).toContain("Showing {{ visibleRangeStart }}");
    expect(page).toContain("{{ total }} orders");
    expect(page).toContain("Page {{ page + 1 }}");
  });

  it("handles legacy/unknown fulfillment and pickup branch fallbacks", () => {
    expect(page).toContain("วิธีส่งมอบไม่ระบุ");
    expect(page).toContain("Legacy / ตรวจสอบข้อมูลคำสั่งซื้อ");
    expect(page).toContain("ยังไม่ระบุสาขา");
    expect(page).toContain("order.pickupBranch?.name");
  });

  it("includes loading, empty, error, retry, and order-level pagination states", () => {
    expect(page).toContain("USkeleton");
    expect(page).toContain("emptyStateMessage()");
    expect(page).toContain("Retry");
    expect(page).toContain("goToPage(page - 1)");
    expect(page).toContain("goToPage(page + 1)");
    expect(composable).toContain("hasMore.value = data.hasMore");
    expect(composable).toContain("total.value = data.total");
  });
});
