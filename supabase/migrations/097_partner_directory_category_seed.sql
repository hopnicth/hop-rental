-- ============================================================
-- 097_partner_directory_category_seed.sql
--
-- Partner Directory Category v1 — seed main_categories with
-- 20 partner-specific category keys (7 store + 6 service + 7 contractor).
--
-- Rules:
--   * All rows use entity_types = ARRAY['partner']::TEXT[].
--   * Key prefix convention: store_ / service_ / contractor_
--   * ON CONFLICT (key) DO NOTHING — safe to replay; no existing key
--     in any prior migration uses these prefixed names.
--   * Does NOT change any existing category row.
--   * Does NOT redesign or restructure the main_categories table.
-- ============================================================

-- ── 1. Store categories (7) ───────────────────────────────────────────────────

INSERT INTO public.main_categories
  (key, label_th, label_en, icon,
   description_th, description_en,
   entity_types, sort_order)
VALUES
  ('store_construction_materials',
   'ร้านวัสดุก่อสร้าง', 'Construction Materials', 'bx:building-house',
   'ตัวอย่าง: ปูน, ทราย, หิน, เหล็กเส้น, อิฐ',
   'e.g. cement, sand, gravel, rebar, bricks',
   ARRAY['partner']::TEXT[], 10),

  ('store_hardware_tools',
   'ร้านฮาร์ดแวร์และเครื่องมือช่าง', 'Hardware & Tools', 'bx:wrench',
   'ตัวอย่าง: น็อต, สกรู, อุปกรณ์ชิ้นเล็ก, อะไหล่',
   'e.g. nuts, bolts, small parts, spare components',
   ARRAY['partner']::TEXT[], 20),

  ('store_electrical_lighting',
   'ร้านอุปกรณ์ไฟฟ้าและแสงสว่าง', 'Electrical & Lighting', 'bx:plug',
   'ตัวอย่าง: สายไฟ, ท่อร้อยสาย, หลอดไฟ, เบรกเกอร์',
   'e.g. cables, conduit, light bulbs, circuit breakers',
   ARRAY['partner']::TEXT[], 30),

  ('store_plumbing',
   'ร้านอุปกรณ์ประปา', 'Plumbing', 'bx:droplet',
   'ตัวอย่าง: ท่อ PVC, ข้อต่อ, ปั๊มน้ำ, แทงก์น้ำ',
   'e.g. PVC pipe, fittings, water pumps, water tanks',
   ARRAY['partner']::TEXT[], 40),

  ('store_safety_ppe',
   'ร้านเซฟตี้และ PPE', 'Safety & PPE', 'bx:shield-quarter',
   'ตัวอย่าง: หมวกนิรภัย, รองเท้าเซฟตี้, เข็มขัดกันตก',
   'e.g. safety helmets, safety boots, fall-arrest harnesses',
   ARRAY['partner']::TEXT[], 50),

  ('store_paints_chemicals',
   'ร้านสีและเคมีภัณฑ์', 'Paints & Chemicals', 'bx:palette',
   'ตัวอย่าง: สีทาอาคาร, น้ำยาเคลือบ, ซิลิโคน, โฟม',
   'e.g. wall paint, coating agents, silicone sealant, foam',
   ARRAY['partner']::TEXT[], 60),

  ('store_signage_print',
   'ร้านป้ายและสิ่งพิมพ์', 'Signage & Print', 'bx:printer',
   'ตัวอย่าง: ป้ายโครงการ, ป้ายเซฟตี้, สติ๊กเกอร์ติดหมวก/รถ',
   'e.g. project signs, safety signs, helmet and vehicle stickers',
   ARRAY['partner']::TEXT[], 70)

ON CONFLICT (key) DO NOTHING;

-- ── 2. Service categories (6) ─────────────────────────────────────────────────

INSERT INTO public.main_categories
  (key, label_th, label_en, icon,
   description_th, description_en,
   entity_types, sort_order)
