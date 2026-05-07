# Product Admin Manual

Last updated: 2026-05-07
Audience: Admin, data-entry team, Custom AI assistant

---

## 1. Product คืออะไร

`products` คือข้อมูลสินค้าหลักใน Catalog เช่น เครื่องมือช่าง อุปกรณ์ความปลอดภัย หรือสินค้าที่ขาย/เช่าได้

Product ไม่ใช่ตัวเลือกย่อย ตัวเลือกย่อยต้องอยู่ใน `product_skus`

ตัวอย่างโครงสร้างที่ถูกต้อง:

| Level   | Example                                           | ใช้ทำอะไร                                                    |
| ------- | ------------------------------------------------- | ------------------------------------------------------------ |
| Product | สว่านกระแทกไร้สาย 18V / Cordless Impact Drill 18V | หน้าสินค้าหลัก, SEO, gallery, specs, category                |
| SKU     | ตัวเครื่องเปล่า 18V / 18V Body Only               | ราคา, stock, SKU code, variant attributes                    |
| Asset   | R-DRILL-001 Rental Drill Set                      | รายการเช่าหรืออุปกรณ์เช่าจริง                                |
| Content | รีวิวสว่าน Makita 18V                             | Blog/review/service/promotion content ที่ link มาหาสินค้าได้ |

---

## 2. Product Required Fields

เมื่อสร้าง Product ใหม่ ต้องตรวจ field เหล่านี้เสมอ

| API Field         | DB Field            |      Required | Rule                               |
| ----------------- | ------------------- | ------------: | ---------------------------------- |
| `nameTh`          | `name_th`           |           Yes | ชื่อไทย ห้ามว่าง                   |
| `nameEn`          | `name_en`           |           Yes | ชื่ออังกฤษ ห้ามว่าง                |
| `descriptionTh`   | `description_th`    |           Yes | รายละเอียดไทย ห้ามว่าง             |
| `descriptionEn`   | `description_en`    |           Yes | รายละเอียดอังกฤษ ห้ามว่าง          |
| `type`            | `type`              |           Yes | `sale`, `rental`, หรือ `hybrid`    |
| `mainCategoryKey` | `main_category_key` |           Yes | หมวดหลัก ต้องมี                    |
| `slug`            | `slug`              | Auto/Required | ถ้าไม่กรอก ระบบสร้างให้            |
| `brand`           | `brand`             |   Recommended | แนะนำให้กรอกเพื่อ search/slug      |
| `shippingSize`    | `shipping_size`     |      Optional | `free`, `s`, `m`, `l`, `xl`        |
| `isHidden`        | `is_hidden`         |      Optional | Product ใหม่มักซ่อนก่อนจนข้อมูลครบ |

### Product Type

| Value    | Meaning      | ใช้เมื่อ                         |
| -------- | ------------ | -------------------------------- |
| `sale`   | ขายเท่านั้น  | มี SKU ราคา/stock สำหรับขาย      |
| `rental` | เช่าเท่านั้น | ใช้คู่กับ Asset หรือ rental flow |
| `hybrid` | ขายและเช่า   | มี SKU ขาย และมี Asset ให้เช่า   |

---

## 3. Product Slug Rules

ถ้าไม่ส่ง `slug` ระบบสร้างโดยประมาณจาก:

1. `nameEn`
2. ถ้าไม่มี/ใช้ไม่ได้ → `nameTh`
3. ถ้ายังไม่ได้ → `product`
4. เพิ่ม `brand` ถ้ามี
5. ต่อท้าย short id ของ Product

Example:

| Input                                                  | Auto slug                                    |
| ------------------------------------------------------ | -------------------------------------------- |
| `nameEn = Cordless Impact Drill 18V`, `brand = Makita` | `cordless-impact-drill-18v-makita-{shortId}` |

Rules:

- ใช้ lowercase English, number, hyphen เท่านั้น
- Slug ต้อง unique
- ถ้าซ้ำจะเกิด `409 Conflict`
- อย่าเปลี่ยน slug หลัง publish ถ้าไม่จำเป็น เพราะกระทบ URL/SEO

---

