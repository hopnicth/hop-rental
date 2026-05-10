# Rental POS Manual

Last updated: 2026-05-10
Audience: Admin, front-desk staff, rental operations

---

## 1. POS นี้ใช้ทำอะไร

`/admin/pos` คือหน้ารวมงานหน้าร้านสำหรับ rental operations โดยเฉพาะ:

- ค้นหาลูกค้าจากเบอร์โทรหรือ customer UUID
- รับลูกค้า walk-in ที่ยังไม่มี account
- ถ่าย/อัปโหลดบัตรประชาชน
- เลือก Asset ที่พร้อมเช่า
- เก็บข้อมูลเงินมัดจำและแนบหลักฐาน
- ทำ Pickup และ Return จากจุดเดียว

`/admin/walk-in` เป็น route alias ที่ redirect ไปหน้าเดียวกัน

หน้าเดียวกันนี้มี **Sale Mode** ด้วย แต่คู่มือนี้โฟกัสงานเช่า/จอง; ใน Sale Mode ข้อมูลลูกค้าเป็น optional และปุ่ม `Scan Customer` อยู่ในกล่อง `1) Customer info (Optional)`

---

## 2. สิทธิ์ที่ใช้งานได้

- `staff`
- `super_admin`

ผู้ใช้ที่ไม่มี `platform_role` ระดับนี้ไม่ควรเข้าหน้า POS ได้
staff ต้องมี branch grant ใน `admin_user_branch_access.can_pos`; `super_admin` เห็นทุกสาขาที่ active

---

## 3. Flow หลักของการใช้งาน

### Step 1: ค้นหาลูกค้า หรือสร้าง walk-in

ค้นหาได้จาก:

- เบอร์โทร
- Customer UUID

ถ้าไม่มี account:

1. กรอกเบอร์โทร (ใช้เป็น primary key ของ `walk_in_customers`)
2. กรอกชื่อ-นามสกุล
3. เพิ่มหมายเหตุถ้าจำเป็น

กฎสำคัญ: booking ต้องมีอย่างน้อยหนึ่งอย่างระหว่าง `user_id` หรือ `walk_in_phone`

### Step 2: ตรวจ/เก็บบัตรประชาชน

- ถ้าลูกค้ายังไม่มี `idCardUrl` ระบบ POS จะเปิด modal ให้เก็บรูปบัตร
- อัปโหลดได้เฉพาะ `jpeg/png/webp`
- ขนาดไฟล์สูงสุด 10MB
- ไฟล์ถูกเก็บที่ `catalog-media/customer-ids/`

ถ้ามีทั้ง account และเบอร์ walk-in ระบบจะอัปเดตทั้ง `users.id_card_url` และ `walk_in_customers`

### Step 3: เลือก Asset และช่วงวันเช่า

POS rental mode ตอนนี้ใช้ปฏิทินและสรุปราคา **ชุดเดียวกับฝั่งลูกค้า** เพื่อให้กฎ booking ตรงกันมากขึ้น

POS catalog จะแสดงเฉพาะ Asset ที่:

- `status = 'active'`
- `is_hidden = false`
- `daily_enabled = true`
- `daily_rate > 0`

ปฏิทินจะ:

- block วันที่ชนกับ booking ที่ใช้งานอยู่
- คำนวณจำนวนวันเช่า / ราคา / มัดจำแบบ live
- บังคับกฎ `min_rental_days` และ `max_rental_days`

ต้องเลือกวันที่ให้ผ่านกฎของ Asset:

- `endDate` ต้องมากกว่า `startDate`
- ต้องไม่ต่ำกว่า `min_rental_days`
- ถ้ามี `max_rental_days` ต้องไม่เกินค่าที่กำหนด

หมายเหตุ: POS ตั้ง `bufferDays = 0` โดยตั้งใจ เพื่อให้ทีมหน้าร้านทำ booking หน้างานได้ แม้ storefront จะมี lead/buffer day สำหรับลูกค้าทั่วไป

