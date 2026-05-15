# Hopnic Web Agreements Guideline

Last updated: 2026-05-10

Status: **DRAFT GUIDELINE / PARTIAL AGREEMENT FOUNDATION** as of 2026-05-13.

Reality sync:

- Agreement versioning and acceptance-log schema foundation exists via migration `069`.
- Final Terms/Privacy/Rental/Damage copy, public legal pages, checkout/POS consent logging, and admin agreement management UI are not complete.
- This remains non-legal-advice content guidance until reviewed by legal/PDPA/accounting advisors.

> เอกสารนี้ใช้เป็นแผนออกแบบ Terms/Policy/Agreement บนเว็บ Hopnic ก่อนนำขึ้นใช้งานจริงควรให้ทนาย/ที่ปรึกษา PDPA/บัญชี ตรวจถ้อยคำ เงื่อนไขภาษี การคืนเงิน และข้อจำกัดความรับผิดอีกครั้ง

## 1. สรุปว่าเหมาะกับเว็บ Hopnic ไหม

เหมาะ และควรแยก agreement ออกเป็นหลายฉบับ ไม่ควรรวมทุกอย่างเป็นเอกสารเดียว เพราะแต่ละจุดในระบบมีเจตนาและหลักฐานคนละแบบ เช่น สมัครสมาชิก, upload เอกสาร, checkout, รับสินค้า, คืนสินค้า และเลือกแผนคุ้มครองความเสียหาย

เอกสารหลักที่ควรมี:

| เอกสาร                  | ใช้ตอนไหน                       | จุดประสงค์                                       |
| ----------------------- | ------------------------------- | ------------------------------------------------ |
| Terms of Service        | สมัครสมาชิก / ใช้เว็บ           | เงื่อนไขการใช้เว็บไซต์และบัญชีผู้ใช้             |
| Privacy Policy / PDPA   | สมัครสมาชิก / Upload เอกสาร     | แจ้งการเก็บ ใช้ เปิดเผย และสิทธิของเจ้าของข้อมูล |
| Rental Agreement        | ก่อนยืนยันเช่า                  | เงื่อนไขการเช่า คืนสินค้า มัดจำ ค่าเช่า          |
| Damage / Loss Policy    | ก่อนยืนยันเช่า / ตอนตรวจคืน     | ค่าเสียหาย สูญหาย คืนล่าช้า                      |
| Damage Protection Terms | เมื่อลูกค้าเลือกซื้อแผนคุ้มครอง | ขอบเขตความคุ้มครอง ข้อยกเว้น วงเงิน              |

## 2. จุดกดยอมรับบนเว็บ

| จุดในระบบ               | Checkbox / Action                                    | Agreement ที่เกี่ยวข้อง                | หลักฐานที่ควรเก็บ                             |
| ----------------------- | ---------------------------------------------------- | -------------------------------------- | --------------------------------------------- |
| สมัครสมาชิก             | ยอมรับ Terms และ Privacy                             | Terms of Service, Privacy Policy       | user id, version, accepted_at, IP, user agent |
| Upload เอกสาร           | ยืนยันว่าเอกสารจริง ถูกต้อง และยินยอมให้ใช้เพื่อ KYC | KYC Consent, Privacy Policy            | document id, consent version, timestamp       |
| Checkout ก่อนชำระเงิน   | ยอมรับเงื่อนไขเช่าและความเสียหาย                     | Rental Agreement, Damage / Loss Policy | booking id, agreement versions, timestamp     |
| เลือก Damage Protection | ยอมรับเงื่อนไขแผนคุ้มครองแยกต่างหาก                  | Damage Protection Terms                | booking id, selected plan id, terms version   |
| Admin/POS Booking       | พนักงานบันทึกว่าลูกค้ายินยอมผ่านช่องทางใด            | ทุกเอกสารที่เกี่ยวข้อง                 | admin id, channel, evidence file              |

## 3. Terms of Service

### ควรวางตรงไหน

- Footer: `Terms of Service`
- สมัครสมาชิก: checkbox
- Checkout: link ให้อ่านซ้ำ
- Admin/POS: ให้พนักงานอ้างอิงเวลาแจ้งลูกค้า

### หัวข้อที่ควรมี

1. ข้อมูลบริษัท
   - บริษัท ฮอปนิค จำกัด
   - เลขทะเบียนนิติบุคคล: 0105564155415
   - สำนักงานใหญ่: 888/8 หมู่ที่ 1 ตำบลพนมสารคาม อำเภอพนมสารคาม จังหวัดฉะเชิงเทรา 24120
