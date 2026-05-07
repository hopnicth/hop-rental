# Asset Admin Manual

Last updated: 2026-05-07
Audience: Admin, rental operations, data-entry team, Custom AI assistant

---

## 1. Asset คืออะไร

`assets` คือรายการอุปกรณ์เช่า หรือ rental offering ที่ลูกค้าสามารถจองได้ เช่น ชุดสว่านให้เช่า เครื่องมือวัดให้เช่า หรืออุปกรณ์ความปลอดภัยให้เช่า

Asset แยกจาก Product เพราะ Product คือ catalog หลัก ส่วน Asset คือรายการเช่า/ทรัพย์สิน rental ที่มี code, สถานะ, ราคาเช่า, มัดจำ, stock, service cycle และเอกสารประกอบ

ตัวอย่าง:

| Level   | Example                                      | ใช้ทำอะไร                         |
| ------- | -------------------------------------------- | --------------------------------- |
| Product | Cordless Impact Drill 18V                    | catalog หลัก / SEO / SKU ขาย      |
| SKU     | 18V Body Only                                | ราคาและ stock ขาย                 |
| Asset   | R-DRILL-001 Cordless Impact Drill Rental Set | รายการเช่าจริง มีราคาเช่าและมัดจำ |
| Content | Review: Makita 18V Drill                     | รีวิวที่ link มาหา Asset ได้      |

---

## 2. Asset Required Fields

| API Field         | DB Field            |                           Required | Rule                          |
| ----------------- | ------------------- | ---------------------------------: | ----------------------------- |
| `code`            | `code`              |                      Auto/Required | รหัส Asset ต้อง unique        |
| `slug`            | `slug`              |                      Auto/Required | URL slug ต้อง unique          |
| `nameTh`          | `name_th`           |                                Yes | ชื่อไทย ห้ามว่าง              |
| `nameEn`          | `name_en`           |                                Yes | ชื่ออังกฤษ ห้ามว่าง           |
| `descriptionTh`   | `description_th`    |                                Yes | รายละเอียดไทย ห้ามว่าง        |
| `descriptionEn`   | `description_en`    |                                Yes | รายละเอียดอังกฤษ ห้ามว่าง     |
| `status`          | `status`            |                    Default `draft` | `draft`, `active`, `archived` |
| `brand`           | `brand`             |                        Recommended | แบรนด์                        |
| `mainCategoryKey` | `main_category_key` | Recommended/Required by admin flow | หมวดหลัก                      |
| `tagKeys`         | `tag_keys`          |                           Optional | tag/filter รอง                |
| `searchKeywords`  | `search_keywords`   |                           Optional | คำค้นเสริม                    |

---

## 3. Asset Code & Slug Rules

### Code

ถ้าไม่กรอก `code` ระบบจะสร้างให้โดยประมาณ:

`R-{8 uppercase hex characters}` เช่น `R-A1B2C3D4`

Recommended human-readable code:

- `R-DRILL-001`
- `R-LASER-LEVEL-002`
- `R-SAFETY-HARNESS-001`

Rules:

- ต้อง unique
- ห้ามว่าง
- ควรใช้รหัสที่ทีมคลังเข้าใจง่าย
- อย่าเปลี่ยน code หลังมี booking แล้วถ้าไม่จำเป็น

### Slug

ถ้าไม่กรอก `slug` ระบบสร้างจาก:

1. `nameEn`
2. ถ้าไม่มี/ใช้ไม่ได้ → `nameTh`
3. ถ้ายังไม่ได้ → `asset`
4. เพิ่ม `brand` ถ้ามี
5. ต่อท้าย code tail

Example:

| Input                                                                               | Auto slug                                           |
| ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| `nameEn = Cordless Impact Drill Rental Set`, `brand = Makita`, `code = R-DRILL-001` | `cordless-impact-drill-rental-set-makita-drill-001` |

Slug ต้อง unique ถ้าซ้ำจะเกิด `409 Conflict`

---

## 4. Asset Status & Publish Rules

| Field      | Public condition  |
| ---------- | ----------------- |
| `status`   | ต้องเป็น `active` |
| `isHidden` | ต้องเป็น `false`  |

Status values:

| Value      | ใช้เมื่อ                       |
| ---------- | ------------------------------ |
| `draft`    | ยังเตรียมข้อมูล ยังไม่ publish |
| `active`   | พร้อมแสดงและให้เช่า            |
| `archived` | เลิกใช้/ไม่แสดงแล้ว            |

