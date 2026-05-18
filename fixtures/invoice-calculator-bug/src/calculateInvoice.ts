// BROKEN VERSION — intentional bugs:
//   1. Each line item is rounded to 2dp before being summed (rounds too early).
//   2. Tax is applied to the pre-discount subtotal instead of after the discount.
//   3. No input validation.
// The repair engine will replace this file with a corrected version.
export interface LineItem {
  quantity: number;
  unitPrice: number;
}

export interface InvoiceInput {
  items: LineItem[];
  discount: number;
  taxRate: number;
}

export interface InvoiceResult {
  subtotal: number;
  discountedSubtotal: number;
  taxAmount: number;
  total: number;
}

export function calculateInvoice(input: InvoiceInput): InvoiceResult {
  const subtotal = input.items.reduce(
    (sum, item) =>
      sum + Math.round(item.quantity * item.unitPrice * 100) / 100,
    0,
  );

  // BUG: tax is computed against the un-discounted subtotal
  const taxAmount = subtotal * input.taxRate;
  const discountedSubtotal = subtotal - subtotal * input.discount;
  const total =
    Math.round((discountedSubtotal + taxAmount) * 100) / 100;

  return { subtotal, discountedSubtotal, taxAmount, total };
}