2. การยอมรับข้อตกลง
   - เมื่อสมัครสมาชิก ใช้งานเว็บไซต์ ทำรายการจอง เช่า ชำระเงิน หรือส่งข้อมูลให้บริษัท ถือว่าอ่าน เข้าใจ และยอมรับเงื่อนไขที่เกี่ยวข้องแล้ว
3. คุณสมบัติของผู้ใช้บริการ
   - ต้องให้ข้อมูลจริง ถูกต้อง เป็นปัจจุบัน
   - ห้ามใช้ข้อมูลหรือเอกสารของบุคคลอื่น
   - กรณีเช่าในนามบริษัท ผู้ดำเนินการต้องมีอำนาจหรือได้รับอนุญาต
4. บัญชีผู้ใช้
   - ลูกค้าต้องดูแล username/password
   - ธุรกรรมจากบัญชีลูกค้าถือเป็นความรับผิดชอบของลูกค้า
   - ห้ามโอนบัญชีให้ผู้อื่นใช้
5. การจองและการอนุมัติ
   - การจองผ่านเว็บไซต์ยังไม่ถือว่าสมบูรณ์จนกว่าบริษัทจะตรวจสอบข้อมูล เอกสาร การชำระเงิน และยืนยันอนุมัติ
6. ราคาและการชำระเงิน
   - ค่าเช่า ค่ามัดจำ ค่าจัดส่ง VAT ภาษีหัก ณ ที่จ่าย ใบกำกับภาษี และกรณีราคาผิดพลาด
7. การแก้ไข ยกเลิก และคืนเงิน
   - เงื่อนไขยกเลิกก่อน/หลังจัดส่ง ค่าธรรมเนียม gateway และการคืนเงิน
8. ข้อห้ามในการใช้งานเว็บไซต์
   - ห้ามใช้ข้อมูลปลอม โจมตีระบบ คัดลอกข้อมูลไปใช้เชิงพาณิชย์ หรือใช้เว็บเพื่อผิดกฎหมาย
9. สิทธิ์ของบริษัท
   - ปฏิเสธการเช่า ขอเอกสารเพิ่ม ขอเงินมัดจำเพิ่ม ระงับบัญชี ยกเลิกรายการ หรือแก้ไขข้อมูลผิดพลาด
10. กฎหมายที่ใช้บังคับ

- อยู่ภายใต้กฎหมายไทย และข้อพิพาทให้อยู่ในเขตอำนาจศาลไทย

## 4. Privacy Policy / PDPA

### ควรวางตรงไหน

- Footer: `Privacy Policy`
- สมัครสมาชิก
- หน้า Upload เอกสาร
- ก่อนส่งบัตรประชาชน / หนังสือรับรองบริษัท
- Account > Privacy

### หัวข้อที่ควรมี

1. ข้อมูลที่เก็บ
   - ข้อมูลทั่วไป: ชื่อ เบอร์โทร อีเมล ที่อยู่ Line ID
   - ข้อมูลยืนยันตัวตน: บัตรประชาชน หนังสือรับรองบริษัท ภ.พ.20 สำเนาบัตรกรรมการ หนังสือมอบอำนาจ
   - ข้อมูลธุรกรรม: รายการเช่า ประวัติชำระเงิน ประวัติคืนสินค้า ประวัติความเสียหาย หลักฐานโอน
   - ข้อมูลระบบ: IP Address, device, browser, login log, consent log
2. วัตถุประสงค์
   - ยืนยันตัวตน อนุมัติการเช่า ป้องกัน fraud ออกเอกสารภาษี จัดส่ง ติดตามคืนสินค้า เรียกเก็บค่าเสียหาย และปฏิบัติตามกฎหมาย
3. การเปิดเผยข้อมูล
   - ขนส่ง payment gateway ระบบบัญชี cloud storage พนักงานที่เกี่ยวข้อง ที่ปรึกษากฎหมาย/บัญชี หน่วยงานราชการ และบริษัทประกันถ้ามี
4. ระยะเวลาเก็บรักษา
   - เก็บเท่าที่จำเป็นตามวัตถุประสงค์ กฎหมาย บัญชี ภาษี และการป้องกันข้อพิพาท หลังหมดความจำเป็นให้ลบ ทำลาย หรือ anonymize
5. สิทธิของลูกค้า
   - เข้าถึง แก้ไข ถอนความยินยอม ลบ คัดค้าน ขอสำเนาข้อมูล และร้องเรียน

## 5. Rental Agreement

### ควรวางตรงไหน

