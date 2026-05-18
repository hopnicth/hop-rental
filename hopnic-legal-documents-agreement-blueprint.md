# HOPNIC Legal Documents & Agreement Blueprint

## Master Draft — เอกสารที่ระบบต้องมี, จุดที่ต้องใช้, และข้อกำหนดที่ต้องรองรับ

> สถานะเอกสาร: Working Draft สำหรับใช้กำหนด scope งานระบบ / เตรียมให้ที่ปรึกษากฎหมายตรวจทานก่อนเผยแพร่จริง
> ข้อสำคัญ: เอกสารนี้เป็น **Blueprint และ Drafting Guide** แไม่ใช่คำปรึกษากฎหมายฉบับสุดท้าย

---

# 1. เป้าหมายของชุดเอกสารกฎหมาย HOPNIC

ระบบ HOPNIC มีทั้ง:

- เว็บไซต์สำหรับลูกค้าสมัครสมาชิกและจองเช่าสินค้าเอง
- ระบบชำระ Booking Deposit ออนไลน์
- ระบบ POS / Admin ที่พนักงานช่วยสร้าง Booking ให้ลูกค้า
- ระบบ KYC / เก็บเอกสารยืนยันตัวตน
- ระบบ Pickup / Return / Damage / Deposit settlement
- ระบบเอกสารประกอบธุรกรรม เช่น เอกสารรับมอบ, เอกสารคืนของ, เอกสาร No-show, ใบรับเงินค่าริบมัดจำ
- ระบบ B2B / ข้อมูลบริษัท / เอกสารภาษีในอนาคต

ดังนั้น HOPNIC ต้องมีเอกสารกฎหมายที่ครอบคลุม 4 มิติหลัก:

1. **เงื่อนไขการใช้เว็บไซต์และบัญชี**
2. **เงื่อนไขการเช่า / เงินมัดจำ / ยกเลิก / No-show / Return**
3. **PDPA / KYC / การจัดการข้อมูล**
4. **Cookie / Tracking / Website Consent**

---

# 2. รายการเอกสารที่ต้องมี

## 2.1 เอกสารหลักที่ควรมีตั้งแต่ระบบเปิดใช้งาน

| ลำดับ | เอกสาร                                         | สถานะที่ควรมี                        | ใช้ตรงไหน                                    |
| ----- | ---------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| 1     | Terms of Service                               | ต้องมี                               | สมัครสมาชิก / ใช้เว็บไซต์                    |
| 2     | Privacy Policy / Privacy Notice                | ต้องมี                               | สมัครสมาชิก / footer / account               |
| 3     | Cookie Policy                                  | ต้องมี                               | cookie banner / footer                       |
| 4     | Rental Agreement / Rental Terms                | ต้องมี                               | ก่อนยืนยัน Booking / POS booking             |
| 5     | Booking Deposit, Cancellation & No-show Policy | ควรแยก section ชัด หรือแยกเอกสารย่อย | checkout / booking confirmation              |
| 6     | KYC Consent / Verification Notice              | ต้องมี                               | ก่อนอัปโหลดบัตรประชาชนหรือเอกสารยืนยันตัวตน  |
| 7     | Damage, Loss & Deposit Deduction Policy        | ต้องมี                               | Rental Agreement / ก่อน Pickup / หน้า policy |
| 8     | Electronic Signature & Evidence Acknowledgment | อาจรวมใน Terms + Rental Agreement    | checkout / pickup signature / admin flow     |

---

## 2.2 เอกสารที่ควรเตรียมไว้สำหรับเฟสถัดไป

| เอกสาร                                         | เหมาะใช้เมื่อ                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| Damage Protection / Optional Protection Terms  | เมื่อระบบมีประกันหรือแผนคุ้มครองความเสียหาย                       |
| B2B Account Terms                              | เมื่อเปิดบริษัทสมัครบัญชีองค์กร                                   |
| Corporate Customer KYC Notice                  | เมื่อรับหนังสือรับรองบริษัท, ภ.พ.20, เอกสารผู้มีอำนาจ             |
| Tax Document Request Terms                     | เมื่อระบบให้ลูกค้าขอ Full Tax Invoice / เอกสารภาษี                |
| Communication & Notification Consent           | ถ้ามี marketing consent / LINE notification / SMS promotional use |
| Data Processing Addendum / Vendor Privacy Note | ถ้ามีงาน enterprise หรือคู่ค้าต้องการเอกสารเชิงสัญญาเพิ่ม         |

