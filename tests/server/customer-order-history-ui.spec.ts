/**
 * Tests: Customer Order History UI — /user/orders
 *
 * Covers:
 *  1. Expandable item detail toggle (show / hide button, aria-expanded)
 *  2. Lazy-load via /api/user/orders/:id — correct endpoint, no pre-fetch
 *  3. Per-order loading and error states inside the expanded section
 *  4. Financial summary drawn from already-loaded OrderRecord fields
 *  5. Source-inspection safeguards: no storage paths, no direct DB fields
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ordersPage = readFileSync(
  resolve(process.cwd(), "app/pages/user/orders/index.vue"),
  "utf8",
);

describe("Order History — expand / collapse toggle", () => {
  it("renders a toggle button per order card", () => {
    expect(ordersPage).toContain("toggleDetails(order.id)");
    expect(ordersPage).toContain("isExpanded(order.id)");
  });

  it("toggle button carries aria-expanded for accessibility", () => {
    expect(ordersPage).toContain(":aria-expanded");
    expect(ordersPage).toContain(":aria-controls");
  });

  it("uses i18n keys for show and hide labels", () => {
    expect(ordersPage).toContain("ordersPage.items.showDetails");
    expect(ordersPage).toContain("ordersPage.items.hideDetails");
  });
});

describe("Order History — lazy item fetch", () => {
  it("calls the existing /api/user/orders/:id endpoint", () => {
    expect(ordersPage).toContain(
      "/api/user/orders/${encodeURIComponent(orderId)}",
    );
  });

  it("caches fetched items and skips re-fetch on re-expand", () => {
    expect(ordersPage).toContain(
      "detailItems.value[orderId] !== undefined",
    );
  });

  it("shows per-order loading state while fetching", () => {
    expect(ordersPage).toContain("loadingDetails[order.id]");
    expect(ordersPage).toContain("ordersPage.items.loading");
    expect(ordersPage).toContain("animate-spin");
  });

  it("shows per-order error state on fetch failure", () => {
    expect(ordersPage).toContain("detailError[order.id]");
    expect(ordersPage).toContain("ordersPage.items.loadError");
  });
});

describe("Order History — expanded item rows", () => {
  it("renders product thumbnail with NuxtImg (not img)", () => {
    expect(ordersPage).toContain("NuxtImg");
    expect(ordersPage).not.toContain("<img ");
  });

  it("shows fallback icon when thumbnail is absent", () => {
    expect(ordersPage).toContain("v-if=\"item.thumbnail\"");
    expect(ordersPage).toContain("v-else");
  });

  it("renders quantity, unit price, and line total", () => {
    expect(ordersPage).toContain("item.quantity");
    expect(ordersPage).toContain("item.unitPrice");
    expect(ordersPage).toContain("item.lineTotal");
  });

  it("renders financial summary from order record fields", () => {
    expect(ordersPage).toContain("order.subtotal");
    expect(ordersPage).toContain("order.discountTotal");
    expect(ordersPage).toContain("order.shippingCost");
    expect(ordersPage).toContain("ordersPage.items.subtotal");
    expect(ordersPage).toContain("ordersPage.items.discount");
    expect(ordersPage).toContain("ordersPage.items.shipping");
    expect(ordersPage).toContain("ordersPage.items.grandTotal");
  });
});

describe("Order History — safety invariants", () => {
  it("does not reference storage paths", () => {
    expect(ordersPage).not.toContain("storage_path");
    expect(ordersPage).not.toContain("storage_bucket");
  });

  it("preserves cancelled-bookings refund tracking section", () => {
    expect(ordersPage).toContain(
      "/api/user/rental-bookings/refund-tracking-status",
    );
    expect(ordersPage).toContain("ordersPage.rentalHistory.refundStatusLine");
    expect(ordersPage).toContain("hasCancellationConfirmation(booking)");
    expect(ordersPage).toContain("hasRefundConfirmation(booking)");
    expect(ordersPage).toContain("hasHistoryRefundProof(booking)");
  });
});