Recommended:

- ตอนสร้างใหม่ใช้ `draft` และ `isHidden = true`
- ก่อน publish ตรวจราคา รูป stock และ match ให้ครบ
- เมื่อพร้อมค่อยเปลี่ยนเป็น `status = active`, `isHidden = false`

---

## 5. Asset Pricing Rules

Asset มีราคาเช่าและมัดจำ

| API Field       | DB Field          | Rule                                  |
| --------------- | ----------------- | ------------------------------------- |
| `dailyRate`     | `daily_rate`      | ต้อง ≥ 0                              |
| `weeklyRate`    | `weekly_rate`     | ต้อง ≥ 0                              |
| `monthlyRate`   | `monthly_rate`    | ต้อง ≥ 0                              |
| `depositAmount` | `deposit_amount`  | ต้อง ≥ 0                              |
| `currencyCode`  | `currency_code`   | default `THB`, ต้องยาว 3 ตัวอักษร     |
| `minRentalDays` | `min_rental_days` | ต้อง ≥ 1                              |
| `maxRentalDays` | `max_rental_days` | `0` = ไม่จำกัด หรือ ≥ `minRentalDays` |
| `bufferDays`    | `buffer_days`     | ต้อง ≥ 0                              |

Enable flags:

| Field            | ใช้ทำอะไร            |
| ---------------- | -------------------- |
| `dailyEnabled`   | เปิด/ปิดราคา daily   |
| `weeklyEnabled`  | เปิด/ปิดราคา weekly  |
| `monthlyEnabled` | เปิด/ปิดราคา monthly |

Example pricing:

```json
{
  "dailyRate": 250,
  "weeklyRate": 1200,
  "monthlyRate": 4200,
  "depositAmount": 3000,
  "currencyCode": "THB",
  "minRentalDays": 1,
  "maxRentalDays": 0,
  "bufferDays": 1,
  "dailyEnabled": true,
  "weeklyEnabled": true,
  "monthlyEnabled": true
}
```

Validation:

- ห้ามราคาเช่าติดลบ
- ห้าม deposit ติดลบ
- `minRentalDays` ต้องอย่างน้อย 1
- `maxRentalDays` ถ้าไม่ใช่ 0 ต้องมากกว่าหรือเท่ากับ `minRentalDays`

---

## 6. Asset Spec, Detail Blocks, Documents

### Spec Summary

`specSummary` ต้องเป็น JSON object ใช้สำหรับ spec สรุปที่แสดงบนหน้า Asset

Good example:

```json
{
  "voltage": "18V",
  "included": ["tool body", "case", "manual"],
  "weightKg": 1.8,
  "condition": "ready_to_rent"
}
```

Bad example:

```json
["18V", "tool body", "case"]
```

เหตุผล: ต้องเป็น object ไม่ใช่ array

### Detail Blocks

`detailBlocks` เป็น JSON array สำหรับ section รายละเอียดบนหน้า Asset รองรับ title/body หลายภาษา, bullet, images, PDF documents

Block fields:

| Field       | Rule                                     |
| ----------- | ---------------------------------------- |
| `key`       | unique ภายใน asset เช่น `included-items` |
| `title`     | localized object `{ th, en, cn, jp }`    |
| `body`      | localized object `{ th, en, cn, jp }`    |
| `items`     | array ของ bullet points                  |
| `images`    | upload ผ่านระบบเท่านั้น                  |
| `documents` | PDF documents                            |

Example:

```json
[
  {
    "key": "included-items",
    "title": { "th": "อุปกรณ์ในชุด", "en": "Included Items" },
    "body": {
      "th": "ชุดเช่าพร้อมกล่องและอุปกรณ์พื้นฐาน",
      "en": "Rental set with case and basic accessories."
    },
    "items": ["ตัวเครื่อง", "กล่อง", "คู่มือ"]
  }
]
```

Detail block upload rules:

- Image: JPEG/PNG/WebP, max 15MB
- Document: PDF only, max 30MB
- Document kind: `manual`, `catalog`, `datasheet`, `guide`, `report`, `other`
- ต้องมี `blockKey` ตอน upload image/document เข้า block

---

## 7. Asset Media Rules

Asset image upload รองรับ:

| MIME Type         |                Allowed |
| ----------------- | ---------------------: |
| `image/jpeg`      |                    Yes |
| `image/png`       |                    Yes |
| `image/webp`      |                    Yes |
| `image/heic`      |                     No |
| `application/pdf` | No สำหรับ image upload |

