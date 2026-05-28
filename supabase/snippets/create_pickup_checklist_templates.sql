-- POS V3 Phase 2E-B2: Pickup checklist templates for 6 rental assets.
-- Safe: checks existence before inserting. No duplicates. No schema changes.
-- Asset IDs resolved from slugs on 2026-05-22.

DO $$
DECLARE
  -- Asset UUIDs (resolved from slugs)
  a1 uuid := 'd873cb28-a46c-4393-aa8c-b57b3556694b'; -- Comprehensive MEP
  a2 uuid := '587ca1c5-2fee-4b96-83b7-fa6b13133073'; -- Cordless Built-in
  a3 uuid := '64807301-221f-4cbd-a3de-e1ef7e088b5d'; -- Cordless Electrical
  a4 uuid := '6a448a16-e74b-4149-8480-f68e20e9a8af'; -- Drywall & Ceiling
  a5 uuid := '6cfd10d5-e38a-41c7-b81b-8cb6b129f7bf'; -- Portable Power Dist
  a6 uuid := '70b26fa4-8561-4d7c-86ad-45a1319cf172'; -- Working at Height
  t  uuid; -- template id working variable
BEGIN

-- ── Asset 1: Comprehensive MEP Cordless Tool Set ─────────────────────────────
IF NOT EXISTS (SELECT 1 FROM public.asset_checklist_templates WHERE asset_id = a1 AND kind = 'pickup') THEN
  INSERT INTO public.asset_checklist_templates (asset_id, kind, name, description, is_active)
  VALUES (a1, 'pickup',
    'Pickup Checklist — Comprehensive MEP Cordless Tool Set',
    'เครื่องมือไฟฟ้าไร้สายงานระบบ MEP — เน้นตรวจนับตัวเครื่อง แบตเตอรี่ แท่นชาร์จ และอุปกรณ์ความปลอดภัยก่อนส่งมอบ',
    true)
  RETURNING id INTO t;
  INSERT INTO public.asset_checklist_template_items (template_id, sort_order, label, instruction, response_type, is_required) VALUES
    (t, 1,  'ตัวเครื่องสว่านโรตารี่ไร้สาย (Cordless Rotary Hammer)', 'ตรวจสอบตัวเครื่อง ด้ามจับเสริม และแกนจับดอก', 'check', true),
    (t, 2,  'ตัวเครื่องสว่านกระแทกไร้สาย (Cordless Impact Drill)', 'ตรวจสอบวงแหวนปรับโหมดและทอร์ค', 'check', true),
    (t, 3,  'ตัวเครื่องไขควงกระแทกไร้สาย (Cordless Impact Driver)', 'ตรวจสอบหัวจับดอกขันท็อกซ์/สกรู', 'check', true),
    (t, 4,  'ตัวเครื่องเจียร์ไร้สาย (Cordless Angle Grinder)', 'ตรวจสอบการติดตั้งบังใบ Safety Guard และประแจขันล็อกใบ', 'check', true),
    (t, 5,  'ก้อนแบตเตอรี่ Lithium-Ion', 'ตรวจนับจำนวนตามสเปคเซ็ต และเช็คไฟสถานะก่อนส่งมอบ', 'check', true),
    (t, 6,  'แท่นชาร์จแบตเตอรี่ความเร็วสูง (Fast Charger)', 'สายไฟไม่ฉีกขาด ปลั๊กไม่บิดเบี้ยว', 'check', true),
    (t, 7,  'กล่องเก็บเครื่องมือกันกระแทก (Heavy-duty Tool Case)', 'ตัวล็อกกล่องล็อกได้แน่นหนา หูหิ้วไม่แตกหัก', 'check', true);
END IF;

