import { describe, expect, it } from "vitest";
import {
  cardDigits,
  cvcLengthForCard,
  formatExpiryDisplay,
  formatPaymentCardNumber,
  sanitizeCvcForCard,
  sanitizeExpiryDigits,
  sanitizePaymentCardDigits,
} from "../../app/utils/payment-card";

describe("payment card sanitizers", () => {
  it("removes letters and symbols from card number", () => {
    expect(cardDigits("4111 abcd 1111-1111!! 1111")).toBe("4111111111111111");
  });

  it("sanitizes pasted card number and truncates extra digits", () => {
    expect(sanitizePaymentCardDigits("1231 2312 3123 1231 311")).toBe(
      "1231231231231231",
    );
  });

  it("formats and limits general cards to 16 digits", () => {
    expect(formatPaymentCardNumber("4111111111111111999")).toBe(
      "4111 1111 1111 1111",
    );
  });

  it("formats and limits Amex to 15 digits with 4-6-5 grouping", () => {
    expect(formatPaymentCardNumber("378282246310005999")).toBe(
      "3782 822463 10005",
    );
  });

  it("sanitizes expiry non-digits and renders MM/YY", () => {
    expect(formatExpiryDisplay("1a2/3b4")).toBe("12/34");
  });

  it("truncates expiry to 4 digits", () => {
    expect(sanitizeExpiryDigits("122599")).toBe("1225");
  });

  it("limits general card CVC to 3 digits", () => {
    expect(cvcLengthForCard("4111111111111111")).toBe(3);
    expect(sanitizeCvcForCard("12a34", "4111111111111111")).toBe("123");
  });

  it("allows Amex CVC up to 4 digits", () => {
    expect(cvcLengthForCard("378282246310005")).toBe(4);
    expect(sanitizeCvcForCard("12a345", "378282246310005")).toBe("1234");
  });

  it("truncates CVC when card type changes from Amex to non-Amex", () => {
    const amexCvc = sanitizeCvcForCard("1234", "378282246310005");
    expect(sanitizeCvcForCard(amexCvc, "4111111111111111")).toBe("123");
  });
});
