-- ============================================================
-- 095_seed_sale_products_set1.sql
--
-- Seed: ของขายขาด Set 1 — 8 รายการสินค้าขายขาด
-- สาขา: หน้านิคมลาดกระบัง (store-nikhom-lkb)
--
-- Images uploaded to: catalog-media/products/
--   3m-greencorps-cut-4.png       → prod-020
--   3m-cubitron2-grind-4t.png     → prod-021
--   3m-251a-flap-4-80.png         → prod-022
--   plastic-anchor-no7.png        → prod-023
--   3m-temflex150-blk.png         → prod-024
--   scg-thread-seal-tape.png      → prod-025
--   3m-comfort-grip-glv.png       → prod-026
--   3m-safety-glasses-clr.png     → prod-027
--
-- ⚠️ หลัง upload รูปขึ้น Storage ให้ UPDATE media_gallery แต่ละ product
-- ⚠️ ไฟล์ 4.png, 8.png, 11.png, 12.png ยังไม่มีข้อมูลสินค้า รอ Admin ยืนยัน
-- ============================================================

-- ── 1. Branch: หน้านิคมลาดกระบัง ──────────────────────────────

INSERT INTO public.store_branches (id, code, name_th, name_en, is_active, sort_order)
VALUES ('store-nikhom-lkb', 'NLKB', 'หน้านิคมลาดกระบัง', 'Nikhom Lat Krabang', TRUE, 30)
ON CONFLICT (id) DO UPDATE
  SET code       = EXCLUDED.code,
      name_th    = EXCLUDED.name_th,
      name_en    = EXCLUDED.name_en,
      is_active  = EXCLUDED.is_active,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();

-- ── 2. Products ────────────────────────────────────────────────

