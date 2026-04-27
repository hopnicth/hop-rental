import { describe, expect, it } from "vitest";
import {
  calculateShipping,
  emptyShippingBreakdown,
  resolveShippingSize,
  toFreeUnits,
} from "~/utils/shipping";

describe("resolveShippingSize", () => {
  it("returns the size when valid", () => {
    expect(resolveShippingSize("free")).toBe("free");
    expect(resolveShippingSize("s")).toBe("s");
    expect(resolveShippingSize("m")).toBe("m");
    expect(resolveShippingSize("l")).toBe("l");
    expect(resolveShippingSize("xl")).toBe("xl");
  });

  it("falls back to default 's' for null/undefined/invalid input", () => {
    expect(resolveShippingSize(null)).toBe("s");
    expect(resolveShippingSize(undefined)).toBe("s");
    expect(resolveShippingSize("xxl" as never)).toBe("s");
  });
});

describe("toFreeUnits", () => {
  it("converts each size by its ratio", () => {
    expect(toFreeUnits("free", 5)).toBe(5);
    expect(toFreeUnits("s", 3)).toBe(30);
    expect(toFreeUnits("m", 1)).toBe(50);
    expect(toFreeUnits("l", 2)).toBe(300);
    expect(toFreeUnits("xl", 1)).toBe(300);
  });

  it("uses default size 's' when size is null/undefined", () => {
    expect(toFreeUnits(null, 1)).toBe(10);
    expect(toFreeUnits(undefined, 2)).toBe(20);
  });

  it("clamps and floors quantity", () => {
    expect(toFreeUnits("s", -3)).toBe(0);
    expect(toFreeUnits("s", 1.9)).toBe(10);
    expect(toFreeUnits("s", Number.NaN)).toBe(0);
    expect(toFreeUnits("s", 0)).toBe(0);
  });
});

describe("calculateShipping — edge cases", () => {
  it("returns zero cost for empty input", () => {
    const r = calculateShipping([]);
    expect(r.cost).toBe(0);
    expect(r.breakdown).toEqual(emptyShippingBreakdown());
  });

  it("returns zero cost when all quantities are zero", () => {
    const r = calculateShipping([
      { shippingSize: "xl", quantity: 0 },
      { shippingSize: "l", quantity: 0 },
    ]);
    expect(r.cost).toBe(0);
    expect(r.breakdown.totalFreeUnits).toBe(0);
  });
});

describe("calculateShipping — single-tier packing", () => {
  it("9 free items → 9 free remainders, cost 0", () => {
    const r = calculateShipping([{ shippingSize: "free", quantity: 9 }]);
    expect(r.breakdown).toEqual({
      xl: 0,
      l: 0,
      m: 0,
      s: 0,
      free: 9,
      totalFreeUnits: 9,
    });
    expect(r.cost).toBe(0);
  });

  it("10 free items → 1 S box, cost ฿50", () => {
    const r = calculateShipping([{ shippingSize: "free", quantity: 10 }]);
    expect(r.breakdown).toMatchObject({ s: 1, free: 0, totalFreeUnits: 10 });
    expect(r.cost).toBe(50);
  });

  it("4 S items → 4 S boxes, cost ฿200", () => {
    const r = calculateShipping([{ shippingSize: "s", quantity: 4 }]);
    expect(r.breakdown).toMatchObject({ s: 4, totalFreeUnits: 40 });
    expect(r.cost).toBe(200);
  });

  it("5 S items → 1 M box (consolidation), cost ฿100", () => {
    const r = calculateShipping([{ shippingSize: "s", quantity: 5 }]);
    expect(r.breakdown).toMatchObject({ m: 1, s: 0, totalFreeUnits: 50 });
    expect(r.cost).toBe(100);
  });

  it("1 XL item → 1 XL box, cost ฿200", () => {
    const r = calculateShipping([{ shippingSize: "xl", quantity: 1 }]);
    expect(r.breakdown).toMatchObject({ xl: 1, totalFreeUnits: 300 });
    expect(r.cost).toBe(200);
  });

  it("2 L items → 1 XL (greedy consolidation), cost ฿200", () => {
    const r = calculateShipping([{ shippingSize: "l", quantity: 2 }]);
    expect(r.breakdown).toMatchObject({ xl: 1, l: 0, totalFreeUnits: 300 });
    expect(r.cost).toBe(200);
  });
});

describe("calculateShipping — mixed lines", () => {
  it("1 L + 1 S + 1 free → 1 L + 1 S + 1 free, cost ฿200", () => {
    const r = calculateShipping([
      { shippingSize: "l", quantity: 1 },
      { shippingSize: "s", quantity: 1 },
      { shippingSize: "free", quantity: 1 },
    ]);
    expect(r.breakdown).toEqual({
      xl: 0,
      l: 1,
      m: 0,
      s: 1,
      free: 1,
      totalFreeUnits: 161,
    });
    expect(r.cost).toBe(150 + 50 + 0);
  });

  it("1 M + 1 S + 5 free → 1 M + 1 S + 5 free, cost ฿150", () => {
    const r = calculateShipping([
      { shippingSize: "m", quantity: 1 },
      { shippingSize: "s", quantity: 1 },
      { shippingSize: "free", quantity: 5 },
    ]);
    expect(r.breakdown).toEqual({
      xl: 0,
      l: 0,
      m: 1,
      s: 1,
      free: 5,
      totalFreeUnits: 65,
    });
    expect(r.cost).toBe(150);
  });

  it("treats null shippingSize as default 's' (1 unit → 1 S box)", () => {
    const r = calculateShipping([{ shippingSize: null, quantity: 1 }]);
    expect(r.breakdown).toMatchObject({ s: 1, totalFreeUnits: 10 });
    expect(r.cost).toBe(50);
  });

  it("ignores negative/NaN/fractional quantities defensively", () => {
    const r = calculateShipping([
      { shippingSize: "s", quantity: -5 },
      { shippingSize: "s", quantity: Number.NaN },
      { shippingSize: "s", quantity: 1.4 },
    ]);
    expect(r.breakdown.totalFreeUnits).toBe(10);
    expect(r.cost).toBe(50);
  });
});

describe("emptyShippingBreakdown", () => {
  it("returns a fresh zeroed breakdown each call", () => {
    const a = emptyShippingBreakdown();
    const b = emptyShippingBreakdown();
    expect(a).toEqual({ xl: 0, l: 0, m: 0, s: 0, free: 0, totalFreeUnits: 0 });
    expect(a).not.toBe(b);
  });
});
