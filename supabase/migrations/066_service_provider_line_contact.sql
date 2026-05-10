-- 066: Add Line contact fields for service provider contact FAB.

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS line_id TEXT,
  ADD COLUMN IF NOT EXISTS line_url TEXT;

COMMENT ON COLUMN public.service_providers.line_id IS
  'Optional Line ID, e.g. @hopnic or personal Line ID. Public storefront builds a line.me URL after validation.';
COMMENT ON COLUMN public.service_providers.line_url IS
  'Optional full Line contact URL. Must be an HTTPS line.me/lin.ee URL.';

ALTER TABLE public.service_providers
  DROP CONSTRAINT IF EXISTS service_providers_line_id_format;

ALTER TABLE public.service_providers
  ADD CONSTRAINT service_providers_line_id_format
  CHECK (line_id IS NULL OR line_id ~ '^@?[A-Za-z0-9._-]{2,64}$');

ALTER TABLE public.service_providers
  DROP CONSTRAINT IF EXISTS service_providers_line_url_format;

ALTER TABLE public.service_providers
  ADD CONSTRAINT service_providers_line_url_format
  CHECK (
    line_url IS NULL OR
    line_url ~* '^https://(line\.me|lin\.ee|[A-Za-z0-9.-]+\.line\.me)(/|$)'
  );

GRANT SELECT (line_id, line_url)
  ON public.service_providers TO anon, authenticated;