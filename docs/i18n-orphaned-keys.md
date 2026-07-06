# i18n Cleanup Backlog — Orphaned Keys

> Keys present in the locale JSON files but **not referenced anywhere** in `app/`
> (`grep` for `t('<namespace>.<key>')` returns no usage). They were translated to
> keep TH/EN parity and a zero `[NEEDS_TRANSLATION]` count, but are candidates for
> removal in a separate, dedicated cleanup change. **Do not remove as part of the
> i18n translation task.**

## `cart` namespace — 8 orphaned keys (found 2026-07-07)

Verified unused via `grep -rn "cart\.<key>\b" app --include="*.vue" --include="*.ts"`
(excluding `i18n/locales/`). No dynamic/template-literal key construction in
`app/pages/user/cart.vue` reaches them.

| key | th value written |
|---|---|
| `cart.checkoutTermsLabel` | ฉันยอมรับข้อกำหนดและเงื่อนไข |
| `cart.selectNextStepTitle` | เลือกรายการที่ต้องการชำระเงินถัดไป: |
| `cart.rentalNextStep` | รายการเช่า — โอนเงินมัดจำจองและอัปโหลดสลิป |
| `cart.saleNextStep` | คำสั่งซื้อ — โอนเงินและอัปโหลดสลิป |
| `cart.manualRentalCta` | อัปโหลดสลิปเงินมัดจำจอง / ดูรายการจอง |
| `cart.manualSaleCta` | สร้างคำสั่งซื้อและอัปโหลดสลิป |
| `cart.manualSaleGuidanceTitle` | ชำระเงินด้วยการโอนเงิน |
| `cart.manualSaleGuidanceDesc` | สร้างคำสั่งซื้อของคุณ จากนั้นโอนยอดรวมเข้าบัญชีบริษัท และอัปโหลดหลักฐานการโอนเงินในหน้าคำสั่งซื้อ เจ้าหน้าที่จะตรวจสอบสลิปก่อนยืนยันการชำระเงินของคำสั่งซื้อ |

**Removal note:** if removed, delete the same 8 keys from **all four** locale files
(`th.json`, `en.json`, `cn.json`, `jp.json`) to keep counts aligned. The `cart` keys
still USED by `app/pages/user/cart.vue` are: `manualRentalGuidanceTitle`,
`manualRentalGuidanceDesc`, `noCheckoutItemsTitle`, `noCheckoutItemsDesc` — keep those.

## `rentalsPage.depositSlip` namespace — 9 orphaned keys (found 2026-07-07)

Verified unused via `grep -rn "depositSlip\.<key>\b" app --include="*.vue" --include="*.ts"`
(excluding `i18n/locales/`). No dynamic/template-literal key construction reaches them.
Superseded by the current rental deposit-slip UI copy; translated to keep TH/EN parity
and a zero `[NEEDS_TRANSLATION]` count.

| key | th value written |
|---|---|
| `rentalsPage.depositSlip.title` | อัปโหลดสลิปการโอนเงิน |
| `rentalsPage.depositSlip.instructions` | โอนเงินมัดจำจองเข้าบัญชีบริษัท จากนั้นอัปโหลดสลิปการโอนเงินที่นี่เพื่อเป็นหลักฐาน |
| `rentalsPage.depositSlip.note` | การอัปโหลดสลิปไม่ถือเป็นการยืนยันการจอง เจ้าหน้าที่จะตรวจสอบก่อนยืนยัน |
| `rentalsPage.depositSlip.uploadAction` | อัปโหลดสลิป |
| `rentalsPage.depositSlip.pendingTitle` | อัปโหลดสลิปแล้ว — รอเจ้าหน้าที่ตรวจสอบ |
| `rentalsPage.depositSlip.pendingDesc` | เจ้าหน้าที่จะตรวจสอบการโอนเงินของคุณและยืนยันการจอง |
| `rentalsPage.depositSlip.noFile` | กรุณาเลือกไฟล์สลิปหรือ PDF ก่อน |
| `rentalsPage.depositSlip.uploadSuccess` | อัปโหลดสลิปแล้ว รอเจ้าหน้าที่ตรวจสอบ |
| `rentalsPage.depositSlip.uploadError` | อัปโหลดสลิปไม่สำเร็จ |

**Removal note:** if removed, delete the same 9 keys from **all four** locale files
(`th.json`, `en.json`, `cn.json`, `jp.json`) to keep counts aligned.
