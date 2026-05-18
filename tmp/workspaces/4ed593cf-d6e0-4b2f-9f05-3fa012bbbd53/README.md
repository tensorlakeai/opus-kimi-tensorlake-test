# invoice-calculator-bug

A tiny TypeScript library for calculating invoices. **It ships intentionally broken.**

## The bug

`src/calculateInvoice.ts` has two arithmetic mistakes and is missing input validation:

1. Each line item's `quantity * unitPrice` is rounded to 2dp **before** being summed. The spec says we should round only the final total.
2. Tax is applied to the **pre-discount** subtotal. The spec says tax should be applied **after** the discount.
3. No validation: negative quantities, negative prices, or out-of-range discounts/tax rates are silently accepted.

## Correct order of operations

```
subtotal           = Σ quantity * unitPrice          (no rounding yet)
discountedSubtotal = subtotal * (1 - discount)
taxAmount          = discountedSubtotal * taxRate
total              = round_to_cents(discountedSubtotal + taxAmount)
```

Validation:

- `quantity >= 0` and `unitPrice >= 0`
- `0 <= discount <= 1`
- `taxRate >= 0`

## How AI Fix Runner uses this

1. The repo is copied to a temp workspace.
2. `npm install` runs there.
3. `npm test` is run — multiple Vitest tests fail.
4. The `FixtureRepairEngine` returns a `replace_file` patch for `src/calculateInvoice.ts`.
5. Tests are rerun; they now pass.
6. `npm run build` runs (`tsc --noEmit`) and passes.