Limit:

- Asset main/gallery image: 15MB
- Asset detail block image: 15MB
- Asset detail block PDF: 30MB

ระบบแปลงรูปเป็น WebP variants:

- `thumbnail` 300px
- `card` 800px
- `large` 1600px

Asset fields:

| Field          | ใช้ทำอะไร    |
| -------------- | ------------ |
| `thumbnailUrl` | รูปปกหลัก    |
| `imageUrls`    | gallery URLs |

Upload target:

- `target = thumbnail` เพื่อ set รูปปก
- `target = gallery` เพื่อเพิ่มรูปใน gallery
- `setAsCover = true` เพื่อให้รูป gallery เป็น cover ด้วย

---

## 8. Asset Stock / Inventory Rules

Asset stock แยกตามสาขาและ inventory

| Field         | Rule                                      |
| ------------- | ----------------------------------------- |
| `inventoryId` | ต้องมี                                    |
| `branchId`    | resolve จาก inventory/branch              |
| `branchName`  | ต้องมี                                    |
| `onHand`      | จำนวนทั้งหมด ต้อง ≥ 0                     |
| `available`   | พร้อมให้เช่า ต้อง ≥ 0 และไม่เกิน `onHand` |
| `reserved`    | ถูกจอง ต้อง ≥ 0 และไม่เกิน `onHand`       |
| `incoming`    | กำลังเข้า stock ต้อง ≥ 0                  |
| `safetyStock` | stock กันชน ต้อง ≥ 0                      |
| `notes`       | internal stock note                       |

Validation:

- `available <= onHand`
- `reserved <= onHand`
- `available + reserved <= onHand`

Example:

```json
{
  "inventoryId": "rent-bkk-main",
  "onHand": 3,
  "available": 2,
  "reserved": 1,
  "incoming": 0,
  "safetyStock": 0,
  "notes": "1 unit reserved for booking this week"
}
```

---

## 9. Maintenance / Service Cycle

Asset มี field สำหรับรอบ service

| Field               | Rule                           |
| ------------------- | ------------------------------ |
| `serviceCycleValue` | ต้อง ≥ 0                       |
| `serviceCycleUnit`  | `day`, `week`, `month`, `year` |
| `lastServicedAt`    | `YYYY-MM-DD`                   |
| `nextServiceDueAt`  | `YYYY-MM-DD`                   |

Rules:

- ถ้า `serviceCycleValue = 0` → `serviceCycleUnit` ควรเป็น null/ว่าง
- ถ้า `serviceCycleValue > 0` → ต้องมี `serviceCycleUnit`
- date ต้องเป็นรูปแบบ `YYYY-MM-DD`

Example:

```json
{
  "serviceCycleValue": 3,
  "serviceCycleUnit": "month",
  "lastServicedAt": "2026-05-01",
  "nextServiceDueAt": "2026-08-01"
}
```

---

## 10. Asset Tags & Search Keywords

### ความต่างของ Category, Tag, Search Keyword

| Field             | ใช้ทำอะไร         | ตัวอย่าง                                    |
| ----------------- | ----------------- | ------------------------------------------- |
| `mainCategoryKey` | หมวดหลัก          | `mechanic_tools`                            |
| `tagKeys`         | filter/tag รอง    | `rental_tools`, `cordless`, `drill`         |
| `searchKeywords`  | คำค้นเสริม/คำพ้อง | `เช่าสว่าน`, `สว่านให้เช่า`, `rental drill` |

### Tag Rules

- ใช้ key สั้น ๆ และคงที่
- อย่าซ้ำกับ `mainCategoryKey`
- อย่าซ้ำ brand/code/name
- อย่าใส่คำค้นยาวใน tag
- อย่าใส่ tag ซ้ำกันเอง

Good asset tags:

```json
["rental_tools", "cordless", "drill", "18v"]
```

Bad asset tags:

```json
["mechanic_tools", "Makita", "R-DRILL-001", "เช่าสว่านกระแทกไร้สาย Makita 18V"]
```

เหตุผลที่ไม่ดี:

- `mechanic_tools` ซ้ำกับ main category
- `Makita` ซ้ำ brand
- `R-DRILL-001` ซ้ำ code
- ประโยคยาวควรอยู่ใน search keyword หรือ description ไม่ใช่ tag