### Step 4: เก็บเงินมัดจำ

POS รองรับ method:

- `cash`
- `qr_transfer`
- `bank_transfer`
- `card`
- `other`

ถ้ามีการเก็บเงินจริง ระบบจะบันทึก:

- `deposit_paid_amount`
- `deposit_payment_method`
- `deposit_payment_status`
- `deposit_paid_at`
- `deposit_notes`

ถ้าแนบหลักฐาน ระบบจะอัปโหลดไปที่ `catalog-media/deposit-proofs/`

### Step 5: สร้าง booking

เมื่อกดสร้างจาก POS:

- ระบบสร้าง `rental_bookings` เป็น `status = 'confirmed'`
- ถ้าเป็น walk-in จะ upsert `walk_in_customers`
- จะเก็บ snapshot ของ Asset / pricing rule ณ เวลาที่สร้าง

ต่างจากฝั่งลูกค้า: หน้า `/user/*` ยังเริ่มจาก booking แบบ `draft`

### Step 6: Confirm Pickup

ก่อน pickup ใน POS:

- ลูกค้าควรมีรูปบัตรประชาชนแล้ว
- UI บังคับให้มีลายเซ็นลูกค้า
- booking ต้องอยู่สถานะ `confirmed`

เมื่อสำเร็จ ระบบจะ:

- upload ลายเซ็นไปที่ `catalog-media/rental-fulfillment/`
- insert แถวใน `rental_booking_fulfillments` ด้วย `event_type = 'pickup'`
- เปลี่ยน booking เป็น `picked_up`

### Step 7: Confirm Return

ทำได้เมื่อ booking อยู่สถานะ `picked_up`

เมื่อสำเร็จ ระบบจะ:

- insert แถวใน `rental_booking_fulfillments` ด้วย `event_type = 'return'`
- เปลี่ยน booking เป็น `returned`

---

## 4. Retry / offline behavior

หน้า POS เก็บงานค้างไว้ใน `localStorage` เพื่อช่วยกรณีเน็ตไม่เสถียร:

- ข้อมูล walk-in draft
- รูปบัตรประชาชนที่อัปโหลดไม่สำเร็จ
- booking draft ที่สร้างไม่สำเร็จ
- fulfillment retry payload ต่อ booking

ถ้าระบบแจ้งเตือนว่าเก็บ draft ไว้ในเครื่องแล้ว ให้กดปุ่ม Retry หลังเน็ตกลับมาปกติ

---

## 5. ข้อควรระวังสำหรับทีมปฏิบัติการ

- เบอร์โทร walk-in เป็นตัวอ้างอิงหลัก อย่าสร้างหลาย record สำหรับลูกค้าคนเดียวถ้าไม่จำเป็น
- อย่าเปลี่ยนสถานะ pickup/return ด้วยการแก้ DB ตรง เพราะจะทำให้ audit trail ไม่ครบ
- หลักฐานมัดจำและเอกสาร booking เป็นคนละชุดข้อมูลกัน
- หน้า POS ตอนนี้โฟกัสที่การเก็บ proof ฝั่ง payment; proof ฝั่ง refund มี schema รองรับแต่ยังไม่ใช่ flow หลักของ UI
- ถ้าต้องทำ checklist/เอกสารเชิงลึกต่อ booking ให้เปิด `/admin/rental-bookings/[id]`
- POS Transaction History เป็นมุมมองรายวันตามสาขา; ปุ่ม Void/Cancel แสดงเฉพาะ `super_admin`
- ปุ่มพิมพ์ใบกำกับภาษี Full/Abbreviated ตอนนี้เป็น placeholder จนกว่าจะมี document API

---

## 6. Related docs

- `DATABASE_ADMIN_MANUAL.md`
- `API_INDEX.md`
- `PROJECT_SUMMARY.md`