## 4. SKU Admin Manual

SKU คือรายการที่ซื้อ/เช่าได้จริง Product หนึ่งควรมี SKU อย่างน้อย 1 รายการ แม้ไม่มี variant

### Required SKU Fields

| API Field      | DB Field        |      Required | Rule               |
| -------------- | --------------- | ------------: | ------------------ |
| `labelTh`      | `label_th`      |           Yes | ชื่อ SKU ไทย       |
| `labelEn`      | `label_en`      |           Yes | ชื่อ SKU อังกฤษ    |
| `skuCode`      | `sku_code`      |           Yes | รหัส SKU ห้ามว่าง  |
| `price`        | `price`         |           Yes | ต้อง ≥ 0           |
| `currencyCode` | `currency_code` | Default `THB` | ต้องยาว 3 ตัวอักษร |
| `stock`        | `stock`         |   Default `0` | ต้อง ≥ 0           |
| `attributes`   | `attributes`    |      Optional | JSON object        |
| `pricingTiers` | `pricing_tiers` |      Optional | JSON array         |

### SKU Pricing Rules

| Field             | Rule                                 | Example                     |
| ----------------- | ------------------------------------ | --------------------------- |
| `price`           | ราคาปัจจุบัน ต้องไม่ติดลบ            | `3490`                      |
| `originalPrice`   | ถ้ามี ต้องมากกว่าหรือเท่ากับ `price` | `3990`                      |
| `discountPercent` | 0–100                                | `13`                        |
| `currencyCode`    | ใช้ `THB` เป็น default               | `THB`                       |
| `promoStartAt`    | ต้องเป็น datetime ที่ถูกต้อง         | `2026-05-01T00:00:00+07:00` |
| `promoEndAt`      | ต้องไม่ก่อน `promoStartAt`           | `2026-05-31T23:59:59+07:00` |

### SKU Feature / Attributes

ใช้ `attributes` เพื่อเก็บ feature ที่ต่างกันในแต่ละ SKU เช่น สี ขนาด รุ่น แรงดัน แพ็กสินค้า

Good example:

```json
{
  "voltage": "18V",
  "batteryIncluded": false,
  "package": "body_only",
  "color": "blue"
}
```

Bad example:

```json
{
  "description": "สินค้าดีมาก ราคาถูก ส่งไว"
}
```

เหตุผล: `attributes` ควรเป็น structured spec ไม่ใช่ข้อความขายของ

### Pricing Tiers

`pricingTiers` ต้องเป็น JSON array ใช้เมื่ออยากเก็บ tier ราคา เช่น bulk price หรือ campaign-specific tiers

Example:

```json
[
  { "minQty": 1, "price": 3490, "label": "standard" },
  { "minQty": 5, "price": 3290, "label": "bulk_5_plus" }
]
```

Rules:

- ต้องเป็น array เท่านั้น
- ตัวเลขต้องไม่ติดลบ
- อย่าใช้แทน `price` หลัก ถ้าไม่มี logic รองรับใน storefront
- ถ้าไม่แน่ใจ ให้ปล่อยเป็น `[]`

---

## 5. Product Features, Spec, Detail Blocks

Product มีหลายที่สำหรับใส่รายละเอียด อย่าใช้ผิดที่

| Field              | Type        | ใช้สำหรับ                                                | Public? |
| ------------------ | ----------- | -------------------------------------------------------- | ------- |
| `descriptionTh/En` | text        | รายละเอียดหลักแบบย่อ/กลาง                                | Yes     |
| `spec`             | JSON object | spec เชิงโครงสร้าง เช่น voltage, weight, warranty        | Yes     |
| `detailBlocks`     | JSON array  | เนื้อหายาว, section เพิ่มเติม, bullet, marketing content | Yes     |
| `mediaGallery`     | JSON array  | รูปสินค้า                                                | Yes     |
| `mediaLinks`       | JSON array  | YouTube/external video                                   | Yes     |
| `documents`        | JSON array  | manual/catalog/datasheet/guide links                     | Yes     |

### Spec Example