### Search Keyword Rules

ใช้คำที่ลูกค้าอาจค้นหา แต่ไม่ได้มีใน name/brand/category/tag/code แล้ว

Good search keywords:

```json
[
  "เช่าสว่าน",
  "สว่านให้เช่า",
  "เช่าสว่านไร้สาย",
  "rental drill",
  "cordless drill rental"
]
```

Bad search keywords:

```json
[
  "Makita",
  "R-DRILL-001",
  "mechanic_tools",
  "rental_tools",
  "Cordless Impact Drill Rental Set"
]
```

เหตุผลที่ไม่ดี:

- ซ้ำกับ brand/code/category/tag/name
- ไม่เพิ่ม recall จริง

### Asset Tag/Search Checklist

- [ ] `mainCategoryKey` ถูกต้อง
- [ ] `tagKeys` ไม่ซ้ำกัน
- [ ] `tagKeys` ไม่ซ้ำกับ `mainCategoryKey`
- [ ] `tagKeys` ไม่ซ้ำกับ brand/code/name
- [ ] `searchKeywords` เป็นคำค้นเสริมจริง
- [ ] `searchKeywords` ไม่ซ้ำกับ name, brand, code, slug, category, tag

---

## 11. Notes Usage for Asset

Asset มีหลาย field ที่เกี่ยวกับ note ต้องใช้ให้ถูก context

| Context               | Field                 |        Public? | ใช้สำหรับ                             |
| --------------------- | --------------------- | -------------: | ------------------------------------- |
| Asset storage         | `storageLocationNote` | Admin/internal | รายละเอียดที่เก็บ เช่น ชั้น/โซน       |
| Asset stock           | `notes`               |       Internal | หมายเหตุ stock/branch                 |
| Asset ↔ Product match | `note`                | Internal/admin | เหตุผลที่ link กับ Product            |
| Asset description     | `descriptionTh/En`    |         Public | รายละเอียดที่ลูกค้าเห็น               |
| Detail block body     | `detailBlocks.body`   |         Public | ข้อมูลการใช้งาน/เงื่อนไขที่ลูกค้าเห็น |

Good notes:

- `storageLocationNote`: `อยู่ชั้น B2 โซนเครื่องมือไฟฟ้า กล่องหมายเลข D-14`
- `stock.notes`: `1 unit รอซ่อม ไม่ควรนับเป็น available`
- `asset_matches.note`: `ใช้เป็น rental set หลักของ Product Makita 18V`

Bad public description:

- `ลูกค้าคนก่อนทำตก มีรอยเยอะ แต่ยังใช้ได้`
- `ต้นทุนสูง ห้ามลดราคา`

เหตุผล: เป็นข้อมูลภายในหรือ sensitive ไม่ควรแสดง public

---

## 12. Link Asset กับ Product

ใช้ `asset_matches` เพื่อเชื่อม Asset เข้ากับ Product

Fields:

| Field       | Rule                         | Example                                |
| ----------- | ---------------------------- | -------------------------------------- |
| `productId` | Product ที่เกี่ยวข้อง ต้องมี | `prod-abc123`                          |
| `matchType` | label ความสัมพันธ์           | `primary`, `compatible`, `replacement` |
| `sortOrder` | ตัวเลข ≥ 0                   | `0`                                    |
| `note`      | optional internal note       | `Rental set หลักสำหรับ product นี้`    |

Rules:

- ห้าม duplicate `asset_id + product_id`
- ถ้าซ้ำจะเกิด `409 Conflict`
- ถ้า Product ไม่มีจริงจะเกิด `404`
- `matchType` เป็น free-form แต่ควรใช้คำมาตรฐาน

Recommended match types:

| matchType     | ใช้เมื่อ                 |
| ------------- | ------------------------ |
| `primary`     | Asset หลักที่ควรแสดงก่อน |
| `compatible`  | ใช้ร่วมกับ Product ได้   |
| `replacement` | ใช้แทนกันได้             |
| `accessory`   | เป็นอุปกรณ์เสริม         |

Example:

```json
{
  "productId": "prod-makita-drill-18v",
  "matchType": "primary",
  "sortOrder": 0,
  "note": "Rental set หลักสำหรับ Product สว่าน Makita 18V"
}
```

---

## 13. Link Asset กับ Content

Content ที่ link กับ Asset โดยตรงคือ Content Page type `review`

เมื่อสร้าง Content Page:

