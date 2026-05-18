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
  for (const item of input.items) {
    if (item.quantity < 0) {
      throw new Error("quantity must be >= 0");
    }
    if (item.unitPrice < 0) {
      throw new Error("unitPrice must be >= 0");
    }
  }
  if (input.discount < 0 || input.discount > 1) {
    throw new Error("discount must be between 0 and 1");
  }
  if (input.taxRate < 0) {
    throw new Error("taxRate must be >= 0");
  }

  const subtotal = input.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const discountedSubtotal = subtotal * (1 - input.discount);
  const taxAmount = discountedSubtotal * input.taxRate;
  const total = Math.round((discountedSubtotal + taxAmount) * 100) / 100;

  return { subtotal, discountedSubtotal, taxAmount, total };
}
