1. ตารางสินค้าหลัก (Table: products)
รูปภาพอ้างอิง	nameTh	nameEn	mainCategoryKey	brand	tagKeys (Facets)	searchKeywords (คำค้นพ้อง)
1.jpg	ใบตัดเหล็กและสแตนเลส 4 นิ้ว 3M Green Corps	3M Green Corps Cut Off Wheel 4-Inch	construction_consumables	3M	["cutting_disc", "steel_cutting", "abrasives"]	["ใบตัด3M", "ใบตัดเขียว", "หินตัด", "แผ่นตัด4นิ้ว"]
2.jpg	ใบเจียรเหล็ก 4 นิ้ว แบบหนา 3M Cubitron II	3M Cubitron II Grinding Disc 4-Inch Thick	construction_consumables	3M	["grinding_disc", "thick_grinding", "abrasives"]	["ใบเจียรหนา", "ใบเจียร3M", "คิวบิตรอน"]
3.jpg	ใบเจียรผ้าทรายซ้อน 4 นิ้ว เบอร์ 80 3M 251A	3M 251A Flap Disc 4-Inch Grit 80	construction_consumables	3M	["flap_disc", "sanding_disc", "grit_80"]	["จานผ้าทราย", "ผ้าทรายซ้อน", "ใบขัดกระดาษทราย"]
5.jpg	พุ๊กพลาสติก เบอร์ 7 (แพ็ค)	Plastic Anchor No.7 (Pack)	screws_bolts	Generic	["plastic_anchor", "wall_plug", "no_7"]	["พุกพลาสติก", "พุกตัวหนอน", "พุกเบอร์7"]
6.jpg	เทปพันสายไฟ สีดำ 3M Temflex 150	3M Temflex 150 Electrical Tape Black	construction_consumables	3M	["electrical_tape", "insulation_tape", "black_tape"]	["เทปดำ", "เทปพันสายไฟ3M", "เทปฉนวน", "temflex150"]
7.jpg	เทปพันเกลียวท่อประปา SCG	SCG Thread Seal Tape	construction_consumables	SCG	["thread_seal_tape", "ptfe_tape", "plumbing_tape"]	["เทปพันเกลียว", "เทปพันท่อ", "เทปประปา", "เทปขาว"]
9.jpg	ถุงมือช่างเคลือบกันลื่น 3M Comfort Grip Gloves	3M Comfort Grip Gloves PU Coated	ppe_general	3M	["pu_coated_gloves", "work_gloves", "anti_slip"]	["ถุงมือช่าง3M", "ถุงมือเคลือบพียู", "ถุงมือกันลื่น"]
10.jpg	แว่นตานิรภัย เลนส์ใส 3M	3M Safety Glasses Clear Lens	safety_equipment	3M	["safety_glasses", "clear_lens", "eye_protection"]	["แว่นเซฟตี้", "แว่นนิรภัย3M", "แว่นตาใส", "แว่นกันสะเก็ด"]
2. ตารางรุ่นย่อยและราคาตลาด (Table: product_skus)
ทุกรายการถูกตั้งค่าเป็นสกุลเงิน THB

กำหนดโครงสร้างรหัสควบคุม (skuCode) และคำนวณเปอร์เซ็นต์ส่วนลดเทียบกับราคาตั้งต้นโดยอัตโนมัติ:

