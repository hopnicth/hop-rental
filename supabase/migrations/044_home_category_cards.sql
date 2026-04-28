-- 044_home_category_cards.sql
-- DB-backed Home category card config, seeded from the previous mock card.

CREATE TABLE IF NOT EXISTS public.home_category_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  main_category_key TEXT NOT NULL REFERENCES public.main_categories(key) ON UPDATE CASCADE ON DELETE RESTRICT,
  label_th TEXT NOT NULL,
  label_en TEXT NOT NULL,
  label_cn TEXT,
  label_jp TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (main_category_key),
  CHECK (char_length(main_category_key) > 0),
  CHECK (char_length(label_th) > 0),
  CHECK (char_length(label_en) > 0)
);

CREATE TABLE IF NOT EXISTS public.home_category_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.home_category_groups(id) ON DELETE CASCADE,
  option_key TEXT NOT NULL,
  label_th TEXT NOT NULL,
  label_en TEXT NOT NULL,
  label_cn TEXT,
  label_jp TEXT,
  search_query_th TEXT,
  search_query_en TEXT,
  search_query_cn TEXT,
  search_query_jp TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, option_key),
  CHECK (char_length(option_key) > 0),
  CHECK (char_length(label_th) > 0),
  CHECK (char_length(label_en) > 0)
);

COMMENT ON TABLE public.home_category_groups IS
  'Super-admin managed groups for the Home category card. Seeded from the previous mock main categories.';
COMMENT ON TABLE public.home_category_options IS
  'Super-admin managed dropdown options for each Home category-card group. option_key is sent as /search category query.';

CREATE INDEX IF NOT EXISTS idx_home_category_groups_active_sort
  ON public.home_category_groups (is_active, sort_order, label_th);
CREATE INDEX IF NOT EXISTS idx_home_category_options_group_active_sort
  ON public.home_category_options (group_id, is_active, sort_order, label_th);

DROP TRIGGER IF EXISTS set_home_category_groups_updated_at ON public.home_category_groups;
CREATE TRIGGER set_home_category_groups_updated_at
  BEFORE UPDATE ON public.home_category_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_home_category_options_updated_at ON public.home_category_options;
CREATE TRIGGER set_home_category_options_updated_at
  BEFORE UPDATE ON public.home_category_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.home_category_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_category_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "home_category_groups_select_public_active" ON public.home_category_groups;
CREATE POLICY "home_category_groups_select_public_active"
  ON public.home_category_groups FOR SELECT
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "home_category_options_select_public_active" ON public.home_category_options;
CREATE POLICY "home_category_options_select_public_active"
  ON public.home_category_options FOR SELECT
  USING (
    is_active = TRUE
    AND EXISTS (
      SELECT 1 FROM public.home_category_groups g
      WHERE g.id = group_id AND g.is_active = TRUE
    )
  );

GRANT SELECT ON public.home_category_groups TO anon, authenticated;
GRANT SELECT ON public.home_category_options TO anon, authenticated;

INSERT INTO public.home_category_groups (main_category_key, label_th, label_en, icon, sort_order)
VALUES
  ('safety_equipment', 'อุปกรณ์เซฟตี้', 'Safety Equipment', 'bx:shield-quarter', 10),
  ('mechanic_tools', 'เครื่องมือช่าง', 'Mechanic Tools', 'bx:wrench', 20),
  ('measuring_tools', 'อุปกรณ์ ช่าง ตวง วัด', 'Measuring Tools', 'bx:ruler', 30),
  ('ppe_general', 'อุปกรณ์ PPE, อุปกรณ์ทั่วไป', 'PPE & General Equipment', 'bx:hard-hat', 40),
  ('construction_consumables', 'วัสดุสิ้นเปลืองงานก่อสร้าง', 'Construction Consumables', 'bx:building-house', 50),
  ('screws_bolts', 'สกรู, โบลท์, แหวน, น็อต', 'Screws, Bolts, Washers & Nuts', 'bx:cog', 60),
  ('others', 'อื่นๆ', 'Others', 'bx:dots-horizontal-rounded', 999)