- Checkout ก่อนกดยืนยันเช่า
- แนบกับ Rental Order
- ส่งใน Email Confirmation
- Admin/POS ต้องให้ลูกค้ายอมรับก่อนปล่อยสินค้า

### หัวข้อที่ควรมี

1. รายการสินค้าเช่า
   - ชื่อสินค้า SKU Serial Number / Asset Tag จำนวน มูลค่าสินค้า ค่าเช่า วันที่เริ่มเช่า วันที่ครบกำหนดคืน สถานที่รับ/คืน และอุปกรณ์เสริม
2. ระยะเวลาเช่า
   - เริ่มนับเมื่อรับสินค้า หรือบริษัทจัดส่งถึงสถานที่ที่ลูกค้ากำหนด และสิ้นสุดเมื่อบริษัทได้รับคืนและตรวจสภาพเรียบร้อย
3. หน้าที่ของลูกค้า
   - ใช้งานตามวัตถุประสงค์ ดูแลสินค้า ไม่ดัดแปลง ไม่ให้เช่าต่อ ไม่ย้ายสถานที่โดยไม่แจ้ง คืนให้ครบ และแจ้งทันทีหากเสียหาย/สูญหาย
4. หน้าที่ของบริษัท
   - ส่งมอบสินค้าพร้อมใช้งาน ตรวจสอบก่อนปล่อยเช่า ให้ข้อมูลการใช้งาน ออกเอกสารทางการเงิน และตรวจรับคืนอย่างเป็นธรรม
5. การรับสินค้าและคืนสินค้า
   - ลูกค้าต้องตรวจตอนรับ ถ้าพบปัญหาควรแจ้งภายในเวลาที่กำหนด เช่น 24 ชั่วโมง การปิดรายการสมบูรณ์เมื่อบริษัทตรวจคืนแล้ว
6. มัดจำ
   - มัดจำเป็นหลักประกัน ไม่ใช่ค่าเช่า คืนเมื่อสินค้าอยู่ในสภาพปกติและไม่มีหนี้ค้าง บริษัทมีสิทธิ์หักค่าเสียหาย ค่าเช่าค้าง ค่าทำความสะอาด ค่าขนส่ง หรือค่าปรับ

## 6. Damage / Loss Policy

### ควรวางตรงไหน

- Checkout
- Product detail ใต้สินค้า
- Rental Agreement
- Admin ตอนตรวจคืน

### หัวข้อที่ควรมี

1. ประเภทความเสียหาย
   - แตก หัก ชำรุด ไฟไหม้ น้ำเข้า ใช้งานผิดประเภท อุปกรณ์เสริมหาย แบตเตอรี่/สาย/หัวต่อ/กล่องหาย Serial tag/RFID/QR หายหรือถูกแกะ
2. หลักการคิดค่าเสียหาย
   - ค่าซ่อม ค่าอะไหล่ ค่าแรงตรวจเช็ก ค่าขนส่งไปซ่อม ค่าเสียโอกาส และค่าสินค้าทดแทนกรณีเสียหายหนักหรือสูญหาย
3. สินค้าสูญหาย
   - หากสูญหาย ถูกขโมย ไม่สามารถคืนได้ หรือเสียหายจนใช้งานไม่ได้ ลูกค้าต้องรับผิดชอบมูลค่าทดแทนตามที่บริษัทกำหนด โดยหักมัดจำหรือวงเงินคุ้มครองที่เกี่ยวข้อง หากมี
4. คืนล่าช้า
   - คิดค่าเช่าเพิ่มเติมตามอัตรารายวันจนกว่าสินค้าจะถูกส่งคืนและตรวจรับเรียบร้อย และอาจมีค่าปรับเพิ่มหากกระทบลูกค้ารายถัดไป
5. Damage Claim Flow
   - Returned → Inspection → Normal / Damage Found → Estimate Repair Cost → Notify Customer → Customer Accept / Dispute → Payment → Closed

## 7. Damage Protection Terms

### ควรวางตรงไหน

- Checkout เป็น add-on
- Product Detail
- ใบจอง / Rental Order
- Admin ตอนอนุมัติรายการ

### คำที่ควรใช้

ถ้ายังไม่ได้เป็นบริษัทประกันหรือยังไม่มี partner บริษัทประกัน ควรใช้คำว่า `Damage Protection Plan` หรือ `แผนคุ้มครองความเสียหายเบื้องต้น` แทนคำว่า “ประกันภัย” เพื่อไม่ให้ลูกค้าเข้าใจว่าเป็นกรมธรรม์ประกันภัยเต็มรูปแบบ