---

# 3. เอกสารที่แนะนำให้ version ในระบบ

จาก foundation ปัจจุบันของ HOPNIC ที่มีแนวคิด `agreement_versions` และ `agreement_acceptance_logs` ควรใช้ slug เอกสารแบบนี้:

| Slug                      | เอกสาร                                         |
| ------------------------- | ---------------------------------------------- |
| `terms_of_service`        | Terms of Service                               |
| `privacy_policy`          | Privacy Policy                                 |
| `cookie_policy`           | Cookie Policy                                  |
| `rental_agreement`        | Rental Agreement / Rental Terms                |
| `booking_deposit_policy`  | Booking Deposit, Cancellation & No-show Policy |
| `damage_loss_policy`      | Damage, Loss & Deposit Deduction Policy        |
| `damage_protection_terms` | Damage Protection Terms                        |
| `kyc_consent`             | KYC Consent / Verification Notice              |

> หมายเหตุ: หาก schema ปัจจุบันยังไม่มี `cookie_policy` หรือ `booking_deposit_policy` ให้ตรวจ repo/schema ก่อนเพิ่มจริง อย่าเพิ่มแบบเดา

---

# 4. จุดในระบบที่ต้องให้ลูกค้าเห็น/ยอมรับเอกสาร

## 4.1 ตอนสมัครสมาชิก

แนะนำให้แสดง:

- Terms of Service
- Privacy Policy acknowledgement

รูปแบบ:

- checkbox ไม่ควรถูกติ๊กไว้ล่วงหน้า
- ต้องบันทึก:
  - user id
  - document slug
  - version
  - accepted at
  - IP address / user agent ถ้าระบบเก็บอยู่
  - context เช่น `signup`

ตัวอย่างข้อความ:

> ข้าพเจ้าได้อ่านและยอมรับข้อตกลงการใช้บริการ และรับทราบนโยบายความเป็นส่วนตัวของบริษัท

---

## 4.2 ก่อนยืนยันการจอง / ก่อนชำระ Booking Deposit

ต้องให้เห็นและกดยอมรับอย่างน้อย:

- Rental Agreement
- Booking Deposit, Cancellation & No-show Policy
- Damage, Loss & Deposit Deduction Policy (ถ้าต้องการบังคับตั้งแต่ checkout)
- Privacy / KYC notice อาจเป็นการรับทราบ ไม่จำเป็นต้องขอ consent ซ้ำถ้าไม่ใช่การเก็บข้อมูลใหม่

รูปแบบ:

- checkbox แบบ explicit
- ห้าม pre-check
- ควรมี link เปิด full terms
- ต้อง log version ที่ลูกค้ายอมรับ

Context ที่ควร log:

- `rental_checkout`
- booking id ถ้ามีแล้ว
- cart/session id ถ้ามี

---

## 4.3 ก่อนอัปโหลดบัตรประชาชน / เอกสาร KYC

ต้องให้ลูกค้ายอมรับ:

- KYC Consent / Verification Notice

เนื้อหาต้องชัดว่า:

- เก็บข้อมูลอะไร
- ใช้เพื่ออะไร
- ถ้าไม่ให้ข้อมูล อาจไม่สามารถรับสินค้าเช่าได้
- ใครเข้าถึงได้
- เก็บนานเท่าไรตามนโยบายบริษัท
- ช่องทางใช้สิทธิของเจ้าของข้อมูล

Context:

- `kyc_upload`
- `admin_pos_kyc_capture` หากพนักงานทำให้ลูกค้าที่หน้าร้าน

---

## 4.4 ตอน Admin / POS สร้าง Booking ให้ลูกค้า

