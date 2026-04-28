-- 042_allow_filter_key_updates.sql
--
-- Allow super-admins to rename filter_groups.key and filter_options.key.
--
-- Originally these keys were locked at the DB level (migration 041) because
-- products.filter_keys stores denormalized "<group_key>__<option_key>" tokens.
-- This migration replaces the lock triggers with resync triggers so any rename
-- automatically rebuilds filter_keys for every affected product.
--
-- Idempotent: safe to re-run.

-- 1) Drop the old lock triggers + functions (if present).
DROP TRIGGER IF EXISTS filter_groups_lock_key  ON public.filter_groups;
DROP TRIGGER IF EXISTS filter_options_lock_key ON public.filter_options;
DROP FUNCTION IF EXISTS public.filter_groups_prevent_key_update()  CASCADE;
DROP FUNCTION IF EXISTS public.filter_options_prevent_key_update() CASCADE;

-- 2) Resync trigger for filter_groups.key — rebuilds filter_keys for every
--    product that has at least one option in the affected group.
CREATE OR REPLACE FUNCTION public.filter_groups_resync_on_key_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  affected RECORD;
BEGIN
  IF OLD.key IS DISTINCT FROM NEW.key THEN
    FOR affected IN
      SELECT DISTINCT pfo.product_id
        FROM public.product_filter_options pfo
        JOIN public.filter_options fo ON fo.id = pfo.filter_option_id
       WHERE fo.group_id = NEW.id
    LOOP
      PERFORM public.products_sync_filter_keys(affected.product_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS filter_groups_resync_filter_keys ON public.filter_groups;
CREATE TRIGGER filter_groups_resync_filter_keys
  AFTER UPDATE OF key ON public.filter_groups
  FOR EACH ROW EXECUTE FUNCTION public.filter_groups_resync_on_key_change();

-- 3) Resync trigger for filter_options.key — rebuilds filter_keys for every
--    product currently holding the renamed option.
CREATE OR REPLACE FUNCTION public.filter_options_resync_on_key_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  affected RECORD;
BEGIN
  IF OLD.key IS DISTINCT FROM NEW.key THEN
    FOR affected IN
      SELECT DISTINCT product_id
        FROM public.product_filter_options
       WHERE filter_option_id = NEW.id
    LOOP
      PERFORM public.products_sync_filter_keys(affected.product_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS filter_options_resync_filter_keys ON public.filter_options;
CREATE TRIGGER filter_options_resync_filter_keys
  AFTER UPDATE OF key ON public.filter_options
  FOR EACH ROW EXECUTE FUNCTION public.filter_options_resync_on_key_change();

COMMENT ON FUNCTION public.filter_groups_resync_on_key_change()  IS
  'Re-derives products.filter_keys for products affected by a filter_groups.key rename.';
COMMENT ON FUNCTION public.filter_options_resync_on_key_change() IS
  'Re-derives products.filter_keys for products affected by a filter_options.key rename.';