- `contentType = review`
- ใส่ Asset ใน `linkedAssetIds`
- ถ้ารีวิวพูดถึง Product ด้วย ให้ใส่ `linkedProductIds`

Rules:

- `linkedAssetIds` ใช้ได้เฉพาะ `review`
- ถ้า content type เป็น `blog`, `service`, `promotion` ระบบจะ ignore linked ids
- Review ที่ link กับ Asset สามารถนำไปแสดงบนหน้า Asset detail ได้

Example:

```json
{
  "contentType": "review",
  "slug": "cordless-impact-drill-rental-review",
  "titleTh": "รีวิวชุดสว่านไร้สายให้เช่า",
  "titleEn": "Cordless Impact Drill Rental Review",
  "excerptTh": "ทดสอบการใช้งานจริงก่อนเช่า",
  "excerptEn": "Practical review before renting.",
  "linkedAssetIds": ["asset-uuid"],
  "linkedProductIds": ["prod-abc123"]
}
```

### Homepage Featured Asset

Asset สามารถขึ้นหน้า Home ผ่าน `home_featured_assets`

Fields:

- `assetId`
- `sortOrder`
- `isActive`

Rules:

- ควรใช้เฉพาะ Asset ที่ `status = active` และ `isHidden = false`
- ตรวจ thumbnail, price, description, stock ก่อน featured

---

## 14. Asset Complete Example

```json
{
  "code": "R-DRILL-001",
  "nameTh": "ชุดสว่านกระแทกไร้สายให้เช่า",
  "nameEn": "Cordless Impact Drill Rental Set",
  "descriptionTh": "ชุดสว่านกระแทกไร้สายสำหรับเช่า พร้อมกล่องและอุปกรณ์พื้นฐาน เหมาะกับงานช่างทั่วไป",
  "descriptionEn": "Cordless impact drill rental set with case and basic accessories, suitable for general workshop use.",
  "brand": "Makita",
  "status": "draft",
  "isHidden": true,
  "mainCategoryKey": "mechanic_tools",
  "tagKeys": ["rental_tools", "cordless", "drill", "18v"],
  "searchKeywords": [
    "เช่าสว่าน",
    "สว่านให้เช่า",
    "เช่าสว่านไร้สาย",
    "rental drill"
  ],
  "dailyRate": 250,
  "weeklyRate": 1200,
  "monthlyRate": 4200,
  "depositAmount": 3000,
  "currencyCode": "THB",
  "minRentalDays": 1,
  "maxRentalDays": 0,
  "bufferDays": 1,
  "storageLocationCode": "BKK-B2-D14",
  "storageLocationNote": "ชั้น B2 โซนเครื่องมือไฟฟ้า กล่อง D-14",
  "specSummary": {
    "voltage": "18V",
    "included": ["tool body", "case", "manual"],
    "condition": "ready_to_rent"
  },
  "serviceCycleValue": 3,
  "serviceCycleUnit": "month",
  "lastServicedAt": "2026-05-01",
  "nextServiceDueAt": "2026-08-01"
}
```

---

## 15. Asset Pre-Publish Checklist

- [ ] `code` ถูกต้องและ unique
- [ ] `slug` ถูกต้องและ unique
- [ ] `nameTh/nameEn` ครบและแปลตรงกัน
- [ ] `descriptionTh/descriptionEn` ครบและเหมาะสำหรับ public
- [ ] `brand` ถูกต้อง
- [ ] `mainCategoryKey` ถูกต้อง
- [ ] `tagKeys` ไม่ซ้ำ category/brand/code/name
- [ ] `searchKeywords` เป็นคำค้นเสริมจริง
- [ ] ราคา daily/weekly/monthly/deposit ไม่ติดลบ
- [ ] `minRentalDays >= 1`
- [ ] `maxRentalDays = 0` หรือ `>= minRentalDays`
- [ ] มี thumbnail/gallery ที่ถูกต้อง
- [ ] media เป็น JPEG/PNG/WebP และไม่เกิน 15MB
- [ ] detail block documents เป็น PDF และไม่เกิน 30MB
- [ ] stock/inventory ไม่ผิด constraint
- [ ] service cycle ถูกต้อง
- [ ] ถ้าต้องแสดงใน Product detail ให้สร้าง `asset_matches`
- [ ] ถ้ามี review ให้สร้าง Content Page type `review` และ link asset
- [ ] ก่อน publish ให้ตั้ง `status = active` และ `isHidden = false`