INSERT INTO public.products (
  id, slug, type,
  name_th, name_en,
  description_th, description_en,
  main_category_key, category_keys, tag_keys, search_keywords,
  brand, is_hidden
) VALUES
  (
    'prod-020', '3m-greencorps-cut-off-wheel-4in', 'sale',
    'ใบตัดเหล็กและสแตนเลส 4 นิ้ว 3M Green Corps',
    '3M Green Corps Cut Off Wheel 4-Inch',
    'ใบตัดสแตนเลสและเหล็กขนาด 4 นิ้ว เกรดพรีเมียม ตัดคม ทนทาน ไม่แตกหักง่าย ปลอดภัยขณะใช้งาน',
    'Premium 4-inch cut-off wheel for steel and stainless steel. Fast cutting, highly durable, and compliant with safety standards.',
    'construction_consumables',
    ARRAY['construction_consumables'],
    ARRAY['cutting_disc', 'steel_cutting', 'abrasives'],
    ARRAY['ใบตัด3M', 'ใบตัดเขียว', 'หินตัด', 'แผ่นตัด4นิ้ว'],
    '3M', FALSE
  ),
  (
    'prod-021', '3m-cubitron2-grinding-disc-4in-thick', 'sale',
    'ใบเจียรเหล็ก 4 นิ้ว แบบหนา 3M Cubitron II',
    '3M Cubitron II Grinding Disc 4-Inch Thick',
    'ใบเจียรชนิดหนา 3 มม. เทคโนโลยีเม็ดทรายเซรามิกพิเศษ เจียรไว กินเนื้อโลหะได้เร็ว ไม่ร้อนมือ',
    'Heavy-duty 3mm grinding wheel featuring Precision-Shaped Grain technology for ultra-fast cut rate and cool operation.',
    'construction_consumables',
    ARRAY['construction_consumables'],
    ARRAY['grinding_disc', 'thick_grinding', 'abrasives'],
    ARRAY['ใบเจียรหนา', 'ใบเจียร3M', 'คิวบิตรอน'],
    '3M', FALSE
  ),
  (
    'prod-022', '3m-251a-flap-disc-4in-grit-80', 'sale',
    'ใบเจียรผ้าทรายซ้อน 4 นิ้ว เบอร์ 80 3M 251A',
    '3M 251A Flap Disc 4-Inch Grit 80',
    'ใบเจียรผ้าทรายซ้อนเบอร์ 80 หลังแข็ง เหมาะสำหรับขัดสนิม ลบรอยเชื่อม และตกแต่งพื้นผิวโลหะ',
    'Grit 80 flap disc with rigid backing. Ideal for rust removal, weld blending, and surface finishing on metals.',
    'construction_consumables',
    ARRAY['construction_consumables'],
    ARRAY['flap_disc', 'sanding_disc', 'grit_80'],
    ARRAY['จานผ้าทราย', 'ผ้าทรายซ้อน', 'ใบขัดกระดาษทราย'],
    '3M', FALSE
  ),
  (
    'prod-023', 'plastic-anchor-no7-pack', 'sale',
    'พุ๊กพลาสติก เบอร์ 7 (แพ็ค)',
    'Plastic Anchor No.7 (Pack)',
    'พุ๊กพลาสติกยึดผนังเบอร์ 7 ผลิตจากพลาสติกเหนียวคุณภาพสูง ยึดแน่น ทนแรงดึงได้ดี บรรจุแพ็คพร้อมใช้งานง่าย',
    'High-quality nylon wall plug plastic anchor No.7. Offers reliable fastening expansion and superior pull-out resistance.',
    'screws_bolts',
    ARRAY['screws_bolts'],
    ARRAY['plastic_anchor', 'wall_plug', 'no_7'],
    ARRAY['พุกพลาสติก', 'พุกตัวหนอน', 'พุกเบอร์7'],
    'Generic', FALSE
  ),
  (
    'prod-024', '3m-temflex-150-electrical-tape-black', 'sale',
    'เทปพันสายไฟ สีดำ 3M Temflex 150',
    '3M Temflex 150 Electrical Tape Black',
    'เทปพันสายไฟคุณภาพสูง หนา 0.13 มม. เนื้อกาวเหนียวแน่น ไม่เหนียวเยิ้ม ป้องกันไฟรั่วและไม่เป็นเชื้อไฟ',
    '3M Temflex 150 vinyl electrical tape. 0.13mm thickness, strong flame-retardant adhesive, provides reliable insulation layer.',
    'construction_consumables',
    ARRAY['construction_consumables'],
    ARRAY['electrical_tape', 'insulation_tape', 'black_tape'],
    ARRAY['เทปดำ', 'เทปพันสายไฟ3M', 'เทปฉนวน', 'temflex150'],
    '3M', FALSE
  ),
  (
    'prod-025', 'scg-thread-seal-tape', 'sale',
    'เทปพันเกลียวท่อประปา SCG',
    'SCG Thread Seal Tape',
    'เทปพันเกลียวท่อประปามาตรฐาน SCG เนื้อเทปหนาแน่น แนบสนิทกับเกลียวท่อ ป้องกันน้ำรั่วซึมได้ 100%',
    'SCG premium PTFE thread seal tape for plumbers. Ensures air-tight and water-tight sealing on pipe threads.',
    'construction_consumables',
    ARRAY['construction_consumables'],
    ARRAY['thread_seal_tape', 'ptfe_tape', 'plumbing_tape'],
    ARRAY['เทปพันเกลียว', 'เทปพันท่อ', 'เทปประปา', 'เทปขาว'],
    'SCG', FALSE
  ),
  (
    'prod-026', '3m-comfort-grip-gloves-pu-coated', 'sale',
    'ถุงมือช่างเคลือบกันลื่น 3M Comfort Grip Gloves',
    '3M Comfort Grip Gloves PU Coated',
    'ถุงมือผ้าถักเคลือบสาร PU/Nitrile กระชับมือ ระบายอากาศได้ดี กันลื่น และช่วยป้องกันรอยขีดข่วนในการทำงานช่าง',
    '3M Comfort Grip general construction gloves with flexible PU/nitrile palm coating. Excellent grip and tactile sensitivity.',
    'ppe_general',
    ARRAY['ppe_general'],
    ARRAY['pu_coated_gloves', 'work_gloves', 'anti_slip'],
    ARRAY['ถุงมือช่าง3M', 'ถุงมือเคลือบพียู', 'ถุงมือกันลื่น'],
    '3M', FALSE
  ),
  (
    'prod-027', '3m-safety-glasses-clear-lens', 'sale',
    'แว่นตานิรภัย เลนส์ใส 3M',
    '3M Safety Glasses Clear Lens',
    'แว่นตานิรภัยเลนส์ใสป้องกันสะเก็ดและรังสี UV เคลือบสารป้องกันรอยขีดข่วนและฝ้า เหมาะสำหรับงานเจาะ ตัด และเจียร',
    '3M lightweight protective safety glasses with clear anti-scratch lenses. Superior impact shielding and 99.9% UV defense.',
    'safety_equipment',
    ARRAY['safety_equipment'],
    ARRAY['safety_glasses', 'clear_lens', 'eye_protection'],
    ARRAY['แว่นเซฟตี้', 'แว่นนิรภัย3M', 'แว่นตาใส', 'แว่นกันสะเก็ด'],
    '3M', FALSE
  )