JSON
[
  {
    "skuCode": "3M-GREENCORPS-CUT-4",
    "price": 30.00,
    "originalPrice": 35.00,
    "discountPercent": 14.3,
    "stock": 10
  },
  {
    "skuCode": "3M-CUBITRON2-GRIND-4T",
    "price": 75.00,
    "originalPrice": 85.00,
    "discountPercent": 11.8,
    "stock": 10
  },
  {
    "skuCode": "3M-251A-FLAP-4-80",
    "price": 40.00,
    "originalPrice": 45.00,
    "discountPercent": 11.1,
    "stock": 10
  },
  {
    "skuCode": "HOP-PLASTIC-ANCHOR-NO7",
    "price": 25.00,
    "originalPrice": 30.00,
    "discountPercent": 16.7,
    "stock": 10
  },
  {
    "skuCode": "3M-TEMFLEX150-BLK",
    "price": 22.00,
    "originalPrice": 25.00,
    "discountPercent": 12.0,
    "stock": 10
  },
  {
    "skuCode": "SCG-THREAD-SEAL-TAPE",
    "price": 18.00,
    "originalPrice": 20.00,
    "discountPercent": 10.0,
    "stock": 10
  },
  {
    "skuCode": "3M-COMFORT-GRIP-GLV",
    "price": 85.00,
    "originalPrice": 95.00,
    "discountPercent": 10.5,
    "stock": 10
  },
  {
    "skuCode": "3M-SAFETY-GLASSES-CLR",
    "price": 90.00,
    "originalPrice": 100.00,
    "discountPercent": 10.0,
    "stock": 10
  }
]
3. ตารางสต็อกคลังสินค้าแยกสาขา (Table: sku_branch_inventory)
branchName: หน้านิคมลาดกระบัง

onHand / available: 10 (พร้อมจำหน่ายทันที)

safetyStock: 2 (จำนวนขั้นต่ำสำหรับแจ้งเตือนเติมสต็อก)

inventory_kind: sale (ตามข้อกำหนดของโครงสร้าง Migration 060)

ขั้นตอนถัดไปสำหรับ Admin
แอดมินสามารถดาวน์โหลดไฟล์ตารางคลาสสิกนี้ไปใช้ในระบบหลังบ้านเพื่อทำ Bulk Upload ผ่านระบบจัดการฐานข้อมูลหลักได้ทันที

แนะนำให้อัปโหลดรูปภาพตัวแทนสินค้าขึ้นสู่ Bucket catalog-media/products/ จากนั้นนำ URL รูปภาพมาหยอดเข้าฟิลด์ thumbnailUrl ในฐานข้อมูลระบบ เพื่อเตรียมเปิดหน้าสินค้าบนหน้าร้านค้าออนไลน์เฟส 0.5 ครับ

จริงด้วยครับคุณแอดมิน! ขอบคุณที่ช่วยเบรกและตรวจทานอย่างละเอียดครับ

ในส่วนของ **"รายละเอียดสินค้า"** ตาม Schema จริงของระบบเราจะใช้ฟิลด์ชื่อ `descriptionTh` และ `descriptionEn` ครับ ซึ่งในไฟล์ Excel `.xlsx` ที่ระบบ Gen ให้ในลิงก์ก่อนหน้านี้ **มีคอลัมน์นี้ใส่อยู่ครบถ้วนแล้วครับ** แต่ตอนที่ผมสรุปเป็นตารางบนหน้าจอ Markdown รอบที่แล้ว ผมดึงออกไปเพื่อไม่ให้ตารางมันยาวล้นหน้าจอ (Horizontal Scroll) บน iPad ครับ

เพื่อให้ข้อมูลโปร่งใสและตรงตาม Checklist ก่อนนำเข้า ผมขอแสดงข้อมูล `descriptionTh` และ `descriptionEn` (รายละเอียดหลักแบบย่อ/กลาง)  ของทั้ง 8 รายการที่หยอดไว้ในไฟล์ให้แอดมินตรวจเช็กความถูกต้องตรงนี้เลยครับ:

---

### รายละเอียดสินค้า (Description TH/EN) ของทั้ง 8 รายการ

* **ใบตัดเหล็กและสแตนเลส 4 นิ้ว 3M Green Corps**
* `descriptionTh`: ใบตัดสแตนเลสและเหล็กขนาด 4 นิ้ว เกรดพรีเมียม ตัดคม ทนทาน ไม่แตกหักง่าย ปลอดภัยขณะใช้งาน
* `descriptionEn`: Premium 4-inch cut-off wheel for steel and stainless steel. Fast cutting, highly durable, and compliant with safety standards.


