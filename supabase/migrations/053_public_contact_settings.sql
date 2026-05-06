-- Public contact settings for storefront support CTAs.

CREATE TABLE IF NOT EXISTS public.public_contact_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  support_phone TEXT NOT NULL DEFAULT '+66 95-479-2333',
  line_url TEXT NOT NULL DEFAULT 'https://line.me/R/ti/p/@832vmicv?ts=03031436&oat_content=url',
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.public_contact_settings IS 'Single-row public contact settings for ChatFab guest support options.';
COMMENT ON COLUMN public.public_contact_settings.support_phone IS 'Phone number used by the guest ChatFab call button.';
COMMENT ON COLUMN public.public_contact_settings.line_url IS 'Line Official add/contact URL used by the guest ChatFab Line button.';

CREATE TRIGGER update_public_contact_settings_updated_at
  BEFORE UPDATE ON public.public_contact_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.public_contact_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read public contact settings" ON public.public_contact_settings;
CREATE POLICY "Anyone can read public contact settings"
  ON public.public_contact_settings
  FOR SELECT
  USING (true);

INSERT INTO public.public_contact_settings (id, support_phone, line_url)
VALUES (
  TRUE,
  '+66 95-479-2333',
  'https://line.me/R/ti/p/@832vmicv?ts=03031436&oat_content=url'
)
ON CONFLICT (id) DO NOTHING;