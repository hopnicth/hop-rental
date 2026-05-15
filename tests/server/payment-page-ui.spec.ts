import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const paymentVue = readFileSync("app/pages/payment/[orderId].vue", "utf8");

describe("sale payment PromptPay page safeguards", () => {
  it("polls the backend PromptPay reconciliation endpoint before refreshing status", () => {
    expect(paymentVue).toContain(
      "`/api/payments/poll/${encodeURIComponent(attempt.paymentAttemptId)}`",
    );
    expect(paymentVue).toContain("await $fetch(");
    expect(paymentVue).toContain(
      "`/api/payments/status/${encodeURIComponent(orderId.value)}`",
    );
    expect(paymentVue).toContain("await refreshStatus()");
  });

  it("guards PromptPay polling by method, attempt status, and in-flight state", () => {
    expect(paymentVue).toContain('method.value !== "promptpay"');
    expect(paymentVue).toContain("if (isPromptPayPollInFlight.value) return;");
    expect(paymentVue).toContain("!isPromptPayAttemptTerminal.value");
    expect(paymentVue).toContain("!isTerminalStatus.value");
    expect(paymentVue).toContain("const isPromptPayPollInFlight = ref(false);");
  });

  it("stops polling and countdown before transitioning paid PromptPay to the result page", () => {
    expect(paymentVue).toContain("stopPolling();");
    expect(paymentVue).toContain("stopTicker();");
    expect(paymentVue).toContain("isNavigatingToResult.value = true;");
    expect(paymentVue).toContain('path: "/payment/result"');
  });

  it("shows a subtle checking state and avoids duplicate poll timers", () => {
    expect(paymentVue).toContain("const isReconcilingPromptPay = ref(false);");
    expect(paymentVue).toContain("s.checkingStatus");
    expect(paymentVue).toContain("if (pollHandle) return;");
    expect(paymentVue).toContain("const showProcessingOverlay = computed");
  });

  it("keeps the sale credit-card flow intact", () => {
    expect(paymentVue).toContain("const token = await createCardToken(");
    expect(paymentVue).toContain(
      "const attempt = await initiatePayment(token);",
    );
    expect(paymentVue).toContain("window.location.href = attempt.redirectUrl;");
  });
});
