# Admin POS Full-Function Plan

Last updated: 2026-05-10

Status: **DONE for legacy `/admin/pos` functional rollout / PARTIAL for documents** as of 2026-05-13.

Reality sync:

- Legacy `/admin/pos` rental/sale modes, branch-scoped catalog, scanner, daily transaction history, sale creation, rental booking creation, pickup fulfillment, return fulfillment, and accounting CSV are code-present.
- Print/tax buttons in legacy POS history remain placeholders. Official receipts/tax invoices/WHT are not delivered here.
- Operational rental pickup/return document issuance now lives in admin rental booking detail and reuses the `official_documents` foundation; POS history document integration is still parked.
- The current printing standard is A5 browser print first. The older carbon-paper receipt/tax-invoice notes below are historical and superseded by `docs/printing-document-standard.md` unless explicitly re-approved.

## Scope Delivered in Code

- POS scanner now supports customer QR, asset/SKU/product payloads, browser `BarcodeDetector` where available, ZXing fallback for 1D/2D barcodes, and `qr-scanner` fallback for QR.
- POS catalog supports rental assets and sale SKUs via `/api/admin/pos/catalog`.
- POS page supports rental vs sale workflow, branch selection, sale cart, unified payment amount, and accounting CSV export.
- POS sale endpoint writes `orders`/`order_items`, links walk-in customers, and applies branch-aware inventory through `f_apply_order_inventory`.
- Migration `059_admin_pos_full_function.sql` adds branch access, POS metadata, unified payment fields, and scanner code indexes.
- Migration `060_restore_sku_inventory_kind.sql` restores `sku_branch_inventory.inventory_kind` for sale inventory compatibility.
- Daily POS Transaction History is implemented with date/branch filters, sale+rental rows, payment summaries, super-admin void/cancel, and print placeholders.

## Technical Assessment

### Complexity

| Area                        | Complexity  | Notes                                                                                                                                 |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Scanner QR/barcode          | Medium      | Native barcode support varies by browser; ZXing provides broader 1D/2D fallback, then QR fallback uses existing `qr-scanner` library. |
| Rental vs sale POS workflow | Medium      | Rental keeps ID-card gate; Sale customer info is optional and writes order records.                                                   |
| Unified payment capture     | Medium      | Rental uses `checkout_*`; sale uses `pos_*` fields. Gateway settlement remains separate.                                              |
| Branch access               | Medium/High | Requires Super Admin to maintain `admin_user_branch_access`.                                                                          |
| Accounting CSV              | Medium      | CSV is export-ready; formal accounting integration needs invoice numbering/tax profiles.                                              |
| Offline sync                | High        | Current Local Storage draft is safe for retry, but conflict resolution is limited.                                                    |

### Risk Analysis

- **Inventory race risk:** POS sale calls an idempotent DB function, but full concurrency control still depends on DB locks in the function and accurate branch inventory rows.
- **Browser support risk:** `BarcodeDetector` is not universal. ZXing fallback covers more mobile browsers, but physical camera/device testing is still required.
- **Migration dependency:** New POS sale/rental fields require migrations 059 and 060 before production use.
- **Staff permission rollout:** Staff without branch grants will see no POS branches until Super Admin assigns access.
- **Accounting compliance:** CSV fields cover common accounting exports, but official Thai tax invoice/WHT formatting needs company tax data and document sequence rules.

### Offline / Local Storage Sync Feasibility

- **Current:** customer draft, ID draft, booking draft, and sale draft are stored locally when network/API fails.
- **Recommended next step:** create a `pos_offline_queue` table with idempotency keys and a client-side retry queue.
- **Conflict handling:** when retrying sale drafts, recheck stock and branch permission before committing.
- **Security:** never store card data in Local Storage; store only cash/transfer references and uploaded proof placeholders.

## Barcode / Code Schema Plan

- Rental assets use `assets.code` as the primary scanner code. This is already unique.
- Sale SKUs use `product_skus.sku_code` or `product_skus.id` as scanner code.
- Super Admin should own create/update rights for product, asset, and SKU master data.
- After cleaning legacy duplicate SKU codes, add a unique functional index on normalized `sku_code`.

## Multi-Branch Support Plan