-- ── Asset 2: Cordless Built-in Tool Set ──────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM public.asset_checklist_templates WHERE asset_id = a2 AND kind = 'pickup') THEN
  INSERT INTO public.asset_checklist_templates (asset_id, kind, name, description, is_active)
  VALUES (a2, 'pickup',
    'Pickup Checklist — Cordless Built-in Tool Set',
    'ชุดเครื่องมือไร้สายงาน Built-in — เน้นตรวจสภาพเครื่องมือช่างไม้ งานตกแต่งภายใน และอุปกรณ์เสริม',
    true)
  RETURNING id INTO t;
  INSERT INTO public.asset_checklist_template_items (template_id, sort_order, label, instruction, response_type, is_required) VALUES
    (t, 1, 'ตัวเครื่องเลื่อยวงเดือนไร้สาย (Cordless Circular Saw)', 'ตรวจสอบฝาครอบใบเลื่อยสปริง Blade Guard และการปรับองศา', 'check', true),
    (t, 2, 'ตัวเครื่องเลื่อยจิ๊กซอว์ไร้สาย (Cordless Jigsaw)', 'ตรวจสอบฐานรองเลื่อย และกลไกเตะใบ Orbital Action', 'check', true),
    (t, 3, 'ตัวเครื่องไขควงกระแทกไร้สาย (Cordless Impact Driver)', 'ตรวจสอบสวิตช์ปรับทิศทางซ้าย-ขวา', 'check', true),
    (t, 4, 'ตัวเครื่องขัดกระดาษทรายไร้สาย (Cordless Orbital Sander)', 'ตรวจสอบแผ่นตีนตุ๊กแกและถุงเก็บฝุ่น', 'check', true),
    (t, 5, 'ก้อนแบตเตอรี่ไร้สาย', 'ตรวจนับจำนวนตามสเปคเซ็ต และตรวจขั้วสัมผัสว่าไม่มีคราบสกปรก', 'check', true),
    (t, 6, 'แท่นชาร์จแบตเตอรี่ (Charger)', 'ตรวจสอบสถานะไฟสแตนด์บาย', 'check', true),
    (t, 7, 'อุปกรณ์วัดเสริมในชุด เช่น ตลับเมตร / ระดับน้ำ', 'ตรวจสภาพการใช้งาน', 'check', true),
    (t, 8, 'กล่องหรือกระเป๋าใส่เครื่องมือประจำชุด', 'ซิปหรือตัวล็อกทำงานได้ปกติ', 'check', true);
END IF;

-- ── Asset 3: Cordless Electrical Installation Tool Set ───────────────────────
IF NOT EXISTS (SELECT 1 FROM public.asset_checklist_templates WHERE asset_id = a3 AND kind = 'pickup') THEN
  INSERT INTO public.asset_checklist_templates (asset_id, kind, name, description, is_active)
  VALUES (a3, 'pickup',
    'Pickup Checklist — Cordless Electrical Installation Tool Set',
    'ชุดเครื่องมือไร้สายงานติดตั้งระบบไฟฟ้า — เน้นเครื่องมือเจาะ ตัด เดินท่อร้อยสาย และอุปกรณ์ประกอบ',
    true)
  RETURNING id INTO t;
  INSERT INTO public.asset_checklist_template_items (template_id, sort_order, label, instruction, response_type, is_required) VALUES
    (t, 1, 'ตัวเครื่องสว่านกระแทกไร้สาย (Cordless Impact Drill)', 'ตรวจสอบหัวจับดอก Chuck หมุนล็อกได้แน่น', 'check', true),
    (t, 2, 'ตัวเครื่องเลื่อยชักไร้สาย (Cordless Reciprocating Saw)', 'ตรวจสอบกระบอกจับใบเลื่อยระบบ Quick-change', 'check', true),
    (t, 3, 'ตัวเครื่องไขควงกระแทกไร้สาย (Cordless Impact Driver)', 'ตรวจสอบไฟ LED หน้าเครื่อง', 'check', true),
    (t, 4, 'ก้อนแบตเตอรี่ไร้สายประจำชุด', 'ตรวจนับจำนวนครบถ้วน และสภาพไม่มีรอยบวมแตก', 'check', true),
    (t, 5, 'แท่นชาร์จแบตเตอรี่ (Charger)', 'ขั้วชาร์จสะอาด ไม่มีเศษโลหะติดค้าง', 'check', true),
    (t, 6, 'คีมปอก/คีมตัดสายไฟอเนกประสงค์ ถ้ามีในเซ็ต', 'คมมีดไม่บิ่น สปริงและด้ามจับฉนวนไม่ฉีกขาด', 'check', true),
    (t, 7, 'กล่องเก็บเครื่องมือ (Tool Case)', 'มีป้าย Tag ระบุรหัสสินค้าชัดเจน', 'check', true);