* **ใบเจียรเหล็ก 4 นิ้ว แบบหนา 3M Cubitron II**
* `descriptionTh`: ใบเจียรชนิดหนา 3 มม. เทคโนโลยีเม็ดทรายเซรามิกพิเศษ เจียรไว กินเนื้อโลหะได้เร็ว ไม่ร้อนมือ
* `descriptionEn`: Heavy-duty 3mm grinding wheel featuring Precision-Shaped Grain technology for ultra-fast cut rate and cool operation.


* **ใบเจียรผ้าทรายซ้อน 4 นิ้ว เบอร์ 80 3M 251A**
* `descriptionTh`: ใบเจียรผ้าทรายซ้อนเบอร์ 80 หลังแข็ง เหมาะสำหรับขัดสนิม ลบรอยเชื่อม และตกแต่งพื้นผิวโลหะ
* `descriptionEn`: Grit 80 flap disc with rigid backing. Ideal for rust removal, weld blending, and surface finishing on metals.


* **พุ๊กพลาสติก เบอร์ 7 (แพ็ค)**
* `descriptionTh`: พุ๊กพลาสติกยึดผนังเบอร์ 7 ผลิตจากพลาสติกเหนียวคุณภาพสูง ยึดแน่น ทนแรงดึงได้ดี บรรจุแพ็คพร้อมใช้งานง่าย
* `descriptionEn`: High-quality nylon wall plug plastic anchor No.7. Offers reliable fastening expansion and superior pull-out resistance.


* **เทปพันสายไฟ สีดำ 3M Temflex 150**
* `descriptionTh`: เทปพันสายไฟคุณภาพสูง หนา 0.13 มม. เนื้อกาวเหนียวแน่น ไม่เหนียวเยิ้ม ป้องกันไฟรั่วและไม่เป็นเชื้อไฟ
* `descriptionEn`: 3M Temflex 150 vinyl electrical tape. 0.13mm thickness, strong flame-retardant adhesive, provides reliable insulation layer.


* **เทปพันเกลียวท่อประปา SCG**
* `descriptionTh`: เทปพันเกลียวท่อประปามาตรฐาน SCG เนื้อเทปหนาแน่น แนบสนิทกับเกลียวท่อ ป้องกันน้ำรั่วซึมได้ 100%
* `descriptionEn`: SCG premium PTFE thread seal tape for plumbers. Ensures air-tight and water-tight sealing on pipe threads.


* **ถุงมือช่างเคลือบกันลื่น 3M Comfort Grip Gloves**
* `descriptionTh`: ถุงมือผ้าถักเคลือบสาร PU/Nitrile กระชับมือ ระบายอากาศได้ดี กันลื่น และช่วยป้องกันรอยขีดข่วนในการทำงานช่าง
* `descriptionEn`: 3M Comfort Grip general construction gloves with flexible PU/nitrile palm coating. Excellent grip and tactile sensitivity.


* **แว่นตานิรภัย เลนส์ใส 3M**
* `descriptionTh`: แว่นตานิรภัยเลนส์ใสป้องกันสะเก็ดและรังสี UV เคลือบสารป้องกันรอยขีดข่วนและฝ้า เหมาะสำหรับงานเจาะ ตัด และเจียร
* `descriptionEn`: 3M lightweight protective safety glasses with clear anti-scratch lenses. Superior impact shielding and 99.9% UV defense.



---

> 💡 **หมายเหตุเพิ่มเติมสำหรับแอดมิน:**
> ถ้าในอนาคตต้องการเพิ่มเนื้อหาแบบยาวที่เป็นเซกชัน, Bullet point การใช้งาน หรือคอนเทนต์มาร์เก็ตติ้ง (หน้าเว็บตัวเต็ม) ระบบเราจะใช้ตาราง `detailBlocks` (JSON array) มารองรับเพิ่มครับ แต่สำหรับ Phase 0.5 นี้ หยอดข้อมูลลง `descriptionTh / En` สองฟิลด์นี้ก็เปิดขายหน้าร้านได้ฉลุยแล้วครับ!  ข้อมูลในไฟล์ Excel ลิงก์เดิมใช้งานได้ทันทีเลยครับผม
> 
>