- `admin_user_branch_access` maps staff users to branches with `can_pos`.
- Super Admin sees all active branches; staff see assigned branches only.
- Sale inventory is deducted from the selected POS branch first.
- Rental bookings store `hub_id/hub_name` and `pos_branch_*` for fulfillment and reporting.

## Current POS Flow Summary

- `1) Customer info` contains customer search plus `Scan Customer`; customer details are optional in Sale mode and required for Rental/Booking mode.
- `2) Catalog / Cart` switches between rental asset selection and sale SKU cart based on the segmented mode tabs.
- `3) Payment` captures cash/QR/bank/card/other, paid amount, status, proof, and notes.
- `POS Transaction History` uses `GET /api/admin/pos/history` for daily branch reconciliation and `POST /api/admin/pos/history/cancel` for super-admin void/cancel.
- Full and abbreviated tax invoice buttons are UI placeholders until document generation APIs are built.

## Accounting CSV Best-Practice Fields

- Date
- Branch
- Document Type
- Document No
- Customer / Tax ID profile reference
- SKU or Asset Code
- Description
- Quantity or Rental Days
- Unit Price
- VAT 7%
- WHT
- Total Amount
- Paid Amount
- Payment Method

## Delivery Note Plan — A5 Format

- Document size: A5 portrait.
- Header: company logo, branch, delivery note number, date.
- Customer block: name, phone, address or pickup branch.
- Item table: asset/SKU code, description, qty, serial/asset code, condition.
- Rental-specific block: start date, return date, deposit, checklist summary.
- Signature block: customer signature, staff signature, timestamp.
- Data source: rental booking detail + fulfillment signature + branch profile.

## Receipts & Tax Invoices Plan — Carbon Paper Format

- Format: compact receipt/tax invoice suitable for dot-matrix/carbon paper.
- Required fields: seller tax ID, branch code, date, receipt no, customer name/tax ID when available.
- Line items: SKU/asset, qty/days, unit price, VAT base, VAT, total.
- Payment summary: cash/transfer/card/other, paid amount, change, reference.
- Numbering: separate sequence for receipt, abbreviated tax invoice, full tax invoice.
- Storage: persist generated document metadata and immutable snapshot JSON.

## Withholding Tax (WHT) & B2B Profile Plan

- Capture legal entity fields at POS/customer side: company name, tax ID, branch type/code, address, contact.
- Auto-create or update B2B profile when a customer requests WHT/tax invoice.
- WHT form: A4 format with payer/payee, service category, base amount, WHT rate, WHT amount.
- Rental/service WHT defaults: configurable rate, commonly 3% for service/rental categories.
- Export: include WHT fields in accounting CSV and future PDF.
- Approval: Super Admin/accounting role should review legal profile before issuing official documents.

## Recommended Next Milestones

1. Run real-device tests on target iOS/Android browsers and record camera permissions/scan speed.
2. Add official document tables for receipt/tax invoice/delivery note/WHT sequences.
3. Add PDF rendering for delivery note, receipt/tax invoice, and WHT documents.
4. Add stock-safe sale void/reversal workflow or reverse-inventory RPC.
5. Add offline queue table with idempotency keys for robust retry sync.

## Mobile / Tablet Scanner Test Checklist

Use this checklist on the actual devices used at the shop counter.

| Device / Browser         | Test                       | Expected Result                                            |
| ------------------------ | -------------------------- | ---------------------------------------------------------- |
| iPhone Safari            | Open POS → Scan Product    | Camera permission opens; QR and barcode are detected.      |
| iPhone Chrome            | Open POS → Scan Customer   | Camera permission opens; customer QR resolves lookup.      |
| Android Chrome           | Scan SKU barcode           | ZXing or BarcodeDetector adds SKU to sale cart.            |
| Android Samsung Internet | Scan asset QR              | Rental asset is selected and rental workflow stays active. |
| Tablet landscape         | Switch Rental/Sale         | Layout remains usable and scanner modal remains centered.  |
| Offline mode             | Create failed sale/booking | Draft is stored locally and user receives retry warning.   |

Record for each run: device model, OS version, browser version, camera permission behavior,
average scan time, lighting condition, and barcode/QR sample used.