END IF;

-- ── Asset 4: Drywall & Ceiling Tool Set ──────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM public.asset_checklist_templates WHERE asset_id = a4 AND kind = 'pickup') THEN
  INSERT INTO public.asset_checklist_templates (asset_id, kind, name, description, is_active)
  VALUES (a4, 'pickup',
    'Pickup Checklist — Drywall & Ceiling Tool Set',
    'ชุดเครื่องมือสำหรับงานฝ้าและผนังเบา — เน้นเครื่องมือยึดแผ่นยิปซั่ม ตัดโครงคร่าว และอุปกรณ์ประกอบ',
    true)
  RETURNING id INTO t;
  INSERT INTO public.asset_checklist_template_items (template_id, sort_order, label, instruction, response_type, is_required) VALUES
    (t, 1, 'ตัวเครื่องไขควงยึดฝ้าไร้สาย (Cordless Drywall Screwdriver)', 'ตรวจสอบปลอกกำหนดความลึกสกรู Nosepiece และคลิปเหน็บเอว', 'check', true),
    (t, 2, 'เครื่องมือตัดอเนกประสงค์ / เลื่อยฉลุฝ้า (Cordless Multi-Tool / Cut-Out Tool)', 'ตรวจสอบประแจขันใบหรืออุปกรณ์เปลี่ยนหัว', 'check', true),
    (t, 3, 'กรรไกรตัดสังกะสี/โครงซีลายน์ (Aviation Snips)', 'ปากกรรไกรสบกันสนิท ตัวล็อกด้ามจับใช้งานได้', 'check', true),
    (t, 4, 'ก้อนแบตเตอรี่ไร้สายประจำชุด', 'ตรวจนับจำนวนครบถ้วน และเช็คระดับไฟ', 'check', true),
    (t, 5, 'แท่นชาร์จแบตเตอรี่ (Charger)', 'สายไฟและปลั๊กไฟสมบูรณ์', 'check', true),
    (t, 6, 'กระเป๋าหรือกล่องใส่เครื่องมือประจำชุด', 'สภาพสะอาด ไม่มีเศษฝุ่นปูนตกค้างเกินจำเป็น', 'check', true);
END IF;