```json
{
  "voltage": "18V",
  "maxTorqueNm": 155,
  "chuckSize": "1/4 inch hex",
  "weightKg": 1.4,
  "warranty": "6 months"
}
```

### Detail Blocks Example

```json
[
  {
    "key": "included-items",
    "title": { "th": "อุปกรณ์ในชุด", "en": "Included Items" },
    "body": {
      "th": "เหมาะสำหรับงานช่างทั่วไป",
      "en": "Suitable for general workshop use."
    },
    "items": ["ตัวเครื่อง", "คู่มือ", "กล่องเก็บ"]
  }
]
```

### Media Links Example

```json
[
  {
    "id": "youtube-demo-1",
    "kind": "youtube",
    "title": "Product Demo",
    "url": "https://www.youtube.com/watch?v=xxxx"
  }
]
```

### Documents Example

```json
[
  {
    "id": "manual-th",
    "kind": "manual",
    "title": "คู่มือการใช้งาน",
    "url": "https://example.com/manual.pdf"
  }
]
```

Document kinds ที่แนะนำ: `manual`, `catalog`, `datasheet`, `guide`, `other`

---

## 6. Product Media Upload Rules

Product/SKU image upload รองรับ:

| MIME Type         |                    Allowed |
| ----------------- | -------------------------: |
| `image/jpeg`      |                        Yes |
| `image/png`       |                        Yes |
| `image/webp`      |                        Yes |
| `image/heic`      |                         No |
| `image/svg+xml`   | No สำหรับ Product/SKU ปกติ |
| `application/pdf` |     No สำหรับ image upload |

Limit:

- Product image: 15MB ต่อไฟล์
- SKU image: 15MB ต่อไฟล์

ระบบจะแปลงเป็น WebP variants:

- `thumbnail` 300px
- `card` 800px
- `large` 1600px

SKU media rule:

- ถ้า SKU ไม่มีรูป ให้ใช้รูป Product (`useProductImages = true`)
- ถ้า SKU มีรูปเฉพาะ variant ให้ตั้ง `useProductImages = false`

---

## 7. Product Tags & Search Keywords

### ความต่างของ Category, Tag, Search Keyword

| Field             | ใช้ทำอะไร         | ตัวอย่าง                                  |
| ----------------- | ----------------- | ----------------------------------------- |
| `mainCategoryKey` | หมวดหลัก 1 ค่า    | `mechanic_tools`                          |
| `tagKeys`         | filter/tag รอง    | `cordless`, `drill`, `power_tools`        |
| `searchKeywords`  | คำค้นเสริม/คำพ้อง | `สว่านแบต`, `สว่านไร้สาย`, `impact drill` |

### Tag Rules

- ใช้ lowercase snake_case หรือคำอังกฤษสั้น ๆ ที่คงที่
- อย่าซ้ำกับ `mainCategoryKey`
- อย่าซ้ำกันเอง
- อย่าใช้ประโยคยาว
- อย่าใส่ brand เป็น tag ถ้ามี field `brand` แล้ว
- อย่าใส่ชื่อ product ซ้ำใน tag

Good tags:

```json
["cordless", "drill", "power_tools", "18v"]
```

Bad tags:

```json
["mechanic_tools", "Makita", "Cordless Impact Drill 18V", "เครื่องมือช่าง"]
```

เหตุผลที่ไม่ดี:

- `mechanic_tools` ซ้ำกับ main category
- `Makita` ซ้ำกับ brand
- ชื่อเต็มสินค้าควรอยู่ใน name ไม่ใช่ tag
- tag ไทย/อังกฤษผสมแบบไม่เป็น key จะดูแลยาก

### Search Keyword Rules

ใช้ `searchKeywords` สำหรับคำที่ลูกค้าอาจพิมพ์ แต่ไม่ได้อยู่ใน name/brand/category/tag

Good search keywords:

```json
["สว่านแบต", "สว่านไร้สาย", "สว่าน 18 โวลต์", "impact drill", "cordless drill"]
```

Bad search keywords:

```json
["Makita", "Cordless Impact Drill 18V", "mechanic_tools", "drill"]
```

เหตุผลที่ไม่ดี:

