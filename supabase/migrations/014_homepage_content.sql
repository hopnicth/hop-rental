-- ============================================================
-- 014_homepage_content.sql
--
-- Homepage CMS/content tables for hero banners, link-card rails,
-- and curated featured product/rental sections.
-- ============================================================

CREATE TABLE public.home_banners (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_th         TEXT NOT NULL,
  title_en         TEXT NOT NULL,
  title_cn         TEXT,
  title_jp         TEXT,
  subtitle_th      TEXT NOT NULL,
  subtitle_en      TEXT NOT NULL,
  subtitle_cn      TEXT,
  subtitle_jp      TEXT,
  cta_label_th     TEXT NOT NULL,
  cta_label_en     TEXT NOT NULL,
  cta_label_cn     TEXT,
  cta_label_jp     TEXT,
  image_url        TEXT NOT NULL,
  mobile_image_url TEXT,
  link_url         TEXT NOT NULL,
  link_target      TEXT NOT NULL DEFAULT '_self' CHECK (link_target IN ('_self', '_blank')),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (char_length(title_th) > 0),
  CHECK (char_length(title_en) > 0),
  CHECK (char_length(subtitle_th) > 0),
  CHECK (char_length(subtitle_en) > 0),
  CHECK (char_length(cta_label_th) > 0),
  CHECK (char_length(cta_label_en) > 0),
  CHECK (char_length(image_url) > 0),
  CHECK (char_length(link_url) > 0)
);

COMMENT ON TABLE public.home_banners IS 'Super-admin managed homepage hero banner slides.';


CREATE TABLE public.home_link_cards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key    TEXT NOT NULL CHECK (section_key IN ('promotion', 'service')),
  title_th       TEXT NOT NULL,
  title_en       TEXT NOT NULL,
  title_cn       TEXT,
  title_jp       TEXT,
  description_th TEXT NOT NULL,
  description_en TEXT NOT NULL,
  description_cn TEXT,
  description_jp TEXT,
  image_url      TEXT NOT NULL,
  link_url       TEXT NOT NULL,
  link_target    TEXT NOT NULL DEFAULT '_self' CHECK (link_target IN ('_self', '_blank')),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (char_length(title_th) > 0),
  CHECK (char_length(title_en) > 0),
  CHECK (char_length(description_th) > 0),
  CHECK (char_length(description_en) > 0),
  CHECK (char_length(image_url) > 0),
  CHECK (char_length(link_url) > 0)
);

COMMENT ON TABLE public.home_link_cards IS 'Homepage horizontal-card content for promotion and service sections.';


CREATE TABLE public.home_featured_products (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (product_id)
);

COMMENT ON TABLE public.home_featured_products IS 'Super-admin curated product list for homepage recommendation rails.';


CREATE TABLE public.home_featured_rental_accesses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_access_id UUID NOT NULL REFERENCES public.rental_accesses(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (rental_access_id)
);

COMMENT ON TABLE public.home_featured_rental_accesses IS 'Super-admin curated rental-access list for homepage rails.';


INSERT INTO public.home_banners (
  title_th,
  title_en,
  subtitle_th,
  subtitle_en,
  cta_label_th,
  cta_label_en,
  image_url,
  mobile_image_url,
  link_url,
  sort_order,
  is_active
) VALUES
  (
    'เครื่องมือพร้อมเช่า พร้อมส่งงานทันที',
    'Rental-ready tools for immediate deployment',
    'รวมชุดเครื่องมือเช่าที่พร้อมใช้งานจริง พร้อมข้อมูลสั้น กระชับ และกดต่อได้ทันที',
    'Browse rental-ready tool sets with concise details and quick paths to action.',
    'ดูชุดเครื่องมือเช่า',
    'Browse rental sets',
    'https://picsum.photos/seed/hop-home-banner1/1400/900',
    'https://picsum.photos/seed/hop-home-banner1-mobile/900/1200',
    '/product-rental',
    1,
    TRUE
  ),
  (
    'สินค้าเด่นและวัสดุพร้อมขายในที่เดียว',
    'Recommended sale items in one place',
    'คัดสินค้าขายที่เหมาะกับงานหน้างานและงานโรงงานให้หยิบดูได้ง่ายบนหน้าแรก',
    'Discover curated sale items for field and factory work directly from the homepage.',
    'ดูสินค้าทั้งหมด',
    'View all products',
    'https://picsum.photos/seed/hop-home-banner2/1400/900',
    'https://picsum.photos/seed/hop-home-banner2-mobile/900/1200',
    '/product-all',
    2,
    TRUE
  ),
  (
    'บริการวิศวกรรมและงานสนับสนุนการผลิต',
    'Engineering and production support services',
    'รวมบริการเขียนแบบ ให้คำปรึกษาการผลิต และงานสนับสนุนภายในโรงงานไว้ในแบนเนอร์หลัก',
    'Highlight engineering design, manufacturing consulting, and factory support services in the homepage hero.',
    'ดูบริการของเรา',
    'Explore services',
    'https://picsum.photos/seed/hop-home-banner3/1400/900',
    'https://picsum.photos/seed/hop-home-banner3-mobile/900/1200',
    '/services/engineering-design',
    3,
    TRUE
  );