-- ── Asset 5: Portable Power Distribution Box RCBO Extension Set ──────────────
IF NOT EXISTS (SELECT 1 FROM public.asset_checklist_templates WHERE asset_id = a5 AND kind = 'pickup') THEN
  INSERT INTO public.asset_checklist_templates (asset_id, kind, name, description, is_active)
  VALUES (a5, 'pickup',
    'Pickup Checklist — Portable Power Distribution Box RCBO Extension Set',
    'ตู้ไฟชั่วคราวเคลื่อนที่พร้อม RCBO และสายพ่วง — อุปกรณ์ไฟฟ้าความปลอดภัยสูง ต้องตรวจระบบตัดไฟและสภาพสายก่อนส่งมอบ',
    true)
  RETURNING id INTO t;
  INSERT INTO public.asset_checklist_template_items (template_id, sort_order, label, instruction, response_type, is_required) VALUES
    (t, 1, 'ตัวตู้ไฟสนามชั่วคราว (Portable Power Distribution Box)', 'ตัวถังภายนอกไม่มีรอยแตกหักรุนแรง ซีลยางกันน้ำขอบประตูยังสมบูรณ์', 'check', true),
    (t, 2, 'เบรกเกอร์หลักและเบรกเกอร์กันดูด RCBO', 'กดปุ่ม TEST เพื่อยืนยันว่ากลไกดีดตัดไฟทำงานได้ปกติ', 'check', true),
    (t, 3, 'เต้ารับอุตสาหกรรม / ปลั๊กพาวเวอร์ (Industrial Sockets)', 'ฝาครอบสปริงดีดปิดสนิท หน้าสัมผัสภายในไม่ไหม้ดำ', 'check', true),
    (t, 4, 'สายไฟพ่วงชนิดทนทานพิเศษ (Heavy-duty Cable VCT)', 'ตรวจตลอดความยาวสาย ไม่มีรอยฉีกขาดจนเห็นลวดทองแดง ปลั๊กตัวผู้แน่นหนา', 'check', true),
    (t, 5, 'ล้อเก็บสายไฟ / ขาตั้งเหล็ก', 'โครงสร้างมั่นคง ไม่บิดเบี้ยวจนล้ม แกนหมุนสายใช้งานได้สะดวก', 'check', true);
END IF;

-- ── Asset 6: Working at Height Safety Equipment Set ───────────────────────────
IF NOT EXISTS (SELECT 1 FROM public.asset_checklist_templates WHERE asset_id = a6 AND kind = 'pickup') THEN
  INSERT INTO public.asset_checklist_templates (asset_id, kind, name, description, is_active)
  VALUES (a6, 'pickup',
    'Pickup Checklist — Working at Height Safety Equipment Set',
    'ชุดอุปกรณ์เซฟตี้สำหรับทำงานบนที่สูง — PPE ความปลอดภัยสูง ต้องตรวจรอยขาด ชำรุด และกลไกล็อกก่อนส่งมอบทุกครั้ง',
    true)
  RETURNING id INTO t;
  INSERT INTO public.asset_checklist_template_items (template_id, sort_order, label, instruction, response_type, is_required) VALUES
    (t, 1, 'ชุดสายรัดนิรภัยเต็มตัว (Full Body Harness)', 'ตรวจสาย Webbing ไม่มีรอยบาดหรือไหม้ ฝีเข็มจุดรับแรงไม่หลุดขาด และ D-Ring ไม่มีรอยร้าวหรือสนิมขุม', 'check', true),
    (t, 2, 'สายช่วยชีวิตพร้อมตัวดูดซับแรงกระแทก (Shock Absorbing Lanyard)', 'ถุงหุ้มซับแรงไม่มีรอยฉีกขาด ตะขอ Snap Hook / Scaffold Hook ล็อก 2 จังหวะและเด้งกลับได้เอง', 'check', true),
    (t, 3, 'หมวกนิรภัยสำหรับงานบนที่สูง (Safety Helmet)', 'เปลือกหมวกไม่มีรอยร้าว ชุดรองใน Suspension และสายรัดคาง 4 จุดปรับกระชับและล็อกได้แน่น', 'check', true),
    (t, 4, 'สายรัดเครื่องมือกันตก (Tool Lanyard / Tether)', 'สายยืดและคาราบิเนอร์สำหรับยึดเครื่องมือไม่หลุดหลวม', 'check', true),
    (t, 5, 'ถุงมือเซฟตี้จับกระชับมือ (Safety Gloves)', 'ตรวจนับครบ 1 คู่ ไม่มีรอยฉีกขาดทะลุ', 'check', true),
    (t, 6, 'กระเป๋าจัดเก็บอุปกรณ์เซฟตี้ (Storage Bag)', 'สภาพเรียบร้อย สายสะพายไม่ขาด', 'check', true);
END IF;

END $$;