ห้ามถือว่า admin กดแทนแล้วลูกค้ายอมรับเองโดยอัตโนมัติ เว้นแต่มีขั้นตอนรองรับหลักฐาน

ควรออกแบบอย่างใดอย่างหนึ่ง:

1. ลูกค้ากดรับทราบ/ยอมรับบนจอ customer-facing
2. ส่ง link ให้ลูกค้ากดยอมรับเอง
3. ลูกค้าเซ็นชื่อรับทราบบน tablet พร้อมแสดง summary terms
4. พนักงานบันทึกหลักฐานการยอมรับตาม flow ที่ระบบอนุญาต

หาก POS booking ทำให้ลูกค้า ณ จุดบริการ:

- ต้องมี acceptance context แยก เช่น `admin_pos_booking_customer_acknowledgment`
- บันทึก staff id / branch id / terminal id ถ้ามี

---

## 4.5 ตอน Pickup

ควรมีการอ้างอิง Rental Agreement ที่ลูกค้ายอมรับแล้ว และให้ลูกค้า:

- เซ็นรับมอบสินค้า
- รับทราบ checklist / สภาพสินค้า
- รับทราบยอดชำระ Pickup
- รับทราบเงื่อนไขความเสียหาย / คืนล่าช้า

สิ่งที่ใช้เป็นหลักฐาน:

- ลายเซ็นบน tablet
- staff id
- timestamp
- booking id
- document snapshot
- signed pickup form

---

## 4.6 ตอน Return

ควรมีเอกสาร:

- Return Confirmation
- Damage / Loss / Late Fee settlement acknowledgement ถ้ามี
- Refund acknowledgment หากคืนเงินมัดจำ

ไม่จำเป็นต้องให้ลูกค้ายอมรับ Terms ใหม่
แต่ต้องยึด Terms version ที่ยอมรับตอน booking/pickup

---

## 4.7 ตอนยกเลิก / ขอคืน Booking Deposit

ควรแสดงผลตาม policy:

- Eligible cancellation
- Late cancellation
- Refund request process
- ต้องกรอกบัญชีธนาคารหากรับเงินคืนด้วยการโอน

ถ้ามีการขอคืนเงิน:

- ควรมี Refund Request Acknowledgment / notification text
- ไม่จำเป็นต้องเป็น agreement ใหม่ แต่ควรเป็น UI notice ที่ชัดเจน

---

## 4.8 ตอน No-show

เมื่อ admin mark booking เป็น No-show:

- ระบบไม่ต้องให้ลูกค้ายอมรับใหม่
- แต่ต้องออกเอกสารเพื่ออธิบายผลของ policy ที่ลูกค้าเคยยอมรับแล้ว:
  1. ใบรับเงินค่าริบเงินมัดจำจองกรณีไม่มารับสินค้า
  2. หนังสือแจ้งการริบเงินมัดจำจองกรณีไม่มารับสินค้า

เอกสารควรอ้างอิง:

- Booking number
- Terms version / Booking policy reference ถ้ารองรับ
- จำนวน Booking Deposit ที่จ่ายแล้วและถูกริบจริง
- ยอดคืน 0 บาท

---

# 5. Locked Business Rules ที่เอกสารต้องสะท้อน

## 5.1 Booking Deposit

Booking Deposit เป็น:

- เงินที่ลูกค้าชำระตอนจอง
- เป็นส่วนหนึ่งของเงินมัดจำประกันที่คืนได้
- ไม่ใช่ค่าธรรมเนียมการจอง
- ไม่ใช่ค่าเช่า
- ไม่ใช่รายได้ทันทีในวันรับเงิน

ใน flow ปกติ:

- Booking Deposit จะไปลดเงินมัดจำประกันส่วนที่เหลือซึ่งเก็บวัน Pickup

---

## 5.2 Cancellation / Refund

Business rule ปัจจุบันที่ล็อกไว้:

- ยกเลิกก่อนวันรับสินค้าอย่างน้อย 3 วันปฏิทิน → คืน Booking Deposit ได้
- ยกเลิกช้ากว่านั้น → ไม่เข้าเงื่อนไขคืน
- No-show → ริบ Booking Deposit

