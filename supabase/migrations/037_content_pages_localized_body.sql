-- 037: Allow content_pages.blocks to be a localized TipTap document object.
--
-- Migration 036 enforced jsonb_typeof(blocks) = 'array' for the legacy
-- block-list editor. The CMS now stores per-locale TipTap (ProseMirror)
-- documents under blocks as { th, en, cn, jp } objects, so the constraint
-- is replaced and the default is changed to an empty object.

ALTER TABLE public.content_pages
  DROP CONSTRAINT IF EXISTS content_pages_blocks_check;

ALTER TABLE public.content_pages
  ADD CONSTRAINT content_pages_blocks_check
  CHECK (jsonb_typeof(blocks) IN ('object', 'array'));

ALTER TABLE public.content_pages
  ALTER COLUMN blocks SET DEFAULT '{}'::JSONB;