INSERT INTO public.home_link_cards (
  section_key,
  title_th,
  title_en,
  description_th,
  description_en,
  image_url,
  link_url,
  sort_order,
  is_active
) VALUES
  (
    'promotion',
    'ชุดเช่าแนะนำสำหรับงานหน้างาน',
    'Recommended rental sets for field work',
    'รวมชุดเครื่องมือเช่าที่พร้อมใช้งานจริงสำหรับทีมภาคสนามและโรงงาน',
    'Curated rental bundles prepared for practical field deployment.',
    'https://picsum.photos/seed/home-promo-1/900/600',
    '/product-rental',
    1,
    TRUE
  ),
  (
    'promotion',
    'สินค้าแนะนำสำหรับงานโรงงาน',
    'Recommended products for factory work',
    'ดูสินค้าขายที่ทีมงานคัดมาเพื่อใช้งานในสายการผลิตและงานซ่อมบำรุง',
    'See selected sale items for factory lines and maintenance work.',
    'https://picsum.photos/seed/home-promo-2/900/600',
    '/product-all',
    2,
    TRUE
  ),
  (
    'service',
    'บริการเขียนแบบ ออกแบบวิศวกรรม',
    'Engineering design & drafting',
    'วางแนวคิด ออกแบบ และจัดเตรียมเอกสารเพื่อให้โครงการเดินต่อได้อย่างมีแบบแผน',
    'Draft and prepare engineering documents for execution-ready projects.',
    'https://picsum.photos/seed/home-service-1/900/600',
    '/services/engineering-design',
    1,
    TRUE
  ),
  (
    'service',
    'บริการให้คำปรึกษาเรื่องการผลิต',
    'Manufacturing consulting',
    'ช่วยวิเคราะห์หน้างาน ปรับวิธีการทำงาน และวางแนวทางเพิ่มประสิทธิภาพการผลิต',
    'Review operations and identify practical production-efficiency opportunities.',
    'https://picsum.photos/seed/home-service-2/900/600',
    '/services/manufacturing-consulting',
    2,
    TRUE
  ),
  (
    'service',
    'บริการรับเหมาในโรงงาน',
    'Factory contracting',
    'รองรับงานติดตั้ง ปรับปรุง และงานสนับสนุนภายในโรงงานด้วยทีมที่พร้อมลงพื้นที่',
    'Support installation and in-factory execution work with deployable crews.',
    'https://picsum.photos/seed/home-service-3/900/600',
    '/services/factory-contracting',
    3,
    TRUE
  );


CREATE INDEX idx_home_banners_active_sort
  ON public.home_banners(is_active, sort_order, created_at DESC);

CREATE INDEX idx_home_link_cards_section_active_sort
  ON public.home_link_cards(section_key, is_active, sort_order, created_at DESC);

CREATE INDEX idx_home_featured_products_active_sort
  ON public.home_featured_products(is_active, sort_order, created_at DESC);

CREATE INDEX idx_home_featured_rental_accesses_active_sort
  ON public.home_featured_rental_accesses(is_active, sort_order, created_at DESC);


CREATE TRIGGER set_home_banners_updated_at
  BEFORE UPDATE ON public.home_banners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_home_link_cards_updated_at
  BEFORE UPDATE ON public.home_link_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_home_featured_products_updated_at
  BEFORE UPDATE ON public.home_featured_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_home_featured_rental_accesses_updated_at
  BEFORE UPDATE ON public.home_featured_rental_accesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_link_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_featured_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_featured_rental_accesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_banners_select_public"
  ON public.home_banners FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "home_link_cards_select_public"
  ON public.home_link_cards FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "home_featured_products_select_public"
  ON public.home_featured_products FOR SELECT
  USING (
    is_active = TRUE
    AND EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = home_featured_products.product_id
        AND p.is_hidden = FALSE
    )
  );

CREATE POLICY "home_featured_rental_accesses_select_public"
  ON public.home_featured_rental_accesses FOR SELECT
  USING (
    is_active = TRUE
    AND EXISTS (
      SELECT 1
      FROM public.rental_accesses ra
      WHERE ra.id = home_featured_rental_accesses.rental_access_id
        AND ra.status = 'active'
        AND ra.is_hidden = FALSE
    )
  );