VALUES
  ('service_transport_logistics',
   'บริษัทขนส่งและรับจ้าง', 'Transport & Logistics', 'bx:car',
   'ตัวอย่าง: รถกระบะรับจ้าง, รถหกล้อ, บริการขนย้ายของ/เครื่องจักร',
   'e.g. pickup truck hire, six-wheel truck, equipment relocation',
   ARRAY['partner']::TEXT[], 10),

  ('service_heavy_machinery_rental',
   'เช่าเครื่องจักรหนัก', 'Heavy Machinery Rental', 'bx:cog',
   'ตัวอย่าง: รถเครน, รถแบคโฮ, รถตัก',
   'e.g. crane, backhoe, wheel loader',
   ARRAY['partner']::TEXT[], 20),

  ('service_waste_disposal',
   'รับทิ้งขยะและเศษวัสดุ', 'Waste Disposal', 'bx:trash',
   'ตัวอย่าง: บริการขนทิ้งขยะก่อสร้าง, ดูดส้วมหน้างาน',
   'e.g. construction debris removal, portable toilet pumping',
   ARRAY['partner']::TEXT[], 30),

  ('service_site_facilities',
   'ที่พักและสิ่งอำนวยความสะดวก', 'Site Facilities', 'bx:building',
   'ตัวอย่าง: ตู้คอนเทนเนอร์สำนักงาน, เต็นท์คนงาน, ห้องน้ำเคลื่อนที่',
   'e.g. office container rental, worker tents, mobile toilets',
   ARRAY['partner']::TEXT[], 40),

  ('service_design_consulting',
   'ออกแบบและที่ปรึกษา', 'Design & Consulting', 'bx:ruler',
   'ตัวอย่าง: รับเขียนแบบ, ประเมินราคา, วิศวกรเซ็นแบบ',
   'e.g. drafting, cost estimation, licensed engineer stamp',
   ARRAY['partner']::TEXT[], 50),

  ('service_safety_services',
   'บริการด้านความปลอดภัย', 'Safety Services', 'bx:shield',
   'ตัวอย่าง: รับตรวจปั้นจั่น/เครน, จป. วิชาชีพ, ฟรีแลนซ์/บริษัท',
   'e.g. crane/hoist inspection, certified safety officer (JSO)',
   ARRAY['partner']::TEXT[], 60)

ON CONFLICT (key) DO NOTHING;

-- ── 3. Contractor categories (7) ──────────────────────────────────────────────

INSERT INTO public.main_categories
  (key, label_th, label_en, icon,
   description_th, description_en,
   entity_types, sort_order)
VALUES
  ('contractor_general',
   'ผู้รับเหมาหลัก / รับเหมาต่อเติม', 'General Contractor', 'bx:hard-hat',
   'ตัวอย่าง: คุมงานหลัก, รับสร้างบ้าน, ต่อเติมทั่วไป',
   'e.g. main site supervision, house construction, general extensions',
   ARRAY['partner']::TEXT[], 10),

  ('contractor_structural_masonry',
   'ช่างโครงสร้างและปูน', 'Structural & Masonry', 'bx:grid',
   'ตัวอย่าง: ช่างผูกเหล็ก, ช่างเทปูน, ช่างก่อฉาบ',
   'e.g. rebar tying, concrete pouring, bricklaying and plastering',
   ARRAY['partner']::TEXT[], 20),

  ('contractor_electrical_network',
   'ช่างไฟฟ้าและสื่อสาร', 'Electrical & Network', 'bx:chip',
   'ตัวอย่าง: เดินสายไฟ, ติดตั้งตู้คอนซูมเมอร์, เดินระบบแลน/กล้องวงจรปิด',
   'e.g. wiring, consumer unit install, LAN and CCTV systems',
   ARRAY['partner']::TEXT[], 30),

  ('contractor_plumbing_sanitary',
   'ช่างประปาและสุขาภิบาล', 'Plumbing & Sanitary', 'bx:water',
   'ตัวอย่าง: เดินท่อน้ำดี/น้ำทิ้ง, ติดตั้งสุขภัณฑ์',
   'e.g. supply and drain pipe runs, sanitary ware installation',
   ARRAY['partner']::TEXT[], 40),

  ('contractor_roofing_steel_work',
   'ช่างหลังคาและโครงเหล็ก', 'Roofing & Steel Work', 'bx:home',
   'ตัวอย่าง: งานเชื่อมเหล็ก, ติดตั้งโครงหลังคา, มุงหลังคา',
   'e.g. steel welding, roof frame installation, roof sheeting',
   ARRAY['partner']::TEXT[], 50),

  ('contractor_finishing_work',
   'ช่างตกแต่งและเก็บงาน', 'Finishing Work', 'bx:paint-roll',
   'ตัวอย่าง: ช่างฝ้าเพดาน, ช่างทาสี, ช่างปูกระเบื้อง, ช่างกระจกอลูมิเนียม',
   'e.g. ceiling, painting, tiling, aluminium and glass works',
   ARRAY['partner']::TEXT[], 60),

  ('contractor_general_labor',
   'คนงานทั่วไป', 'General Labor', 'bx:user-circle',
   'ตัวอย่าง: แรงงานรายวัน, ผู้ช่วยช่าง, คนงานทำความสะอาดไซต์งาน',
   'e.g. daily wage workers, trade assistants, site clean-up crew',
   ARRAY['partner']::TEXT[], 70)

ON CONFLICT (key) DO NOTHING;