ON CONFLICT (id) DO UPDATE
  SET name_th           = EXCLUDED.name_th,
      name_en           = EXCLUDED.name_en,
      description_th    = EXCLUDED.description_th,
      description_en    = EXCLUDED.description_en,
      main_category_key = EXCLUDED.main_category_key,
      category_keys     = EXCLUDED.category_keys,
      tag_keys          = EXCLUDED.tag_keys,
      search_keywords   = EXCLUDED.search_keywords,
      brand             = EXCLUDED.brand,
      updated_at        = now();

-- ── 3. Product SKUs ────────────────────────────────────────────
-- Each sale product has a single "default" SKU.

INSERT INTO public.product_skus (
  id, product_id,
  label_th, label_en,
  sku_code,
  price, original_price, discount_percent,
  stock,
  currency_code,
  use_product_images
) VALUES
  ('sku-020-default', 'prod-020', 'มาตรฐาน', 'Standard', '3M-GREENCORPS-CUT-4',    30.00,  35.00, 14, 10, 'THB', TRUE),
  ('sku-021-default', 'prod-021', 'มาตรฐาน', 'Standard', '3M-CUBITRON2-GRIND-4T',  75.00,  85.00, 12, 10, 'THB', TRUE),
  ('sku-022-default', 'prod-022', 'มาตรฐาน', 'Standard', '3M-251A-FLAP-4-80',      40.00,  45.00, 11, 10, 'THB', TRUE),
  ('sku-023-default', 'prod-023', 'มาตรฐาน', 'Standard', 'HOP-PLASTIC-ANCHOR-NO7', 25.00,  30.00, 17, 10, 'THB', TRUE),
  ('sku-024-default', 'prod-024', 'มาตรฐาน', 'Standard', '3M-TEMFLEX150-BLK',      22.00,  25.00, 12, 10, 'THB', TRUE),
  ('sku-025-default', 'prod-025', 'มาตรฐาน', 'Standard', 'SCG-THREAD-SEAL-TAPE',   18.00,  20.00, 10, 10, 'THB', TRUE),
  ('sku-026-default', 'prod-026', 'มาตรฐาน', 'Standard', '3M-COMFORT-GRIP-GLV',    85.00,  95.00, 11, 10, 'THB', TRUE),
  ('sku-027-default', 'prod-027', 'มาตรฐาน', 'Standard', '3M-SAFETY-GLASSES-CLR',  90.00, 100.00, 10, 10, 'THB', TRUE)
ON CONFLICT (id) DO UPDATE
  SET sku_code         = EXCLUDED.sku_code,
      price            = EXCLUDED.price,
      original_price   = EXCLUDED.original_price,
      discount_percent = EXCLUDED.discount_percent,
      stock            = EXCLUDED.stock,
      updated_at       = now();

-- ── 4. Branch Inventory: หน้านิคมลาดกระบัง ───────────────────
-- inventory_kind = 'sale'  |  on_hand = available = 10  |  safety_stock = 2
-- inventory_id ดึงจาก inventories ที่ trigger สร้างให้อัตโนมัติเมื่อ insert branch

INSERT INTO public.sku_branch_inventory (
  product_id, sku_id,
  inventory_id, inventory_kind,
  branch_id, branch_code, branch_name,
  on_hand, available, reserved, incoming,
  safety_stock
)
SELECT
  vals.product_id,
  vals.sku_id,
  inv.id,
  'sale'::public.sku_inventory_kind,
  'store-nikhom-lkb', 'NLKB', 'หน้านิคมลาดกระบัง',
  10, 10, 0, 0, 2
FROM (VALUES
  ('prod-020', 'sku-020-default'),
  ('prod-021', 'sku-021-default'),
  ('prod-022', 'sku-022-default'),
  ('prod-023', 'sku-023-default'),
  ('prod-024', 'sku-024-default'),
  ('prod-025', 'sku-025-default'),
  ('prod-026', 'sku-026-default'),
  ('prod-027', 'sku-027-default')
) AS vals(product_id, sku_id)
CROSS JOIN (
  SELECT id FROM public.inventories
  WHERE branch_id = 'store-nikhom-lkb'
    AND is_default = TRUE
  LIMIT 1
) inv
ON CONFLICT (sku_id, inventory_id) DO UPDATE
  SET on_hand        = EXCLUDED.on_hand,
      available      = EXCLUDED.available,
      inventory_kind = EXCLUDED.inventory_kind,
      branch_code    = EXCLUDED.branch_code,
      branch_name    = EXCLUDED.branch_name,
      safety_stock   = EXCLUDED.safety_stock,
      updated_at     = now();

-- ── 5. Product Metrics seed (required rows) ───────────────────

INSERT INTO public.product_metrics (product_id)
VALUES
  ('prod-020'), ('prod-021'), ('prod-022'), ('prod-023'),
  ('prod-024'), ('prod-025'), ('prod-026'), ('prod-027')
ON CONFLICT (product_id) DO NOTHING;