ON CONFLICT (main_category_key) DO NOTHING;

INSERT INTO public.home_category_options (group_id, option_key, label_th, label_en, search_query_th, search_query_en, sort_order)
SELECT g.id, v.option_key, v.label_th, v.label_en, v.label_th, v.label_en, v.sort_order
FROM (VALUES
  ('safety_equipment','s01','สำหรับงานที่สูง','For Working at Heights',10),
  ('safety_equipment','s02','สำหรับงานเสี่ยงประกายไฟ','For Spark-Risk Work',20),
  ('safety_equipment','s03','สำหรับงานขนย้าย','For Moving & Lifting',30),
  ('safety_equipment','s04','สำหรับเครน','For Crane Operations',40),
  ('safety_equipment','s05','สำหรับงานก่อสร้างทั่วไป','For General Construction',50),
  ('safety_equipment','s06','สำหรับงานที่อับอากาศ','For Confined Spaces',60),
  ('mechanic_tools','m01','เครื่องมือ Battery','Battery Tools',10),
  ('mechanic_tools','m02','เครื่องมือพิเศษ','Special Tools',20),
  ('mechanic_tools','m03','งานขัน','Tightening Work',30),
  ('mechanic_tools','m04','เครื่องมือวัด','Measuring Instruments',40),
  ('mechanic_tools','m05','งานปูน','Masonry Work',50),
  ('mechanic_tools','m06','เครื่องมือตัด','Cutting Tools',60),
  ('measuring_tools','me01','ตลับเมตร','Tape Measure',10),
  ('measuring_tools','me02','เลเซอร์วัดระดับ','Laser Level',20),
  ('measuring_tools','me03','เวอร์เนียร์คาลิปเปอร์','Vernier Caliper',30),
  ('measuring_tools','me04','มัลติมิเตอร์','Multimeter',40),
  ('measuring_tools','me05','เทอร์โมมิเตอร์','Thermometer',50),
  ('ppe_general','p01','หมวกนิรภัย','Safety Helmet',10),
  ('ppe_general','p02','แว่นตานิรภัย','Safety Glasses',20),
  ('ppe_general','p03','ถุงมือ','Gloves',30),
  ('ppe_general','p04','รองเท้านิรภัย','Safety Shoes',40),
  ('ppe_general','p05','ที่อุดหู','Ear Plugs',50),
  ('ppe_general','p06','หน้ากากกันฝุ่น','Dust Mask',60),
  ('construction_consumables','cc01','ปูนซีเมนต์','Cement',10),
  ('construction_consumables','cc02','ทราย','Sand',20),
  ('construction_consumables','cc03','ลวด','Wire',30),
  ('construction_consumables','cc04','ตะปู','Nails',40),
  ('construction_consumables','cc05','ซีลแลนท์','Sealant',50),
  ('screws_bolts','sb01','สกรู','Screws',10),
  ('screws_bolts','sb02','โบลท์','Bolts',20),
  ('screws_bolts','sb03','แหวน','Washers',30),
  ('screws_bolts','sb04','น็อต','Nuts',40),
  ('screws_bolts','sb05','พุกเหล็ก','Anchors',50),
  ('others','o01','อุปกรณ์ทำความสะอาด','Cleaning Supplies',10),
  ('others','o02','น้ำมันหล่อลื่น','Lubricants',20),
  ('others','o03','เทป','Tapes',30),
  ('others','o04','เชือก','Ropes',40),
  ('others','o05','เบ็ดเตล็ด','Miscellaneous',50)
) AS v(group_key, option_key, label_th, label_en, sort_order)
JOIN public.home_category_groups g ON g.main_category_key = v.group_key
ON CONFLICT (group_id, option_key) DO NOTHING;