> หากบริษัทต้องการเปลี่ยนนโยบายนี้ภายหลัง ต้อง version policy ใหม่ ห้ามแก้ข้อความเดิมย้อนทับ

---

## 5.3 No-show Forfeiture

กรณีลูกค้าไม่มารับสินค้า:

- Admin mark เป็น No-show
- เงิน Booking Deposit ที่จ่ายแล้วถูกริบตามเงื่อนไข
- วันที่ No-show ไม่ใช่วันที่รับเงินสดใหม่
- เป็นวันที่เงินเดิมเปลี่ยนสถานะจาก “เงินมัดจำที่อาจต้องคืน” ไปเป็น “ค่าปรับ / ค่าเสียหายจากการผิดเงื่อนไขการจอง”

เอกสารต้องสื่อสารชัดว่า:

> เงินจำนวนนี้ได้รับชำระไว้แล้วในวันจอง และถูกริบตามเงื่อนไขการจอง ณ วันที่ระบุในเอกสาร

---

## 5.4 No-show Forfeiture Amount

ห้าม hardcode 200 บาท

จำนวนที่ริบต้องเป็น:

> “จำนวน Booking Deposit ที่ลูกค้าชำระสำเร็จจริงสำหรับ booking นั้น และยังอยู่ในสถานะที่ริบได้”

ตัวอย่าง:

- ถ้าจ่าย 200 → ริบ 200
- ถ้าจ่าย 500 → ริบ 500
- ถ้าหา paid truth ไม่เจอ → ต้อง fail closed ไม่ควรออกเอกสารยอด 0 แบบเงียบ ๆ

---

## 5.5 Tax / VAT / WHT for No-show Forfeiture

เอกสารชุด No-show ต้องสื่อสารว่า:

- ไม่ใช่ใบกำกับภาษี
- ไม่เป็นฐาน VAT สำหรับกรณีค่าปรับ/ค่าเสียหายตามเงื่อนไขที่ระบบออกแบบไว้
- ไม่ใช่เอกสารหัก ณ ที่จ่าย
- เป็นเอกสารประกอบผลของการริบเงินมัดจำ / ค่าปรับตามข้อตกลง

> หมายเหตุ: ข้อความสุดท้ายควรให้ที่ปรึกษาภาษีตรวจทานก่อนเผยแพร่จริง

---

# 6. เนื้อหาที่ควรอยู่ในแต่ละเอกสาร

---

## 6.1 Terms of Service

### วัตถุประสงค์

ใช้กำหนดกติกาการใช้งานเว็บไซต์ บัญชีผู้ใช้ และระบบของ HOPNIC

### หัวข้อที่ควรมี

1. คำนิยาม
2. ขอบเขตการให้บริการ
3. การสมัครสมาชิกและการรักษาความปลอดภัยบัญชี
4. ความถูกต้องของข้อมูลที่ผู้ใช้ให้
5. การใช้งานระบบอย่างเหมาะสม
6. การสื่อสารผ่านระบบ อีเมล โทรศัพท์ และช่องทางที่บริษัทกำหนด
7. หลักฐานอิเล็กทรอนิกส์และการยอมรับผ่านระบบ
8. การเปลี่ยนแปลงบริการหรือเนื้อหาเว็บไซต์
9. ข้อจำกัดความรับผิดในขอบเขตที่กฎหมายอนุญาต
10. การระงับบัญชีหรือการปฏิเสธการให้บริการเมื่อมีเหตุอันสมควร
11. กฎหมายที่ใช้บังคับและช่องทางติดต่อ

### จุดที่ควรระวัง

- อย่าใส่เงื่อนไขเช่าเชิงลึกทั้งหมดไว้ใน ToS
- อย่าใส่ฟีเจอร์ที่ระบบยังไม่มี เช่น face scan ถ้ายังไม่ได้ใช้จริง

---

## 6.2 Rental Agreement / Rental Terms

### วัตถุประสงค์

ใช้เป็นข้อตกลงหลักสำหรับธุรกรรมเช่า