- `Makita` มีใน brand แล้ว
- ชื่อเต็มมีใน `nameEn` แล้ว
- `mechanic_tools` มีใน category แล้ว
- `drill` มีใน tag แล้ว

### Tag/Search Keyword Checklist

ก่อน save ให้ตรวจ:

- `mainCategoryKey` มีค่าเดียวและถูกต้อง
- `tagKeys` ไม่มีค่าซ้ำ
- `tagKeys` ไม่ซ้ำกับ `mainCategoryKey`
- `searchKeywords` ไม่ซ้ำกับ name, brand, slug, category, tag
- keyword เป็นคำที่ลูกค้าค้นหาจริง

---

## 8. Notes Usage

Product core ไม่มี field `note` สำหรับ internal note โดยตรงใน payload หลัก

ให้ใช้ note ให้ถูกที่:

| Context                    | Field              | ใช้สำหรับ                            |
| -------------------------- | ------------------ | ------------------------------------ |
| SKU branch inventory       | `notes`            | note stock/สาขา เช่น “รอตรวจนับจริง” |
| Asset match                | `note`             | note ความสัมพันธ์ Asset ↔ Product    |
| Inventory                  | `notes`            | note คลัง/branch                     |
| Product public description | `descriptionTh/En` | ข้อมูลที่ลูกค้าเห็นเท่านั้น          |

Good inventory note:

`Stock รอตรวจนับจริงหลังรับของล็อตใหม่ วันที่ 2026-05-10`

Bad public description note:

`ตัวนี้ต้นทุนสูง ห้ามลดราคา`

เหตุผล: เป็นข้อมูลภายใน ไม่ควรอยู่ใน field ที่แสดง public

---

## 9. Link Product กับ Asset

Product ไม่ได้ถือ asset list โดยตรง การเชื่อม Product ↔ Asset ใช้ `asset_matches`

สร้าง link ได้จาก Asset Admin ผ่าน endpoint/flow ของ Asset matches

Fields:

| Field       | Rule                   | Example                                |
| ----------- | ---------------------- | -------------------------------------- |
| `assetId`   | Asset ที่ต้องการ link  | `uuid`                                 |
| `productId` | Product ที่เกี่ยวข้อง  | `prod-xxxx`                            |
| `matchType` | free-form label        | `compatible`, `primary`, `replacement` |
| `sortOrder` | ตัวเลข ≥ 0             | `0`                                    |
| `note`      | optional internal note | `ใช้กับชุดเช่า Makita 18V`             |

Rules:

- ห้าม duplicate คู่ `asset_id + product_id`
- ถ้าซ้ำจะเกิด `409 Conflict`
- ถ้า product/asset ไม่มีจริง อาจเกิด `404`
- `note` ควรเป็น note ภายใน ไม่ใช่ข้อความขายของ

Good match examples:

| matchType     | ใช้เมื่อ                     | note example                         |
| ------------- | ---------------------------- | ------------------------------------ |
| `primary`     | Asset หลักของ Product rental | `Rental set หลักสำหรับหน้าสินค้านี้` |
| `compatible`  | ใช้ร่วมกันได้                | `ใช้ร่วมกับแบต 18V series เดียวกัน`  |
| `replacement` | อุปกรณ์ทดแทน                 | `ใช้แทนรุ่นเก่าเมื่อ stock หมด`      |

---

## 10. Link Product กับ Content

Content ที่ link กับ Product โดยตรงในระบบคือ Content Page type `review`

### Review Content Link

เมื่อสร้าง/แก้ Content Page:

- `contentType = review`
- ใช้ `linkedProductIds` เพื่อเลือก Product ที่รีวิวนี้เกี่ยวข้อง
- ใช้ `linkedAssetIds` เพื่อเลือก Asset ที่รีวิวนี้เกี่ยวข้อง

Rules:

- Link Product/Asset ใช้ได้กับ `review` เท่านั้น
- ถ้า content type เป็น `blog`, `service`, `promotion` ระบบจะ ignore linked ids
- Review ที่ link แล้วสามารถนำไปแสดงบนหน้ารายละเอียด Product/Asset ได้