### หัวข้อที่ควรมี

1. แผนนี้คืออะไร
   - เป็นแผนคุ้มครองความเสียหายบางประเภทตามเงื่อนไขและวงเงินที่บริษัทกำหนด
2. ครอบคลุมอะไร
   - ความเสียหายจากการใช้งานปกติ ความเสียหายโดยไม่เจตนา หรือความเสียหายบางส่วนภายในวงเงิน
3. ไม่ครอบคลุมอะไร
   - สูญหาย ถูกขโมย ใช้งานผิดประเภท จงใจทำให้เสียหาย แกะ/ดัดแปลง/ซ่อมเอง ใช้งานผิดกฎหมาย อุปกรณ์เสริมหาย หรือความเสียหายเกินวงเงิน
4. วงเงินคุ้มครอง
   - ระบุค่าแผน วงเงินสูงสุด และเงื่อนไขว่าไม่ครอบคลุมความเสียหายนอกเงื่อนไข
5. วิธีเคลม
   - ลูกค้าแจ้งปัญหา บริษัทตรวจสินค้า ประเมินความเสียหาย หักวงเงินคุ้มครอง และลูกค้าชำระส่วนต่างหากเกินวงเงิน

## 8. โครงหน้าเว็บที่ควรมี

### Footer

- Terms of Service
- Privacy Policy
- Rental Agreement
- Damage & Loss Policy
- Damage Protection Terms
- Refund & Cancellation Policy
- Contact Us

### Account

- Profile
- Verification
- Documents
- Consent History
- Privacy Request
- Security

### Checkout

- Rental Summary
- Customer Information
- Document Verification
- Deposit / Damage Protection
- Payment
- Agreement Confirmation

## 9. Database ที่ควรเก็บสำหรับ Agreement

### `agreements`

| Field          | Example                                        |
| -------------- | ---------------------------------------------- |
| id             | 1                                              |
| agreement_type | terms / privacy / rental / damage / protection |
| version        | v1.0                                           |
| title          | Terms of Service                               |
| content        | Markdown/HTML                                  |
| effective_date | date                                           |
| is_active      | true                                           |

### `user_agreement_acceptances`

| Field                | Example                        |
| -------------------- | ------------------------------ |
| id                   | 1                              |
| user_id              | customer id                    |
| agreement_type       | rental                         |
| agreement_version    | v1.0                           |
| accepted_at          | datetime                       |
| accepted_channel     | website / admin / line / email |
| ip_address           | IP                             |
| user_agent           | browser                        |
| booking_id           | rental booking id              |
| evidence_url         | file/screenshot proof          |
| accepted_by_admin_id | admin id if recorded by staff  |

## 10. ลำดับทำจริงที่แนะนำ

### Phase 1: ต้องมีทันที

- Terms of Service
- Privacy Policy / PDPA
- Rental Agreement
- Damage / Loss Policy
- Checkbox ตอนสมัครและ Checkout
- เก็บ consent log ใน database

### Phase 2: ก่อนเริ่มปล่อยเช่าเยอะ

- Damage Protection Terms
- Upload KYC documents
- Admin verification status
- Customer risk level
- Damage claim workflow

### Phase 3: ระยะยาว

- Consent versioning
- Privacy request workflow
- Account deletion / anonymization
- Sign out all devices
- Email/phone verification
- Admin audit log

## 11. สรุปสั้นที่สุด

เว็บ Hopnic ควรมี Agreement หลัก 5 ตัว:

1. Terms of Service — ใช้เว็บอย่างไร
2. Privacy / PDPA Policy — เก็บข้อมูลอะไร ใช้ทำอะไร
3. Rental Agreement — เช่าอย่างไร คืนอย่างไร จ่ายอย่างไร
4. Damage / Loss Policy — เสียหาย สูญหาย คืนช้า คิดเงินอย่างไร
5. Damage Protection Terms — ถ้าซื้อแผนคุ้มครอง ครอบคลุม/ไม่ครอบคลุมอะไร

และควรมีจุดกดยอมรับอย่างน้อย 4 จุด:

1. ตอนสมัครสมาชิก
2. ตอน Upload เอกสาร
3. ตอน Checkout ก่อนชำระเงิน
4. ตอนเลือกซื้อ Damage Protection

หลักฐานที่ระบบควรเก็บทุกครั้ง:

- user id
- agreement type
- version
- accepted at
- IP address
- user agent
- booking id ถ้าเกี่ยวกับรายการเช่า
- accepted channel
- evidence file ถ้ามีจาก Admin/POS