### หัวข้อที่ควรมี

1. คำนิยาม เช่น ผู้เช่า, ทรัพย์สินที่เช่า, วันรับสินค้า, วันคืนสินค้า
2. ขั้นตอนการจอง
3. Booking Deposit
4. ค่าเช่าและเงินมัดจำประกัน
5. การชำระเงินวัน Pickup
6. KYC / การยืนยันตัวตนก่อนรับสินค้า
7. การรับมอบสินค้า / checklist / ลายเซ็นรับของ
8. การใช้งานสินค้าอย่างเหมาะสม
9. ข้อจำกัดการใช้งาน / ห้ามโอนสิทธิ์เช่า
10. การคืนสินค้า
11. ความเสียหาย สูญหาย และการหักเงินมัดจำ
12. การชำระส่วนต่างหากความเสียหายเกินเงินมัดจำ
13. การยกเลิก
14. No-show
15. การคืน Booking Deposit
16. การแจ้งเตือนและเอกสารที่ระบบออกให้
17. การยอมรับข้อตกลงโดยวิธีอิเล็กทรอนิกส์
18. ช่องทางติดต่อและการระงับข้อพิพาท

---

## 6.3 Booking Deposit, Cancellation & No-show Policy

### วัตถุประสงค์

ทำให้ลูกค้าเข้าใจเรื่องเงินมัดจำจองก่อนกดชำระ

### หัวข้อที่ควรมี

1. Booking Deposit คืออะไร
2. Booking Deposit ไม่ใช่ค่าธรรมเนียมการจอง
3. Booking Deposit เป็นส่วนหนึ่งของ Refundable Security Deposit
4. จำนวน Booking Deposit ที่ระบบเรียกเก็บอาจขึ้นกับเงื่อนไขราคา/ระยะเวลาที่บริษัทกำหนด
5. เงื่อนไขการคืนเงินมัดจำจอง
6. เงื่อนไข late cancellation
7. เงื่อนไข No-show
8. ขั้นตอนคืนเงินและข้อมูลบัญชีธนาคาร
9. การแก้ไขข้อมูลบัญชีคืนเงิน
10. เอกสารที่ออกเมื่อเกิด No-show forfeiture

### Locked policy ที่ควรเขียน

- ยกเลิกล่วงหน้าอย่างน้อย 3 วันปฏิทิน → คืนได้
- ยกเลิกช้า / No-show → ริบได้ตามเงื่อนไข

---

## 6.4 Damage, Loss & Deposit Deduction Policy

### วัตถุประสงค์

อธิบายสิทธิของบริษัทในการตรวจสภาพและหักเงินมัดจำ

### หัวข้อที่ควรมี

1. ภาระหน้าที่ผู้เช่าระหว่างครอบครองสินค้า
2. การตรวจสภาพก่อนและหลังเช่า
3. ความเสียหายจากการใช้งานผิดวิธี
4. ความเสียหายจากการสูญหาย / ไม่คืน / อุปกรณ์ไม่ครบ
5. การประเมินค่าเสียหาย
6. การหักเงินมัดจำ
7. การเรียกเก็บเงินส่วนต่าง
8. กรณีต้องซ่อม / ส่งตรวจ / รอประเมิน
9. หลักฐานประกอบการตัดสิน เช่น checklist, รูปภาพ, ลายเซ็น
10. ช่องทางคัดค้านหรือสอบถาม

### จุดที่ยังควรหลีกเลี่ยงถ้ายังไม่ล็อกระบบ

- “เงียบหาย ค่าปรับพิเศษ 500 บาท/สัปดาห์”
  อย่าใส่จนกว่าจะมี business approval และระบบคำนวณรองรับจริง

---

## 6.5 KYC Consent / Verification Notice

### วัตถุประสงค์

ใช้สำหรับการเก็บข้อมูลยืนยันตัวตนและเอกสารประกอบการเช่า

### หัวข้อที่ควรมี

