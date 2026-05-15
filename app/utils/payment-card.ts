export type PaymentCardBrand = "amex" | "visa" | "mastercard" | "unknown";

export type PaymentCardInfo = {
  brand: PaymentCardBrand;
  maxDigits: number;
  gaps: number[];
  cvcLength: 3 | 4;
};

export function cardDigits(value: unknown): string {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

export function preventNonDigitBeforeInput(event: InputEvent): void {
  if (event.data && /[^0-9]/.test(event.data)) event.preventDefault();
}

export function detectPaymentCardBrand(value: unknown): PaymentCardInfo {
  const digits = cardDigits(value);
  if (/^3[47]/.test(digits)) {
    return { brand: "amex", maxDigits: 15, gaps: [4, 10], cvcLength: 4 };
  }
  if (/^4/.test(digits)) {
    return { brand: "visa", maxDigits: 16, gaps: [4, 8, 12], cvcLength: 3 };
  }
  if (/^(5[1-5]|2[2-7])/.test(digits)) {
    return {
      brand: "mastercard",
      maxDigits: 16,
      gaps: [4, 8, 12],
      cvcLength: 3,
    };
  }
  return { brand: "unknown", maxDigits: 16, gaps: [4, 8, 12], cvcLength: 3 };
}

export function sanitizePaymentCardDigits(value: unknown): string {
  const info = detectPaymentCardBrand(value);
  return cardDigits(value).slice(0, info.maxDigits);
}

export function formatPaymentCardNumber(value: unknown): string {
  const digits = sanitizePaymentCardDigits(value);
  const info = detectPaymentCardBrand(digits);
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && info.gaps.includes(i)) out += " ";
    out += digits[i];
  }
  return out;
}

export function cardNumberDisplayMaxLength(value: unknown): number {
  const info = detectPaymentCardBrand(value);
  return (
    info.maxDigits + info.gaps.filter((gap) => gap < info.maxDigits).length
  );
}

export function sanitizeExpiryDigits(value: unknown): string {
  return cardDigits(value).slice(0, 4);
}

export function formatExpiryDisplay(value: unknown): string {
  const digits = sanitizeExpiryDigits(value);
  return digits.length < 3
    ? digits
    : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function parseExpiryDisplay(
  value: unknown,
): { month: number; year: number } | null {
  const digits = sanitizeExpiryDigits(value);
  if (digits.length !== 4) return null;
  const month = Number(digits.slice(0, 2));
  const year = Number(digits.slice(2)) + 2000;
  return month >= 1 && month <= 12 ? { month, year } : null;
}

export function cvcLengthForCard(value: unknown): 3 | 4 {
  return detectPaymentCardBrand(value).cvcLength;
}

export function sanitizeCvcForCard(
  value: unknown,
  cardNumber: unknown,
): string {
  return cardDigits(value).slice(0, cvcLengthForCard(cardNumber));
}

export function isValidLuhn(digitsInput: unknown): boolean {
  const digits = cardDigits(digitsInput);
  if (digits.length < 12 || digits.length > 16) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (Number.isNaN(n)) return false;
    if (alt) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}
