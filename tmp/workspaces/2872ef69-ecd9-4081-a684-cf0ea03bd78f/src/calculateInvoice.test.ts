import { describe, expect, it } from "vitest";
import { calculateInvoice } from "./calculateInvoice.js";

describe("calculateInvoice", () => {
  it("calculates subtotal correctly", () => {
    const r = calculateInvoice({
      items: [
        { quantity: 2, unitPrice: 10 },
        { quantity: 1, unitPrice: 5 },
      ],
      discount: 0,
      taxRate: 0,
    });
    expect(r.subtotal).toBe(25);
    expect(r.total).toBe(25);
  });

  it("applies percentage discount before tax", () => {
    // 100 subtotal, 10% discount -> 90, then 10% tax -> 9, total -> 99
    const r = calculateInvoice({
      items: [{ quantity: 1, unitPrice: 100 }],
      discount: 0.1,
      taxRate: 0.1,
    });
    expect(r.discountedSubtotal).toBeCloseTo(90, 10);
    expect(r.taxAmount).toBeCloseTo(9, 10);
    expect(r.total).toBe(99);
  });

  it("applies tax after discount", () => {
    // 200 subtotal, 50% discount -> 100, then 20% tax -> 120 total
    const r = calculateInvoice({
      items: [{ quantity: 2, unitPrice: 100 }],
      discount: 0.5,
      taxRate: 0.2,
    });
    expect(r.total).toBe(120);
  });

  it("rounds only the final total to 2 decimals", () => {
    // Each item's unitPrice * quantity is 0.005; correct subtotal = 0.01;
    // a buggy per-item rounding would yield 0.02 instead.
    const r = calculateInvoice({
      items: [
        { quantity: 1, unitPrice: 0.005 },
        { quantity: 1, unitPrice: 0.005 },
      ],
      discount: 0,
      taxRate: 0,
    });
    expect(r.total).toBe(0.01);
  });

  it("rejects negative quantity", () => {
    expect(() =>
      calculateInvoice({
        items: [{ quantity: -1, unitPrice: 10 }],
        discount: 0,
        taxRate: 0,
      }),
    ).toThrow();
  });

  it("rejects invalid discount", () => {
    expect(() =>
      calculateInvoice({
        items: [{ quantity: 1, unitPrice: 10 }],
        discount: 1.5,
        taxRate: 0,
      }),
    ).toThrow();
    expect(() =>
      calculateInvoice({
        items: [{ quantity: 1, unitPrice: 10 }],
        discount: -0.1,
        taxRate: 0,
      }),
    ).toThrow();
  });

  it("handles multiple line items with discount and tax", () => {
    // 3*10 + 2*15 + 1*25 = 85; * 0.9 = 76.5; * 1.05 = 80.325; round -> 80.33
    const r = calculateInvoice({
      items: [
        { quantity: 3, unitPrice: 10 },
        { quantity: 2, unitPrice: 15 },
        { quantity: 1, unitPrice: 25 },
      ],
      discount: 0.1,
      taxRate: 0.05,
    });
    expect(r.total).toBe(80.33);
  });
});