Example review payload fields:

```json
{
  "contentType": "review",
  "slug": "makita-18v-impact-drill-review",
  "titleTh": "รีวิวสว่านกระแทก Makita 18V",
  "titleEn": "Makita 18V Impact Drill Review",
  "excerptTh": "สรุปจุดเด่นและข้อควรรู้ก่อนเช่าหรือซื้อ",
  "excerptEn": "Key pros and considerations before renting or buying.",
  "linkedProductIds": ["prod-abc123"],
  "linkedAssetIds": ["asset-uuid"]
}
```

### Homepage Featured Product

Product ยังสามารถถูกนำไปขึ้นหน้า Home ได้ผ่าน `home_featured_products`

Fields:

- `productId`
- `sortOrder`
- `isActive`

Rules:

- Product ที่ `isHidden = true` อาจไม่ควรนำขึ้น featured
- ตรวจ slug/name/media ก่อนนำขึ้น Home
- Featured rail มี limit ในระบบ ควรคัดเฉพาะรายการสำคัญ

---

## 11. Product Admin Complete Example

### Product

```json
{
  "nameTh": "สว่านกระแทกไร้สาย 18V",
  "nameEn": "Cordless Impact Drill 18V",
  "descriptionTh": "สว่านกระแทกไร้สายสำหรับงานเจาะและขันสกรู เหมาะกับงานช่างทั่วไปและงานไซต์",
  "descriptionEn": "18V cordless impact drill for drilling and screw-driving, suitable for workshop and site work.",
  "type": "hybrid",
  "brand": "Makita",
  "mainCategoryKey": "mechanic_tools",
  "tagKeys": ["cordless", "drill", "power_tools", "18v"],
  "searchKeywords": [
    "สว่านแบต",
    "สว่านไร้สาย",
    "สว่าน 18 โวลต์",
    "impact drill"
  ],
  "shippingSize": "m",
  "isHidden": true,
  "spec": {
    "voltage": "18V",
    "maxTorqueNm": 155,
    "weightKg": 1.4
  }
}
```

### SKU

```json
{
  "labelTh": "ตัวเครื่องเปล่า 18V",
  "labelEn": "18V Body Only",
  "skuCode": "MAK-DTD156Z-BODY",
  "price": 3490,
  "originalPrice": 3990,
  "discountPercent": 13,
  "currencyCode": "THB",
  "stock": 10,
  "attributes": {
    "voltage": "18V",
    "batteryIncluded": false,
    "package": "body_only"
  },
  "pricingTiers": []
}
```

### SKU Inventory

```json
{
  "inventoryId": "inv-bkk-main",
  "branchId": "bkk-main",
  "branchName": "Bangkok Main Hub",
  "onHand": 10,
  "available": 8,
  "reserved": 1,
  "incoming": 0,
  "safetyStock": 1,
  "notes": "ตรวจนับแล้ว 2026-05-06"
}
```

---

## 12. Product Pre-Publish Checklist

- [ ] `nameTh/nameEn` ครบและแปลตรงกัน
- [ ] `descriptionTh/descriptionEn` ครบและไม่ใช่ internal note
- [ ] `type` ถูกต้อง
- [ ] `mainCategoryKey` ถูกต้อง
- [ ] `tagKeys` ไม่ซ้ำ category/brand/name
- [ ] `searchKeywords` เป็นคำค้นเสริมจริง ไม่ซ้ำ field อื่น
- [ ] `brand` ถูกต้อง
- [ ] slug unique และอ่านง่าย
- [ ] มี SKU อย่างน้อย 1 รายการ
- [ ] SKU มี `skuCode`, `labelTh`, `labelEn`, `price`
- [ ] ราคา/discount ถูกต้อง
- [ ] stock/inventory ไม่ผิด constraint
- [ ] media เป็น JPEG/PNG/WebP และไม่เกิน 15MB
- [ ] ถ้าเป็น rental/hybrid มี Asset match ที่เกี่ยวข้อง
- [ ] ถ้ามี review content ให้ link ผ่าน Content Page type `review`
- [ ] ก่อน public ให้ตั้ง `isHidden = false`
