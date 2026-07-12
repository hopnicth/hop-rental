import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("admin booking handover item UI wiring", () => {
  it("renders the handover items component on rental booking detail", () => {
    const page = read("app/pages/admin/rental-bookings/[id].vue");
    expect(page).toContain("<AdminBookingHandoverItems");
    expect(page).toContain(':booking-status="booking.status"');
  });

  it("supports empty state, generate, CRUD endpoints, and read-only lifecycle copy", () => {
    const component = read(
      "app/components/admin/AdminBookingHandoverItems.vue",
    );
    // Current panel heading (AdminBookingHandoverItems.vue:168) — renamed from
    // the original "รายการเตรียมส่งมอบและรับคืน".
    expect(component).toContain("รายการสินค้า / อุปกรณ์ที่ส่งมอบ");
    expect(component).toContain("/handover-items/generate");
    expect(component).toContain('method: "POST"');
    expect(component).toContain('"PATCH"');
    expect(component).toContain('method: "DELETE"');
    expect(component).toContain("ยังไม่มีรายการเตรียมส่งมอบ");
    expect(component).toContain(
      "Phase 1 อนุญาตให้เตรียมรายการได้เฉพาะก่อน pickup เท่านั้น",
    );
    expect(component).toContain('"picked_up", "returned", "cancelled"');
    expect(component).toContain('label="ชื่อรายการ"');
    expect(component).toContain('label="จำนวนที่เตรียม"');
    expect(component).toContain('label="หมายเหตุ"');
    expect(component).toContain("แก้ไขรายการเตรียมส่งมอบ");
    expect(component).toContain("เพิ่มรายการเตรียมส่งมอบ");
    expect(component).toContain("บันทึกรายการ");
    expect(component).toContain("ยกเลิก");
    expect(component).not.toContain('label="Sort order"');
  });
});
