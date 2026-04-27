-- 034: Homepage partner/logo marquee for storefront + admin management

CREATE TABLE IF NOT EXISTS public.home_partner_logos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  image_url  TEXT NOT NULL,
  link_url   TEXT NOT NULL,
  link_target TEXT NOT NULL DEFAULT '_self' CHECK (link_target IN ('_self', '_blank')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (char_length(name) > 0),
  CHECK (char_length(image_url) > 0),
  CHECK (char_length(link_url) > 0)
);

COMMENT ON TABLE public.home_partner_logos IS
  'Super-admin managed partner/brand logos shown in the homepage marquee.';

INSERT INTO public.home_partner_logos (
  name,
  image_url,
  link_url,
  link_target,
  sort_order,
  is_active
)
VALUES
  ('3M', 'https://placehold.co/160x80/D32F2F/FFFFFF?text=3M&font=roboto', '/product-all', '_self', 1, TRUE),
  ('Milwaukee', 'https://placehold.co/160x80/B71C1C/FFFFFF?text=Milwaukee&font=roboto', '/product-all', '_self', 2, TRUE),
  ('Makita', 'https://placehold.co/160x80/00897B/FFFFFF?text=Makita&font=roboto', '/product-all', '_self', 3, TRUE),
  ('DeWalt', 'https://placehold.co/160x80/F9A825/000000?text=DeWalt&font=roboto', '/product-all', '_self', 4, TRUE),
  ('Bosch', 'https://placehold.co/160x80/1565C0/FFFFFF?text=Bosch&font=roboto', '/product-all', '_self', 5, TRUE),
  ('Stanley', 'https://placehold.co/160x80/F57F17/000000?text=Stanley&font=roboto', '/product-all', '_self', 6, TRUE),
  ('Hilti', 'https://placehold.co/160x80/D50000/FFFFFF?text=Hilti&font=roboto', '/product-all', '_self', 7, TRUE),
  ('Festool', 'https://placehold.co/160x80/2E7D32/FFFFFF?text=Festool&font=roboto', '/product-all', '_self', 8, TRUE),
  ('Ryobi', 'https://placehold.co/160x80/388E3C/FFFFFF?text=Ryobi&font=roboto', '/product-all', '_self', 9, TRUE),
  ('Metabo', 'https://placehold.co/160x80/4E342E/FFFFFF?text=Metabo&font=roboto', '/product-all', '_self', 10, TRUE)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_home_partner_logos_active_sort
  ON public.home_partner_logos(is_active, sort_order, created_at DESC);

DROP TRIGGER IF EXISTS set_home_partner_logos_updated_at ON public.home_partner_logos;
CREATE TRIGGER set_home_partner_logos_updated_at
  BEFORE UPDATE ON public.home_partner_logos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.home_partner_logos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "home_partner_logos_select_public" ON public.home_partner_logos;
CREATE POLICY "home_partner_logos_select_public"
  ON public.home_partner_logos FOR SELECT
  USING (is_active = TRUE);