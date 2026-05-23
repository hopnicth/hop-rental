# Printing & Official Document Standard

Last updated: 2026-05-23

Status: **STANDARD + PARTIAL IMPLEMENTATION** as of 2026-05-23.

Reality sync:

- **Implemented subset:** A5 browser-print pattern and immutable snapshot/reprint audit foundation are used for admin rental operational pickup/return forms and POS V3 Booking Deposit Confirmation (BDC) printing.
- **Phase 2E-B2 (2026-05-23):** Pickup Form (`rental_pickup_form`) and Return Form print templates in `app/pages/admin/documents/[id]/print.vue` have been updated to use `OfficialDocumentHeader` (same header as online deposit/BDC). Checklist now renders all individual items sorted by `sort_order` (✓/✗/N/A + label + instruction + remark). Deposit Summary section shows Online Booking Deposit + Deposit at Pickup + Total. Staff signature box removed; customer signature only (full-width). `app/pages/admin/rental-bookings/[id]/print.vue` (live preview) mirrors the same layout.
- **Header standard (locked):** All printed documents use the `OfficialDocumentHeader` Vue component (`app/components/documents/OfficialDocumentHeader.vue`). When rendering from an issued snapshot, pass `:header="documentHeader"` (the snapshot's `header` field). When rendering live (non-issued), pass `:header="null"` which falls back to HOPNIC defaults. Do NOT use the old `<header class="form-header">` / `<div class="logo-fallback">H</div>` pattern.
- **Pickup form fulfillment gate (locked):** `loadAdminRentalFulfillmentForPrint` returns `null` (not 404) when no fulfillment exists yet — the print form is accessible before Confirm Pickup and loads checklists from DB directly. This allows checklist review/preview without blocking on fulfillment.
- **Not implemented:** official receipt, tax invoice, abbreviated/full tax invoice, WHT, credit note, deposit refund confirmation, and sale-order store pickup slip.
- **Phase 2D guardrail:** BDC for Booking Deposit collection is confirmation documentation, not a receipt/tax invoice/VAT/WHT document. Do not convert the Booking Deposit collection print flow into a fiscal document without a separate audit/design pass.
- **Current standard remains:** browser print first; do not revive carbon-paper/dot-matrix assumptions unless explicitly approved later.
- Tax/accounting wording still needs accountant review before production official-document rollout.

## Scope / Decision

This document defines the first standard for Hopnic/Hop Rental printing and official document workflows.

- All documents use **A5** format.
- Printing uses **browser print** first; no carbon paper / dot-matrix workflow.
- Documents that need customer signature are signed on staff tablet and embedded into the printed document.
- Official issued documents must keep immutable snapshot data for reprint, audit, and accounting.
- Tax/accounting rules in this document are operating standards and should be confirmed by the accountant before production rollout.

## Printing Standard

### Paper / Print Method

| Item        | Standard                                                      |
| ----------- | ------------------------------------------------------------- |
| Paper size  | A5                                                            |
| Orientation | Portrait by default; landscape only if item table is too wide |
| Printer     | Browser print to laser/inkjet printer                         |
| Carbon copy | Not used                                                      |
| Output      | Printable HTML or generated PDF, optimized for browser print  |
| Reprint     | Allowed with reprint mark and audit log                       |

### Browser Print Layout

- Use CSS print media with `@page { size: A5; margin: ... }`.
- Hide application navigation/buttons during print.
- Keep each official document page self-contained with company header, document number, date, customer block, item/payment detail, and signature/footer.
- Avoid relying on browser headers/footers; instruct staff to disable browser headers/footers in print dialog if needed.
- Prefer one print action per document set.

### Original + Copy Rule

For documents that require original and copy:

- Generate both in the same print view.
- Page 1 = **ต้นฉบับ / ORIGINAL**.
- Page 2 = **สำเนา / COPY**.
- Use the same document number for original and copy.
- COPY page must show a clear copy label/watermark.
- If reprinted later, show `พิมพ์ซ้ำ / REPRINT` with timestamp and staff ID.

## Document Lifecycle

### Statuses

| Status    | Meaning                                                       |
| --------- | ------------------------------------------------------------- |
| Draft     | Preview only; not official; document number may be temporary  |
| Issued    | Official document number assigned and snapshot locked         |
| Printed   | Browser print was triggered; store print audit event          |
| Reprinted | Printed again after issue; show reprint mark                  |
| Voided    | Cancelled document; keep number and audit trail; never delete |

### Recommended Issue Flow

1. Staff opens document preview from booking/order/payment.
2. System validates required fields.
3. Staff confirms issue.
4. System assigns document number.
5. System saves immutable document snapshot JSON.
6. Browser print view opens with A5 layout.
7. Staff prints original/copy if required.
8. System records print audit event.

## Document Numbering

Use separate running numbers by document type and month/year.

| Document                   | Prefix example                          | Notes                                                    |
| -------------------------- | --------------------------------------- | -------------------------------------------------------- |
| ใบส่งรับของ                | `DNA-YYYYMM-0001`                       | Delivery & acceptance note                               |
| ใบรับของคืน                | `RTN-YYYYMM-0001`                       | Return receiving note                                    |
| ใบกำกับภาษีเงินรับล่วงหน้า | `ADV-TAX-YYYYMM-0001`                   | VAT document for rental advance                          |
| ใบลดหนี้                   | `CN-YYYYMM-0001`                        | Must reference original tax invoice                      |
| ใบเสนอราคา                 | `QT-YYYYMM-0001`                        | Sales quotation                                          |
| ใบกำกับภาษี / ใบเสร็จ      | `TAX-YYYYMM-0001` or `RCPT-YYYYMM-0001` | Final sale/rental invoice/receipt                        |
| ใบกำกับภาษีอย่างย่อ        | `ABB-TAX-YYYYMM-0001`                   | Auto for natural person / walk-in if no full tax request |

Do not reuse a number after issuing or voiding.

## Required Documents

## 1. ใบส่งรับของ / Delivery & Acceptance Note

Purpose: use when staff delivers/rents out equipment and customer confirms receipt.

### Print Rule

- A5.
- Original + Copy.
- Customer signs on staff tablet before printing or before final issue.

### Required Fields

- Document number.
- Issue date/time.
- Booking/order reference.
- Customer name, phone, address or pickup branch.
- Rental period: start date/time and expected return date/time.
- Item list: asset code, item name, serial number if any, quantity, condition before delivery, accessories/checklist.
- Deposit/advance/payment summary if relevant.
- Customer signature image.
- Staff sender ID/name.
- Signature timestamp and device/source.

### Signature Standard

- Store signature image as file or encoded asset reference.
- Store signer name, signed timestamp, staff ID who collected signature, and document snapshot.
- Printed signature block should include customer signature and staff signature/name.

## 2. ใบรับของคืน / Return Receiving Note

Purpose: use when customer returns rented equipment.

### Print Rule

- A5.
- Original + Copy.
- Must show staff ID of receiving staff.

### Required Fields

- Document number.
- Issue date/time.
- Reference to booking/order and original delivery note.
- Customer name and phone.
- Staff receiver ID/name.
- Return item list: asset code, item name, serial number, expected quantity, returned quantity.
- Condition after return: normal, damaged, missing accessory, lost, late return.
- Damage/penalty notes and estimated charges if any.
- Refund/deposit/advance settlement summary.
- Customer signature if required by operation.
- Staff receiver signature/name.

## 3. ใบกำกับภาษีเงินรับล่วงหน้า / Tax Invoice for Advance Payment

Purpose: issue when receiving **rental advance** that is subject to VAT immediately.

### Required Fields

- Document number.
- Issue date.
- Customer name.
- Customer tax profile if full tax invoice is required: tax ID, branch, address.
- Description: receive money for what purpose.
- Amount before VAT.
- VAT amount.
- Total received.
- Payment method: cash, transfer, card, QR, other.
- Payment reference/proof if any.
- Refund/non-refund condition.
- Authorized signature or company stamp.

### Standard Condition Text

Use wording similar to:

> รับเงินมัดจำค่าเช่าอุปกรณ์ จำนวน XXX บาท เงินมัดจำดังกล่าวจะคืนเมื่อส่งคืนอุปกรณ์ครบและไม่มีความเสียหาย

If the amount is treated as rental advance, make the internal document type clear as `Rental Advance`, not `Security Deposit`.

### Accounting Treatment Example

When receiving advance payment of 10,700 baht:

| Debit            | Credit                  |
| ---------------- | ----------------------- |
| Cash/Bank 10,700 | Unearned revenue 10,000 |
|                  | VAT Output 700          |

## 4. ใบลดหนี้ / Credit Note

Purpose: issue when cancelling/refunding a previously issued advance tax invoice, fully or partially.

### Required Fields

- Credit note number.
- Issue date.
- Reference original advance tax invoice number and date.
- Customer name and tax profile.
- Reason: cancellation, partial refund, returned goods/service not provided, price adjustment.
- Original amount.
- Reduced amount before VAT.
- VAT reduced.
- Total refund/reduction.
- Payment/refund method.
- Authorized signature or company stamp.

### Full Refund Example

Day 1: received advance 10,700 baht, including service 10,000 + VAT 700.

Day 10: customer cancels and full amount is refunded.

- Issue credit note referencing the original advance tax invoice.
- Reverse the unearned revenue and VAT Output for the refunded amount.

### Partial Refund / Penalty Example

Original advance received: 10,700 baht.

Refund to customer: 8,560 baht.

Penalty kept: 2,000 + VAT 140.

Recommended document handling:

- Issue partial credit note for the refunded portion.
- If penalty/service fee needs separate tax treatment, issue tax invoice for penalty/service fee as advised by accountant.

Accounting concept for refund portion:

| Debit                  | Credit          |
| ---------------------- | --------------- |
| Unearned revenue 8,000 | Cash/Bank 8,560 |
| VAT Output 560         |                 |

Accounting concept for penalty kept:

| Debit                  | Credit               |
| ---------------------- | -------------------- |
| Unearned revenue 2,000 | Penalty income 2,000 |

VAT on penalty depends on final accountant/tax position and whether VAT was already handled at advance receipt.

## Deposit vs Advance Standard

Hopnic should separate refundable security deposit from rental advance.

| Case             | ตอนรับเงิน                    | ตอนคืนเงิน                    | System Type      |
| ---------------- | ----------------------------- | ----------------------------- | ---------------- |
| เงินประกันคืนได้ | ไม่ออก VAT                    | คืนเงินธรรมดา                 | Security Deposit |
| เงินรับล่วงหน้า  | ออกใบกำกับภาษีเงินรับล่วงหน้า | ต้องออก Credit Note ถ้าคืน/ลด | Rental Advance   |

### A. Security Deposit

- No VAT at receipt.
- Recorded as liability.
- Easy refund when items are returned complete and undamaged.
- If part is withheld for damage/penalty, convert withheld amount to income with proper tax document as advised by accountant.

### B. Rental Advance

- VAT occurs immediately at receipt.
- Recorded as unearned revenue + VAT Output.
- If refunded or reduced, issue credit note referencing original advance tax invoice.

Recommended rule: use **Security Deposit** for truly refundable guarantees; use **Rental Advance** for payment of rental/service value.

## Sales Workflow Standard

For outright sales:

1. Quotation.
2. PO / Payment.
3. If deposit/advance is paid: Tax Invoice for Advance Payment.
4. Delivery Note.
5. Tax Invoice / Receipt.
6. Receipt for remaining payment if not fully paid earlier.

### Customer Tax Invoice Rule

| Customer scenario                  | Default behavior                                                         |
| ---------------------------------- | ------------------------------------------------------------------------ |
| บุคคลธรรมดา / walk-in              | Auto issue abbreviated tax invoice                                       |
| Customer requests full tax invoice | Collect tax ID, branch, legal name, address, then issue full tax invoice |
| Company customer                   | Prefer full tax profile before issuing official tax document             |

## Data Requirements for System Design

### Document Snapshot

Every issued document should store immutable snapshot data:

- Company profile at issue time.
- Branch profile at issue time.
- Customer profile at issue time.
- Item/payment/tax details at issue time.
- Signature images/references at issue time.
- Original related document references.
- Render template version.

### Audit Log

Track at least:

- Created by staff ID.
- Issued by staff ID.
- Printed by staff ID.
- Reprinted by staff ID, timestamp, reason.
- Voided by staff ID, timestamp, reason.
- Device/browser source if available.

### Related References

- Booking/order ID.
- Payment ID.
- Delivery note ID.
- Return note ID.
- Original tax invoice ID for credit note.
- Customer signature record ID.

## MVP Implementation Recommendation

1. Build A5 print templates for delivery/return/advance tax invoice/credit note.
2. Add document number generator per type.
3. Add issue flow that creates immutable snapshot JSON.
4. Add tablet signature capture and store signature with document snapshot.
5. Add browser print page that renders original + copy where required.
6. Add reprint and void audit rules.
7. Confirm final tax wording and accounting entries with accountant before production use.
