# Admin Manual Index

Last updated: 2026-05-10

คู่มือในโฟลเดอร์นี้ใช้สำหรับ Admin และ Custom AI ที่ช่วยเตรียม/ตรวจข้อมูลก่อนนำเข้าระบบ HOP Rental

## Files

| File                                   | Purpose                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `custom-gemini-admin-system-prompt.md` | System Prompt หลักสำหรับ Custom Gemini AI                                                                                        |
| `product-admin-manual.md`              | คู่มือ Product Admin: Product, SKU, ราคา, feature, media, tags, search keywords, link กับ Asset/Content                          |
| `asset-admin-manual.md`                | คู่มือ Asset Admin: Asset rental data, pricing, stock, detail blocks, documents, tags, search keywords, link กับ Product/Content |
| `rental-pos-manual.md`                 | คู่มือ POS หน้าร้าน: mode ขาย/เช่า, ค้นหาหรือ scan ลูกค้า, รับ walk-in, เก็บบัตรประชาชน, เก็บมัดจำ, history, pickup/return       |

## Recommended Admin Flow

1. สร้าง/ตรวจ `main_categories` ให้ถูกก่อน
2. กรอก Product หลัก
3. เพิ่ม SKU อย่างน้อย 1 รายการ
4. เพิ่ม media/document ที่ถูกชนิดไฟล์
5. ตั้ง filter/tags/search keywords อย่างระวัง
6. ถ้าเป็น rental ให้สร้าง Asset และ link กลับ Product ด้วย `asset_matches`
7. ถ้ามีรีวิว ให้สร้าง Content Page type `review` แล้ว link Product/Asset
8. ตรวจ publish flags ก่อนเปิด public

## Operational flow manuals

- ใช้ `rental-pos-manual.md` เมื่อทีมหน้าร้านต้องสร้าง booking, รับ walk-in, ทำ sale POS, ตรวจ history รายวัน, หรือทำ pickup/return