1. วัตถุประสงค์การยืนยันตัวตน
2. ประเภทข้อมูลที่เก็บ
   - ชื่อ-นามสกุล
   - เบอร์โทรศัพท์
   - อีเมล
   - ที่อยู่
   - ภาพบัตรประชาชน / เอกสารผู้มีอำนาจ / เอกสารบริษัทในอนาคต
3. เหตุผลที่จำเป็นต่อการให้บริการเช่า
4. ผลกระทบหากไม่ให้ข้อมูล
5. ผู้มีสิทธิเข้าถึงข้อมูล
6. การเก็บรักษาและระยะเวลาจัดเก็บ
7. มาตรการรักษาความปลอดภัย
8. สิทธิของเจ้าของข้อมูล
9. ช่องทางติดต่อบริษัท

---

## 6.6 Privacy Policy / Privacy Notice

### วัตถุประสงค์

แจ้งเจ้าของข้อมูลตาม PDPA ว่าบริษัทเก็บ ใช้ เปิดเผยข้อมูลอะไร และเพื่ออะไร

### หัวข้อที่ควรมี

1. ผู้ควบคุมข้อมูลส่วนบุคคล
2. ช่องทางติดต่อ
3. กลุ่มเจ้าของข้อมูล
4. ประเภทข้อมูลที่เก็บ
   - Identity/contact
   - Account data
   - Rental transaction data
   - Payment/refund data
   - KYC documents
   - Tax profile data ถ้ามี
   - System log / technical data
5. วัตถุประสงค์การใช้ข้อมูล
6. ฐานการประมวลผลข้อมูล
   - เพื่อปฏิบัติตามสัญญา
   - เพื่อปฏิบัติตามกฎหมาย
   - เพื่อประโยชน์โดยชอบด้วยกฎหมาย
   - ความยินยอม เฉพาะที่จำเป็น
7. ผู้รับหรือประเภทผู้รับข้อมูล
   - payment gateway
   - cloud/service provider
   - หน่วยงานรัฐเมื่อมีอำนาจตามกฎหมาย
8. การโอนข้อมูลไปต่างประเทศ ถ้ามี
9. ระยะเวลาการเก็บรักษา
10. สิทธิของเจ้าของข้อมูล
11. ผลกระทบหากไม่ให้ข้อมูล
12. มาตรการรักษาความปลอดภัย
13. การแก้ไขนโยบาย
14. ช่องทางติดต่อเพื่อใช้สิทธิ

### จุดที่ควรระวัง

- อย่าระบุ “เก็บ traffic data อย่างน้อย 90 วัน” แบบฟันธง เว้นแต่บริษัทตรวจแล้วว่ามีหน้าที่ตามกฎหมายในฐานะผู้ให้บริการและเก็บข้อมูลดังกล่าวจริง
- ควรเขียนว่า “บริษัทอาจเก็บข้อมูลเทคนิคและ log ตามความจำเป็นเพื่อความปลอดภัยและการปฏิบัติตามกฎหมายที่เกี่ยวข้อง”

---

## 6.7 Cookie Policy

### วัตถุประสงค์

อธิบายการใช้คุกกี้ของเว็บไซต์

### หัวข้อที่ควรมี

1. คุกกี้คืออะไร
2. ประเภทคุกกี้ที่ใช้
   - Necessary cookies
   - Functional cookies
   - Analytics cookies
   - Marketing cookies ถ้ามี
3. วัตถุประสงค์ของแต่ละประเภท
4. ระยะเวลาการเก็บคุกกี้
5. Third-party cookies ถ้ามี
6. วิธีจัดการหรือถอนความยินยอม
7. ความสัมพันธ์กับ Cookie Banner
8. ช่องทางติดต่อ

### ระบบควรรองรับ

- Cookie banner
- Necessary cookies เปิดไว้โดยไม่ต้องขอ consent หากเข้าข่ายจำเป็น
- Non-essential cookies ต้องให้ผู้ใช้เลือก
- บันทึก consent preference ถ้าระบบทำ

---

# 7. สิ่งที่ “ยังไม่ควรใส่” หากยังไม่ได้ล็อกเป็น policy จริง

