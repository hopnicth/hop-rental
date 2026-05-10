-- 065: Separate service provider identity/KYC from public content pages.

CREATE TABLE IF NOT EXISTS public.service_providers (
  provider_id     TEXT PRIMARY KEY,
  provider_type   TEXT NOT NULL CHECK (provider_type IN ('individual', 'company')),
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  contact_phone   TEXT,
  contact_email   TEXT,
  google_maps_url TEXT,
  kyc_documents   JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (provider_id ~ '^[0-9]{13}$'),
  CHECK (kyc_documents IS NULL OR jsonb_typeof(kyc_documents) = 'object'),
  CHECK (contact_email IS NULL OR contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

COMMENT ON TABLE public.service_providers IS
  'Service provider identity/contact/KYC records. provider_id is Thai Citizen ID or Juristic ID (13 digits).';
COMMENT ON COLUMN public.service_providers.kyc_documents IS
  'JSON object of KYC document metadata/path values for files stored in the catalog-media bucket.';

CREATE TRIGGER set_service_providers_updated_at
  BEFORE UPDATE ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.content_pages
  ADD COLUMN IF NOT EXISTS provider_id TEXT
  REFERENCES public.service_providers(provider_id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

ALTER TABLE public.content_pages
  DROP CONSTRAINT IF EXISTS content_pages_provider_service_only;

ALTER TABLE public.content_pages
  ADD CONSTRAINT content_pages_provider_service_only
  CHECK (content_type = 'service' OR provider_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_content_pages_provider_id
  ON public.content_pages(provider_id);

ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_providers_select_public"
  ON public.service_providers FOR SELECT
  USING (TRUE);

REVOKE ALL ON public.service_providers FROM anon, authenticated;
GRANT SELECT (
  provider_id,
  provider_type,
  is_verified,
  contact_phone,
  contact_email,
  google_maps_url,
  created_at,
  updated_at
) ON public.service_providers TO anon, authenticated;
GRANT ALL ON public.service_providers TO service_role;
