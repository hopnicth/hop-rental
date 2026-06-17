import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const userDropdownVue = readFileSync(
  "app/components/header/UserDropdown.vue",
  "utf8",
);

describe("top-right user QR modal source safeguards", () => {
  it("opens the customer QR modal through a dedicated profile-loading handler", () => {
    expect(userDropdownVue).toContain("async function openCustomerQrModal()");
    expect(userDropdownVue).toContain("void openCustomerQrModal();");
    expect(userDropdownVue).not.toContain("isQrModalOpen.value = true;\n        },");
  });

  it("does not refetch when the customer QR payload is already available", () => {
    expect(userDropdownVue).toContain("if (customerQrPayload.value)");
    expect(userDropdownVue).toContain("isQrModalOpen.value = true;\n    return;");
  });

  it("forces the existing profile loader when profile id is missing", () => {
    expect(userDropdownVue).toContain("ensureProfileLoaded");
    expect(userDropdownVue).toContain(
      "await ensureProfileLoaded(null, { force: true });",
    );
    expect(userDropdownVue).toContain("isQrProfileResolving");
  });

  it("shows loading, QR, then fallback states in order", () => {
    expect(userDropdownVue).toContain('v-if="isCustomerQrLoading"');
    expect(userDropdownVue).toContain('v-else-if="customerQrPayload"');
    expect(userDropdownVue).toContain("ยังไม่พบข้อมูลผู้ใช้สำหรับสร้าง QR Code");
  });

  it("keeps the customer QR payload tied only to profile.id", () => {
    expect(userDropdownVue).toContain("`customer:${profile.value.id}`");
    expect(userDropdownVue).not.toContain("authUser.id");
    expect(userDropdownVue).not.toContain("user.value?.id ? `customer:");
  });
});

describe("UserDropdown — My Payments navigation item", () => {
  it("renders My Payments linked to /user/payments", () => {
    expect(userDropdownVue).toContain('to: "/user/payments"');
    expect(userDropdownVue).toContain('t("user.payments")');
  });

  it("uses an existing icon family (bx:)", () => {
    const paymentsBlock = userDropdownVue.slice(
      userDropdownVue.indexOf('"/user/payments"') - 80,
      userDropdownVue.indexOf('"/user/payments"') + 20,
    );
    expect(paymentsBlock).toMatch(/bx:/);
  });

  it("preserves existing logout and orders items", () => {
    expect(userDropdownVue).toContain('to: "/user/orders"');
    expect(userDropdownVue).toContain("logout()");
  });
});