| ประเด็น                                                     | เหตุผล                                                |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| สแกนใบหน้า                                                  | ถ้าระบบยังไม่ใช้จริง อย่าใส่                          |
| ระงับสิทธิ์เมื่อยกเลิกเกิน 5 ครั้ง/12 เดือน                 | ยังไม่เห็นว่า approve และ implement แล้ว              |
| ค่าปรับเงียบหาย 500 บาท/สัปดาห์                             | กระทบ settlement / เอกสาร / dispute ต้องล็อกเพิ่มก่อน |
| ดึงคำว่า “ประกัน” มาใช้ ถ้ายังไม่ใช่ insurance product จริง | เสี่ยงตีความเกิน scope                                |
| สัญญาว่าคืนเงินใน X วัน ถ้ายังไม่กำหนด SLA operational จริง | ต้องสอดคล้องทีมบัญชี/การเงิน                          |
| ระบุการเก็บ traffic data 90 วันแบบตายตัว                    | ต้องตรวจ obligation และ actual practice ก่อน          |

---

# 8. Legal / System Evidence ที่ควรบันทึก

## 8.1 Agreement Acceptance Log

ควรบันทึก:

- user id
- booking id / order id หากเกี่ยวข้อง
- document slug
- agreement version
- accepted at
- acceptance context
- ip address ถ้ามี
- user agent ถ้ามี
- accepted by role:
  - customer
  - staff-assisted / admin POS
- staff id ถ้ามี admin involved

---

## 8.2 Signature Evidence

สำหรับ Pickup / Return:

- booking id
- document type
- signature payload / image reference
- signed at
- staff id
- branch context
- relevant checklist ids
- device/session metadata ถ้ามี

---

## 8.3 Document Snapshot Principle

เอกสารที่ออกแล้วควร freeze snapshot:

- company header
- customer identity relevant to document
- booking info
- financial values
- terms/reference used
- issued_at
- document number

เพื่อให้การพิมพ์ย้อนหลังไม่เปลี่ยนตาม profile ปัจจุบัน

---

# 9. Mapping เอกสารกับ Flow ของระบบ

| Flow                    | เอกสารที่เกี่ยวข้อง                                  | ต้องให้ยอมรับไหม            | ต้อง log ไหม                 |
| ----------------------- | ---------------------------------------------------- | --------------------------- | ---------------------------- |
| สมัครสมาชิก             | ToS, Privacy                                         | ใช่                         | ใช่                          |
| เข้าเว็บครั้งแรก        | Cookie Policy                                        | consent เฉพาะ non-essential | ควร                          |
| Checkout จองเช่า        | Rental Agreement, Booking Deposit Policy             | ใช่                         | ใช่                          |
| Upload KYC              | KYC Consent                                          | ใช่                         | ใช่                          |
| Admin POS สร้าง Booking | Rental Agreement / Booking Deposit Policy            | ต้องมีหลักฐานการรับทราบ     | ใช่                          |
| Pickup                  | Rental Agreement reference, checklist acknowledgment | เซ็นรับมอบ                  | ใช่                          |
| Return                  | Return confirmation / damage settlement              | เซ็นหรือยืนยันตาม flow      | ใช่                          |
| Cancellation            | Cancellation policy result                           | ไม่ต้อง accept ใหม่         | ควร log action               |
| Refund request          | Refund details notice                                | ไม่ต้อง accept ใหม่         | ควร log action               |
| No-show                 | Notice + forfeiture receipt                          | ไม่ต้อง accept ใหม่         | ต้อง issue doc + audit event |

---

# 10. Suggested Document Build Order for HOPNIC

## Phase 1 — Legal architecture & content blueprint

- ล็อกรายการเอกสาร
- ล็อก flow จุดยอมรับ
- ล็อก slug/versioning
- ล็อกสิ่งที่ยังห้ามใส่

## Phase 2 — Draft content

- ร่าง Terms of Service
- ร่าง Rental Agreement
- ร่าง Privacy Policy
- ร่าง KYC Consent
- ร่าง Cookie Policy
- ร่าง Damage/Loss Policy

## Phase 3 — Legal/content review

- ตรวจถ้อยคำร่วมกับ business owner
- ตรวจภาษีกับ accountant/tax advisor
- ตรวจ PDPA กับ legal/privacy advisor

## Phase 4 — System implementation

- Agreement version pages
- checkbox / acceptance UI
- acceptance logs
- admin/POS acceptance flow
- link footer/policy pages
- cookie banner

## Phase 5 — Smoke test

- signup acceptance
- checkout acceptance
- KYC consent
- POS assisted acceptance
- version log retrieval
- document links from footer/account/checkout

---

# 11. Questions that still require explicit business decision

ก่อนร่าง final/legal และก่อน implement ระบบเพิ่ม ควรตัดสินใจเรื่องเหล่านี้ให้ครบ:

1. HOPNIC จะมี **Refund SLA** ไหม เช่น “ภายใน 7 วันทำการหลังข้อมูลครบ”
2. จะให้ลูกค้า **ยกเลิกเองได้ถึงเวลาใด** ในหน้าเว็บ ถ้าเลย window แล้ว UI จะแค่ปิด หรือให้ส่งคำขอ?
3. กรณี admin POS สร้าง booking ให้ลูกค้า ลูกค้าจะยอมรับ terms ผ่าน:
   - tablet signature?
   - OTP/link?
   - staff-confirmed acknowledgment?
4. จะมี **B2B/company rental terms** แยกจากลูกค้าทั่วไปหรือไม่?
5. จะมี **Damage Protection** จริงหรือไม่?
6. จะมี **penalty เงียบหาย 500 บาท/สัปดาห์** จริงหรือไม่?
7. จะมี **excessive cancellation lock** จริงหรือไม่?
8. ระยะเวลาเก็บ KYC document กี่ปี?
9. ระยะเวลาเก็บบัญชีธนาคารสำหรับ refund กี่ปี?
10. มีการใช้ analytics/marketing cookies อะไรจริงบนเว็บ?

---

# 12. Drafting Tone Recommendation

เอกสาร HOPNIC ควรใช้:

- ภาษาไทยชัดเจน อ่านง่าย
- ไม่ legalese เกินจำเป็น
- คำสำคัญต้องคงที่ทั้งระบบ:
  - เงินมัดจำจอง
  - เงินมัดจำประกัน
  - ค่าเช่า
  - ไม่มารับสินค้า / No-show
  - ค่าปรับ / ค่าเสียหายจากการผิดเงื่อนไขการจอง
- หากจำเป็นต้องมีอังกฤษ ให้ใช้เป็นคำรอง ไม่ใช่หัวข้อหลัก

---

# 13. Source Notes for Legal Review

เอกสารนี้ควรถูกตรวจทานต่อโดยอ้างอิงอย่างน้อย:

- แนวทาง Privacy Notice และการแจ้งวัตถุประสงค์/ฐานการประมวลผลตาม PDPC/GPPC
- แนวทาง Cookie Policy และการแยกประเภทคุกกี้
- แนวทาง e-Contract / e-Signature / การเก็บหลักฐานการยอมรับตาม ETDA
- กฎหมายและแนวปฏิบัติที่เกี่ยวข้องกับข้อมูลจราจรทางคอมพิวเตอร์ โดยต้องตรวจว่าหน้าที่ของ HOPNIC เข้าข่ายเพียงใด
- ความเห็นที่ปรึกษาภาษีเกี่ยวกับการใช้คำอธิบายเอกสาร No-show forfeiture

---

# 14. Final Working Recommendation

สำหรับ HOPNIC เวอร์ชันปัจจุบัน ควรเดินตามลำดับนี้:

1. **ใช้ Blueprint นี้เป็นแม่บท**
2. ร่างเอกสารฉบับจริง 6 ตัวก่อน:
   - Terms of Service
   - Rental Agreement
   - Booking Deposit / Cancellation / No-show Policy
   - Privacy Policy
   - KYC Consent
   - Cookie Policy
3. ให้ legal/tax review
4. ค่อยทำ prompt ให้ Augment implement หน้า policy + acceptance flow + version logs ตาม schema ปัจจุบัน
